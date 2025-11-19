import { createHeaders, handleApiResponse, mapActivity, filterActivitiesByDate } from './shared/github-api.js';
import { getSyncItems, getLocalItems, setLocalItem, getExcludedRepos, getToken, getFilteringSettings } from './shared/storage-helpers.js';
import { extractRepoName } from './shared/repository-utils.js';
import { safelyOpenUrl } from './shared/security.js';

const ALARM_NAME = 'checkGitHub';
const DEFAULT_INTERVAL = 15;
let alarmSetupInProgress = false; // Lock to prevent concurrent setup

if (typeof chrome !== 'undefined' && chrome.runtime) {
  // Setup alarm when extension is installed
  chrome.runtime.onInstalled.addListener(() => {
    chrome.storage.sync.get(['checkInterval'], (result) => {
      const interval = result.checkInterval || DEFAULT_INTERVAL;
      setupAlarm(interval);
      // Run an immediate check on install
      checkGitHubActivity();
    });
  });

  // Setup alarm on startup
  chrome.runtime.onStartup.addListener(() => {
    chrome.storage.sync.get(['checkInterval'], (result) => {
      const interval = result.checkInterval || DEFAULT_INTERVAL;
      setupAlarm(interval);
      // Run an immediate check on startup
      checkGitHubActivity();
    });
  });
}

