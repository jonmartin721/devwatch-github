import { createHeaders, handleApiResponse, mapActivity, filterActivitiesByDate } from './shared/github-api.js';
import { getSyncItems, getLocalItems, setLocalItem, getExcludedRepos, getToken } from './shared/storage-helpers.js';
import { extractRepoName } from './shared/utils.js';
import { safelyOpenUrl } from './shared/security.js';

const ALARM_NAME = 'checkGitHub';
const DEFAULT_INTERVAL = 15;

if (typeof chrome !== 'undefined' && chrome.runtime) {
  // Setup alarm when extension is installed
  chrome.runtime.onInstalled.addListener(() => {
    console.log('[DevWatch] Extension installed, setting up alarm and running initial check...');
    chrome.storage.sync.get(['checkInterval'], (result) => {
      const interval = result.checkInterval || DEFAULT_INTERVAL;
      setupAlarm(interval);
      // Run an immediate check on install
      checkGitHubActivity();
    });
  });

  // Setup alarm on startup
  chrome.runtime.onStartup.addListener(() => {
    console.log('[DevWatch] Extension started, setting up alarm and running initial check...');
    chrome.storage.sync.get(['checkInterval'], (result) => {
      const interval = result.checkInterval || DEFAULT_INTERVAL;
      setupAlarm(interval);
      // Run an immediate check on startup
      checkGitHubActivity();
    });
  });
}

function setupAlarm(intervalMinutes) {
  chrome.alarms.clear(ALARM_NAME, () => {
    chrome.alarms.create(ALARM_NAME, {
      periodInMinutes: intervalMinutes
    });
  });
}

if (typeof chrome !== 'undefined' && chrome.alarms) {
  // Listen for alarm and check GitHub
  chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === ALARM_NAME) {
      checkGitHubActivity();
    }
  });
}

if (typeof chrome !== 'undefined' && chrome.notifications) {
  // Handle notification clicks
  chrome.notifications.onClicked.addListener(async (notificationId) => {
    const url = notificationId.startsWith('http') ? notificationId : null;
    if (url) {
      // Validate URL before opening to prevent malicious URLs
      const opened = await safelyOpenUrl(url);
      if (opened) {
        chrome.notifications.clear(notificationId);
      } else {
        console.error('Failed to open notification URL - validation failed:', url);
      }
    }
  });
}

async function checkGitHubActivity() {
  try {
    console.log('[DevWatch] Starting GitHub activity check...');

    // Get token from secure local storage
    const githubToken = await getToken();

    const { watchedRepos, lastCheck, filters, notifications, mutedRepos, snoozedRepos } = await getSyncItems([
      'watchedRepos',
      'lastCheck',
      'filters',
      'notifications',
      'mutedRepos',
      'snoozedRepos'
    ]);

    console.log('[DevWatch] Token present:', !!githubToken);
    console.log('[DevWatch] Watched repos:', watchedRepos?.length || 0);

    if (!githubToken) {
      console.warn('[DevWatch] No GitHub token found. Please add a token in settings.');
      return;
    }

    if (!watchedRepos || watchedRepos.length === 0) {
      console.warn('[DevWatch] No repositories being watched. Please add repos in settings.');
      return;
    }

    // Clean up expired snoozes
    const activeSnoozedRepos = await cleanExpiredSnoozes(snoozedRepos || []);

    // Get list of repos to exclude (muted + snoozed)
    const excludedRepos = getExcludedRepos(mutedRepos || [], activeSnoozedRepos);

    const enabledFilters = filters || { prs: true, issues: true, releases: true };
    const globalLastCheck = lastCheck ? new Date(lastCheck) : new Date(Date.now() - 24 * 60 * 60 * 1000);
    const newActivities = [];

    for (const repo of watchedRepos) {
      // Handle both string format (legacy) and object format (new)
      const repoName = extractRepoName(repo);

      // Skip muted and snoozed repos
      if (excludedRepos.has(repoName)) {
        console.log(`[DevWatch] Skipping ${repoName} (muted or snoozed)`);
        continue;
      }

      // Use repo's addedAt timestamp if it exists and is newer than global lastCheck
      // This prevents showing old notifications for newly added repos
      let checkDate = globalLastCheck;
      if (typeof repo === 'object' && repo.addedAt) {
        const addedDate = new Date(repo.addedAt);
        if (addedDate > globalLastCheck) {
          checkDate = addedDate;
        }
      }

      console.log(`[DevWatch] Fetching activity for ${repoName} since ${checkDate.toISOString()}`);
      const activities = await fetchRepoActivity(repoName, githubToken, checkDate, enabledFilters);
      console.log(`[DevWatch] Found ${activities.length} new activities in ${repoName}`);
      newActivities.push(...activities);
    }

    console.log(`[DevWatch] Total new activities: ${newActivities.length}`);

    if (newActivities.length > 0) {
      await storeActivities(newActivities);
      await updateBadge();
      showNotifications(newActivities, notifications);
    }

    await chrome.storage.sync.set({ lastCheck: new Date().toISOString() });
    console.log('[DevWatch] Check complete');
  } catch (error) {
    console.error('[DevWatch] Error checking GitHub:', error);
  }
}

