const ALARM_NAME = 'checkGitHub';
const DEFAULT_INTERVAL = 15;

// Setup alarm when extension is installed
chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.sync.get(['checkInterval'], (result) => {
    const interval = result.checkInterval || DEFAULT_INTERVAL;
    setupAlarm(interval);
  });
});

// Setup alarm on startup
chrome.runtime.onStartup.addListener(() => {
  chrome.storage.sync.get(['checkInterval'], (result) => {
    const interval = result.checkInterval || DEFAULT_INTERVAL;
    setupAlarm(interval);
  });
});

function setupAlarm(intervalMinutes) {
  chrome.alarms.clear(ALARM_NAME, () => {
    chrome.alarms.create(ALARM_NAME, {
      periodInMinutes: intervalMinutes
    });
  });
}

// Listen for alarm and check GitHub
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === ALARM_NAME) {
    checkGitHubActivity();
  }
});

// Handle notification clicks
chrome.notifications.onClicked.addListener((notificationId) => {
  const url = notificationId.startsWith('http') ? notificationId : null;
  if (url) {
    chrome.tabs.create({ url });
    chrome.notifications.clear(notificationId);
  }
});

async function checkGitHubActivity() {
  try {
    const { githubToken, watchedRepos, lastCheck, filters } = await chrome.storage.sync.get([
      'githubToken',
      'watchedRepos',
      'lastCheck',
      'filters'
    ]);

    if (!githubToken || !watchedRepos || watchedRepos.length === 0) {
      return;
    }

    const enabledFilters = filters || { prs: true, issues: true, releases: true };
    const lastCheckDate = lastCheck ? new Date(lastCheck) : new Date(Date.now() - 24 * 60 * 60 * 1000);
    const newActivities = [];

    for (const repo of watchedRepos) {
      const activities = await fetchRepoActivity(repo, githubToken, lastCheckDate, enabledFilters);
      newActivities.push(...activities);
    }

    if (newActivities.length > 0) {
      await storeActivities(newActivities);
      updateBadge(newActivities.length);
      showNotifications(newActivities);
    }

    await chrome.storage.sync.set({ lastCheck: new Date().toISOString() });
  } catch (error) {
    console.error('Error checking GitHub:', error);
  }
}

async function fetchRepoActivity(repo, token, since, filters) {
  const activities = [];
  const headers = {
    'Authorization': `token ${token}`,
    'Accept': 'application/vnd.github.v3+json'
  };

  try {
    // Fetch PRs
    if (filters.prs) {
      const prsResponse = await fetch(
        `https://api.github.com/repos/${repo}/pulls?state=open&sort=created&direction=desc`,
        { headers }
      );

      if (prsResponse.ok) {
        const prs = await prsResponse.json();
        const newPrs = prs.filter(pr => new Date(pr.created_at) > since);
        activities.push(...newPrs.map(pr => ({
          type: 'pr',
          repo,
          title: pr.title,
          url: pr.html_url,
          createdAt: pr.created_at,
          author: pr.user.login
        })));
      }
    }

    // Fetch Issues
    if (filters.issues) {
      const issuesResponse = await fetch(
        `https://api.github.com/repos/${repo}/issues?state=open&sort=created&direction=desc`,
        { headers }
      );

      if (issuesResponse.ok) {
        const issues = await issuesResponse.json();
        const newIssues = issues.filter(issue => !issue.pull_request && new Date(issue.created_at) > since);
        activities.push(...newIssues.map(issue => ({
          type: 'issue',
          repo,
          title: issue.title,
          url: issue.html_url,
          createdAt: issue.created_at,
          author: issue.user.login
        })));
      }
    }

    // Fetch Releases
    if (filters.releases) {
      const releasesResponse = await fetch(
        `https://api.github.com/repos/${repo}/releases`,
        { headers }
      );

      if (releasesResponse.ok) {
        const releases = await releasesResponse.json();
        const newReleases = releases.filter(release => new Date(release.published_at) > since);
        activities.push(...newReleases.map(release => ({
          type: 'release',
          repo,
          title: release.name || release.tag_name,
          url: release.html_url,
          createdAt: release.published_at,
          author: release.author.login
        })));
      }
    }
  } catch (error) {
    console.error(`Error fetching activity for ${repo}:`, error);
  }

  return activities;
}

async function storeActivities(newActivities) {
  const { activities = [] } = await chrome.storage.local.get(['activities']);
  const updated = [...newActivities, ...activities].slice(0, 100); // Keep last 100
  await chrome.storage.local.set({ activities: updated });
}

function updateBadge(count) {
  chrome.action.setBadgeText({ text: count > 0 ? count.toString() : '' });
  chrome.action.setBadgeBackgroundColor({ color: '#0366d6' });
}

function showNotifications(activities) {
  const grouped = activities.reduce((acc, activity) => {
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
});