function setupAlarm(intervalMinutes) {
  // Prevent concurrent alarm setup
  if (alarmSetupInProgress) {
    return;
  }

  alarmSetupInProgress = true;

  chrome.alarms.clear(ALARM_NAME, () => {
    chrome.alarms.create(ALARM_NAME, {
      periodInMinutes: intervalMinutes
    }, () => {
      alarmSetupInProgress = false;
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
    // Get token from secure local storage
    const githubToken = await getToken();

    const { watchedRepos, lastCheck, filters, notifications, mutedRepos, snoozedRepos, unmutedRepos } = await getSyncItems([
      'watchedRepos',
      'lastCheck',
      'filters',
      'notifications',
      'mutedRepos',
      'snoozedRepos',
      'unmutedRepos'
    ]);

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

    // Clean up old unmuted entries
    const activeUnmutedRepos = await cleanupOldUnmutedEntries(unmutedRepos || []);

    // Get list of repos to exclude (muted + snoozed)
    const excludedRepos = getExcludedRepos(mutedRepos || [], activeSnoozedRepos);

    const enabledFilters = filters || { prs: true, issues: true, releases: true };
    const globalLastCheck = lastCheck ? new Date(lastCheck) : new Date(Date.now() - 24 * 60 * 60 * 1000);

    // Fetch all repos in parallel for better performance
    const fetchPromises = watchedRepos.map(async (repo) => {
      const repoName = extractRepoName(repo);

      // Skip muted and snoozed repos
      if (excludedRepos.has(repoName)) {
        return [];
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

      // Use repo's unmutedAt timestamp if it exists and is newer than current checkDate
      // This prevents showing old notifications for newly unmuted repos
      const unmutedRepo = activeUnmutedRepos.find(u => u.repo === repoName);
      if (unmutedRepo && unmutedRepo.unmutedAt) {
        const unmutedDate = new Date(unmutedRepo.unmutedAt);
        if (unmutedDate > checkDate) {
          checkDate = unmutedDate;
        }
      }

      try {
        const activities = await fetchRepoActivity(repoName, githubToken, checkDate, enabledFilters);
        return activities;
      } catch (error) {
        // fetchRepoActivity should handle its own errors, but catch unexpected ones
        console.error(`[DevWatch] Unexpected error fetching ${repoName}:`, error);
        return [];
      }
    });

    // Use allSettled to ensure one failing repo doesn't break the entire check
    const results = await Promise.allSettled(fetchPromises);

    // Extract successful results and flatten activities
    const newActivities = results
      .filter(result => result.status === 'fulfilled')
      .flatMap(result => result.value);

    if (newActivities.length > 0) {
      await storeActivities(newActivities);
      await updateBadge();
      showNotifications(newActivities, notifications);
    }

    await chrome.storage.sync.set({ lastCheck: new Date().toISOString() });
  } catch (error) {
    console.error('[DevWatch] Error checking GitHub:', error);
  }
}

async function fetchRepoActivity(repo, token, since, filters) {
  const activities = [];
  const headers = createHeaders(token);

  async function fetchWithRateLimit(url) {
    try {
      // Check stored rate limit BEFORE making request
      const storedRateLimit = await getLocalItems(['rateLimit']);
      if (storedRateLimit.rateLimit) {
        const { remaining, reset } = storedRateLimit.rateLimit;

        // If rate limit is exhausted, check if it has reset
        if (remaining !== undefined && remaining <= 0) {
          const now = Date.now();
          if (reset && now < reset) {
            const minutesUntilReset = Math.ceil((reset - now) / 1000 / 60);
            const error = new Error(`Rate limit exceeded. Resets in ${minutesUntilReset} minutes.`);
            error.rateLimitExceeded = true;
            error.resetTime = reset;
            throw error;
          }
          // If reset time has passed, proceed with request
        }
      }

      const response = await fetch(url, { headers });

      // Track rate limits after successful request
      const remaining = response.headers.get('X-RateLimit-Remaining');
      const limit = response.headers.get('X-RateLimit-Limit');
      const reset = response.headers.get('X-RateLimit-Reset');

      if (remaining !== null && limit !== null) {
        try {
          await setLocalItem('rateLimit', {
            remaining: parseInt(remaining),
            limit: parseInt(limit),
            reset: parseInt(reset) * 1000
          });
        } catch (storageError) {
          // Continue even if storage fails
        }
      }

      handleApiResponse(response, repo);
      return response;
    } catch (fetchError) {
      // Re-throw rate limit errors as-is
      if (fetchError.rateLimitExceeded) {
        throw fetchError;
      }
      console.error(`Network error fetching ${url}:`, fetchError.message);
      throw new Error(`Network error: ${fetchError.message}`);
    }
  }

  async function fetchAndProcessActivities(url, activityType, dateField) {
    try {
      const response = await fetchWithRateLimit(url);

      if (!response.ok) {
        throw new Error(`API request failed: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();

      // Validate that we received an array
      if (!Array.isArray(data)) {
        return [];
      }

      // Process activities with proper error handling
      const newActivities = filterActivitiesByDate(data, since, dateField);
      return newActivities.map(item => mapActivity(item, activityType, repo));

    } catch (error) {
      console.error(`Error fetching ${activityType} for ${repo}:`, error.message);
      // Don't throw - continue with other activity types
      return [];
    }
  }

  try {
    // Fetch PRs with individual error handling
    if (filters.prs) {
      const prsUrl = `https://api.github.com/repos/${repo}/pulls?state=open&sort=created&direction=desc`;
      const prActivities = await fetchAndProcessActivities(prsUrl, 'pr', 'created_at');
      activities.push(...prActivities);
    }

    // Fetch Issues with individual error handling
    if (filters.issues) {
      const issuesUrl = `https://api.github.com/repos/${repo}/issues?state=open&sort=created&direction=desc`;
      const response = await fetchWithRateLimit(issuesUrl);

      if (response.ok) {
        const issuesData = await response.json();

        if (Array.isArray(issuesData)) {
          // Filter out pull requests and filter by date
          const issuesOnly = issuesData.filter(issue => !issue.pull_request);
          const newIssues = filterActivitiesByDate(issuesOnly, since, 'created_at');
          activities.push(...newIssues.map(issue => mapActivity(issue, 'issue', repo)));
        }
      }
    }

    // Fetch Releases with individual error handling
    if (filters.releases) {
      const releasesUrl = `https://api.github.com/repos/${repo}/releases`;
      const releaseActivities = await fetchAndProcessActivities(releasesUrl, 'release', 'published_at');
      activities.push(...releaseActivities);
    }

  } catch (error) {
    console.error(`Critical error in fetchRepoActivity for ${repo}:`, error.message);

    // Store error for user display but don't crash
    let userMessage = 'Unable to fetch repository activity';
    if (error.message.includes('401')) {
      userMessage = 'Authentication failed. Please check your GitHub token.';
    } else if (error.message.includes('403')) {
      userMessage = 'Access denied or rate limit exceeded.';
    } else if (error.message.includes('404')) {
      userMessage = 'Repository not found or access denied.';
    } else if (error.message.includes('Network error')) {
      userMessage = 'Network connection error. Please check your internet connection.';
    }

    await setLocalItem('lastError', {
      message: userMessage,
      repo,
      timestamp: Date.now()
    });

    // Return empty activities array instead of throwing
    return [];
  }

  return activities;
}

async function cleanExpiredSnoozes(snoozedRepos) {
  const now = Date.now();
  const activeSnoozes = snoozedRepos.filter(s => s.expiresAt > now);

  // Update storage if any snoozes expired
  if (activeSnoozes.length !== snoozedRepos.length) {
    try {
      await chrome.storage.sync.set({ snoozedRepos: activeSnoozes });
    } catch (error) {
      console.error('[DevWatch] Failed to clean expired snoozes:', error);
      // Continue with active snoozes even if storage write fails
    }
  }

  return activeSnoozes;
}

async function cleanupOldUnmutedEntries(unmutedRepos) {
  if (!unmutedRepos || unmutedRepos.length === 0) {
    return unmutedRepos;
  }

  // Remove entries older than 30 days to prevent storage bloat
  const thirtyDaysAgo = Date.now() - (30 * 24 * 60 * 60 * 1000);
  const recentEntries = unmutedRepos.filter(u => new Date(u.unmutedAt).getTime() > thirtyDaysAgo);

  // Update storage if we removed old entries
  if (recentEntries.length !== unmutedRepos.length) {
    try {
      await chrome.storage.sync.set({ unmutedRepos: recentEntries });
    } catch (error) {
      console.error('[DevWatch] Failed to cleanup old unmuted entries:', error);
      // Continue with filtered entries even if storage write fails
    }
  }

  return recentEntries;
}

async function storeActivities(newActivities) {
  try {
    const { activities = [] } = await getLocalItems(['activities']);
    const { mutedRepos, snoozedRepos } = await getFilteringSettings();

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

    // Keep up to 2000 items (same limit as state manager)
    const updated = filtered.slice(0, 2000);

    // Try to store, with error handling for quota exceeded
    try {
      await setLocalItem('activities', updated);
    } catch (storageError) {
      console.error('[DevWatch] Storage error:', storageError.message);

      if (storageError.message.includes('quota')) {
        // Try to free up space by reducing to 50 items
        const reduced = filtered.slice(0, 50);
        try {
          await setLocalItem('activities', reduced);
          console.warn('[DevWatch] Reduced activities to 50 due to quota limits');
        } catch (retryError) {
          // If still failing, try with just 25 items
          const minimal = filtered.slice(0, 25);
          await setLocalItem('activities', minimal);
          console.warn('[DevWatch] Reduced activities to 25 due to quota limits');
        }
      } else {
        // Re-throw non-quota errors
        throw storageError;
      }
    }
  } catch (error) {
    console.error('[DevWatch] Failed to store activities:', error);
    // Don't throw - let the check continue even if storage fails
  }
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
    // Validate request object
    if (!request || typeof request.action !== 'string') {
      sendResponse({ success: false, error: 'Invalid request' });
      return false;
    }

    // Handle different message types with consistent async/error handling
    if (request.action === 'checkNow') {
      checkGitHubActivity()
        .then(() => sendResponse({ success: true }))
        .catch((error) => {
          console.error('[DevWatch] Error in checkNow handler:', error);
          sendResponse({ success: false, error: error.message });
        });
      return true; // Required for async response
    }

    if (request.action === 'clearBadge') {
      try {
        chrome.action.setBadgeText({ text: '' });
        sendResponse({ success: true });
      } catch (error) {
        console.error('[DevWatch] Error in clearBadge handler:', error);
        sendResponse({ success: false, error: error.message });
      }
      return true; // Keep consistent async pattern
    }

    if (request.action === 'markAsRead') {
      if (!request.id) {
        sendResponse({ success: false, error: 'Missing id parameter' });
        return false;
      }

      chrome.storage.local.get(['readItems'], (result) => {
        try {
          const readItems = result.readItems || [];
          if (!readItems.includes(request.id)) {
            readItems.push(request.id);
            chrome.storage.local.set({ readItems }, () => {
              if (chrome.runtime.lastError) {
                console.error('[DevWatch] Storage error in markAsRead:', chrome.runtime.lastError);
                sendResponse({ success: false, error: chrome.runtime.lastError.message });
              } else {
                updateBadge().catch(err => console.error('[DevWatch] Badge update error:', err));
                sendResponse({ success: true });
              }
            });
          } else {
            sendResponse({ success: true });
          }
        } catch (error) {
          console.error('[DevWatch] Error in markAsRead handler:', error);
          sendResponse({ success: false, error: error.message });
        }
      });
      return true;
    }

    if (request.action === 'markAsUnread') {
      if (!request.id) {
        sendResponse({ success: false, error: 'Missing id parameter' });
        return false;
      }

      chrome.storage.local.get(['readItems'], (result) => {
        try {
          const readItems = result.readItems || [];
          const updated = readItems.filter(id => id !== request.id);
          chrome.storage.local.set({ readItems: updated }, () => {
            if (chrome.runtime.lastError) {
              console.error('[DevWatch] Storage error in markAsUnread:', chrome.runtime.lastError);
              sendResponse({ success: false, error: chrome.runtime.lastError.message });
            } else {
              updateBadge().catch(err => console.error('[DevWatch] Badge update error:', err));
              sendResponse({ success: true });
            }
          });
        } catch (error) {
          console.error('[DevWatch] Error in markAsUnread handler:', error);
          sendResponse({ success: false, error: error.message });
        }
      });
      return true;
    }

    if (request.action === 'markAllAsRead') {
      chrome.storage.local.get(['activities'], (result) => {
        try {
          const activities = result.activities || [];
          const allIds = activities.map(a => a.id);
          chrome.storage.local.set({ readItems: allIds }, () => {
            if (chrome.runtime.lastError) {
              console.error('[DevWatch] Storage error in markAllAsRead:', chrome.runtime.lastError);
              sendResponse({ success: false, error: chrome.runtime.lastError.message });
            } else {
              updateBadge().catch(err => console.error('[DevWatch] Badge update error:', err));
              sendResponse({ success: true });
            }
          });
        } catch (error) {
          console.error('[DevWatch] Error in markAllAsRead handler:', error);
          sendResponse({ success: false, error: error.message });
        }
      });
      return true;
    }

    // Unknown action
    sendResponse({ success: false, error: 'Unknown action' });
    return false;
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
    cleanExpiredSnoozes,
    cleanupOldUnmutedEntries
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
  cleanExpiredSnoozes,
  cleanupOldUnmutedEntries
};