async function fetchRepoActivity(repo, token, since, filters) {
  const activities = [];
  const headers = createHeaders(token);

  async function fetchWithRateLimit(url) {
    const response = await fetch(url, { headers });

    // Track rate limits
    const remaining = response.headers.get('X-RateLimit-Remaining');
    const limit = response.headers.get('X-RateLimit-Limit');
    const reset = response.headers.get('X-RateLimit-Reset');

    if (remaining && limit) {
      await setLocalItem('rateLimit', {
        remaining: parseInt(remaining),
        limit: parseInt(limit),
        reset: parseInt(reset) * 1000
      });
    }

    handleApiResponse(response, repo);
    return response;
  }

  try {
    // Fetch PRs
    if (filters.prs) {
      const prsResponse = await fetchWithRateLimit(
        `https://api.github.com/repos/${repo}/pulls?state=open&sort=created&direction=desc`
      );

      const prs = await prsResponse.json();
      const newPrs = filterActivitiesByDate(prs, since, 'created_at');
      activities.push(...newPrs.map(pr => mapActivity(pr, 'pr', repo)));
    }

    // Fetch Issues
    if (filters.issues) {
      const issuesResponse = await fetchWithRateLimit(
        `https://api.github.com/repos/${repo}/issues?state=open&sort=created&direction=desc`
      );

      const issues = await issuesResponse.json();
      const newIssues = issues.filter(issue => !issue.pull_request && new Date(issue.created_at) > since);
      activities.push(...newIssues.map(issue => mapActivity(issue, 'issue', repo)));
    }

    // Fetch Releases
    if (filters.releases) {
      const releasesResponse = await fetchWithRateLimit(
        `https://api.github.com/repos/${repo}/releases`
      );

      const releases = await releasesResponse.json();
      const newReleases = filterActivitiesByDate(releases, since, 'published_at');
      activities.push(...newReleases.map(release => mapActivity(release, 'release', repo)));
    }
  } catch (error) {
    console.error(`Error fetching activity for ${repo}:`, error.message);
    await setLocalItem('lastError', {
      message: error.message,
      repo,
      timestamp: Date.now(),
      // Store response status if available for better error handling
      status: error.response?.status,
      statusText: error.response?.statusText
    });
    throw error;
  }

  return activities;
}

async function cleanExpiredSnoozes(snoozedRepos) {
  const now = Date.now();
  const activeSnoozes = snoozedRepos.filter(s => s.expiresAt > now);

  // Update storage if any snoozes expired
  if (activeSnoozes.length !== snoozedRepos.length) {
    await chrome.storage.sync.set({ snoozedRepos: activeSnoozes });
  }

  return activeSnoozes;
}

async function storeActivities(newActivities) {
  const { activities = [] } = await getLocalItems(['activities']);
  const { mutedRepos = [], snoozedRepos = [] } = await getSyncItems(['mutedRepos', 'snoozedRepos']);

  // Clean up expired snoozes
  const activeSnoozedRepos = await cleanExpiredSnoozes(snoozedRepos);

  // Get list of repos to exclude
  const excludedRepos = getExcludedRepos(mutedRepos, activeSnoozedRepos);

  // Merge new activities, avoiding duplicates
  const existingIds = new Set(activities.map(a => a.id));
  const uniqueNew = newActivities.filter(a => !existingIds.has(a.id));

  // Filter out activities from excluded repos
  const allActivities = [...uniqueNew, ...activities];
  const filtered = allActivities.filter(a => !excludedRepos.has(a.repo));

  const updated = filtered.slice(0, 100);
  await setLocalItem('activities', updated);
}

async function updateBadge() {
  const { readItems = [], activities = [] } = await getLocalItems(['readItems', 'activities']);

  const unreadCount = activities.filter(a => !readItems.includes(a.id)).length;

  chrome.action.setBadgeText({ text: unreadCount > 0 ? unreadCount.toString() : '' });
  chrome.action.setBadgeBackgroundColor({ color: '#0366d6' });
}

function showNotifications(activities, notificationSettings = {}) {
  // Default to enabled if not specified
  const settings = {
    prs: notificationSettings.prs !== false,
    issues: notificationSettings.issues !== false,
    releases: notificationSettings.releases !== false
  };

  // Filter activities based on notification preferences
  const filteredActivities = activities.filter(activity => {
    if (activity.type === 'pr' && !settings.prs) return false;
    if (activity.type === 'issue' && !settings.issues) return false;
    if (activity.type === 'release' && !settings.releases) return false;
    return true;
  });

  // Return early if no activities to notify about
  if (filteredActivities.length === 0) {
    return;
  }

  const grouped = filteredActivities.reduce((acc, activity) => {
    if (!acc[activity.repo]) {
      acc[activity.repo] = [];
    }
    acc[activity.repo].push(activity);
    return acc;
  }, {});

  Object.entries(grouped).forEach(([repo, repoActivities]) => {
    const typeCount = {};
    repoActivities.forEach(a => {
      typeCount[a.type] = (typeCount[a.type] || 0) + 1;
    });

    const message = Object.entries(typeCount)
      .map(([type, count]) => `${count} new ${type}${count > 1 ? 's' : ''}`)
      .join(', ');

    chrome.notifications.create(repoActivities[0].url, {
      type: 'basic',
      iconUrl: 'icons/icon128.png',
      title: repo,
      message: message,
      priority: 1
    });
  });
}

if (typeof chrome !== 'undefined' && chrome.runtime) {
  // Allow manual check from popup
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'checkNow') {
      checkGitHubActivity().then(() => sendResponse({ success: true }));
      return true;
    }

    if (request.action === 'clearBadge') {
      chrome.action.setBadgeText({ text: '' });
      sendResponse({ success: true });
    }

    if (request.action === 'markAsRead') {
      chrome.storage.local.get(['readItems'], (result) => {
        const readItems = result.readItems || [];
        if (!readItems.includes(request.id)) {
          readItems.push(request.id);
          chrome.storage.local.set({ readItems }, () => {
            updateBadge();
            sendResponse({ success: true });
          });
        } else {
          sendResponse({ success: true });
        }
      });
      return true;
    }

    if (request.action === 'markAsUnread') {
      chrome.storage.local.get(['readItems'], (result) => {
        const readItems = result.readItems || [];
        const updated = readItems.filter(id => id !== request.id);
        chrome.storage.local.set({ readItems: updated }, () => {
          updateBadge();
          sendResponse({ success: true });
        });
      });
      return true;
    }

    if (request.action === 'markAllAsRead') {
      chrome.storage.local.get(['activities'], (result) => {
        const activities = result.activities || [];
        const allIds = activities.map(a => a.id);
        chrome.storage.local.set({ readItems: allIds }, () => {
          updateBadge();
          sendResponse({ success: true });
        });
      });
      return true;
    }
  });
}

// Export functions for testing
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    setupAlarm,
    checkGitHubActivity,
    fetchRepoActivity,
    storeActivities,
    updateBadge,
    showNotifications,
    cleanExpiredSnoozes
  };
}

// ES6 exports for tests
export {
  setupAlarm,
  checkGitHubActivity,
  fetchRepoActivity,
  storeActivities,
  updateBadge,
  showNotifications,
  cleanExpiredSnoozes
};
