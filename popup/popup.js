import { applyTheme, formatDate, toggleElementVisibility } from '../shared/utils.js';
import { getSyncItem } from '../shared/storage-helpers.js';
import { CHEVRON_DOWN_ICON, SNOOZE_ICON, CHECK_ICON, createSvg } from '../shared/icons.js';

let currentFilter = 'all';
let allActivities = [];
let readItems = [];
let showArchive = false;
let searchQuery = '';
let focusMode = false;
let collapsedRepos = new Set();

if (typeof document !== 'undefined') {
  document.addEventListener('DOMContentLoaded', () => {
    loadActivities();
    setupEventListeners();
  });
}

function setupEventListeners() {
  document.getElementById('refreshBtn').addEventListener('click', handleRefresh);
  document.getElementById('darkModeBtn').addEventListener('click', toggleDarkMode);
  document.getElementById('settingsLink').addEventListener('click', (e) => {
    e.preventDefault();
    chrome.runtime.openOptionsPage();
  });

  // Toolbar buttons
  document.getElementById('searchBtn').addEventListener('click', toggleSearch);
  document.getElementById('focusBtn').addEventListener('click', toggleFocus);
  document.getElementById('archiveBtn').addEventListener('click', toggleArchive);

  // Search input
  document.getElementById('searchInput').addEventListener('input', (e) => {
    searchQuery = e.target.value.toLowerCase();
    renderActivities();
  });

  document.querySelectorAll('.filter-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
      e.target.classList.add('active');
      currentFilter = e.target.dataset.type;
      renderActivities();
    });
  });

  // Load theme preference
  getSyncItem('theme', 'system').then(theme => {
    applyTheme(theme);
    updateDarkModeIcon();
  });
}

async function toggleDarkMode() {
  // Cycle through: light -> dark -> system
  const currentTheme = await getSyncItem('theme', 'system');
  let newTheme;

  if (currentTheme === 'light') {
    newTheme = 'dark';
  } else if (currentTheme === 'dark') {
    newTheme = 'system';
  } else {
    newTheme = 'light';
  }

  chrome.storage.sync.set({ theme: newTheme });
  applyTheme(newTheme);
  updateDarkModeIcon();
}

function updateDarkModeIcon() {
  const btn = document.getElementById('darkModeBtn');
  const moonIcon = btn.querySelector('.moon-icon');
  const sunIcon = btn.querySelector('.sun-icon');

  if (document.body.classList.contains('dark-mode')) {
    toggleElementVisibility(sunIcon, moonIcon);
  } else {
    toggleElementVisibility(moonIcon, sunIcon);
  }
}

async function handleRefresh() {
  const btn = document.getElementById('refreshBtn');
  btn.disabled = true;
  btn.classList.add('spinning');

  try {
    await chrome.runtime.sendMessage({ action: 'checkNow' });
    await loadActivities();
  } catch (error) {
    console.error('Error refreshing:', error);
  } finally {
    btn.disabled = false;
    btn.classList.remove('spinning');
  }
}

async function loadActivities() {
  const list = document.getElementById('activityList');
  list.innerHTML = '<div class="loading">Loading...</div>';

  try {
    const data = await chrome.storage.local.get(['activities', 'readItems', 'rateLimit', 'lastError', 'collapsedRepos']);
    const settings = await chrome.storage.sync.get(['mutedRepos', 'snoozedRepos']);

    // Load collapsed state
    collapsedRepos = new Set(data.collapsedRepos || []);

    // Filter out muted and snoozed repos
    const mutedRepos = settings.mutedRepos || [];
    const snoozedRepos = settings.snoozedRepos || [];
    const now = Date.now();
    const activeSnoozedRepos = snoozedRepos.filter(s => s.expiresAt > now).map(s => s.repo);
    const excludedRepos = new Set([...mutedRepos, ...activeSnoozedRepos]);

    allActivities = (data.activities || []).filter(a => !excludedRepos.has(a.repo));
    readItems = data.readItems || [];
    renderActivities();
    updateRateLimit(data.rateLimit);
    showError(data.lastError);
  } catch (error) {
    console.error('Error loading activities:', error);
    list.innerHTML = '<div class="empty-state"><p>Error loading activities</p></div>';
  }
}

function updateRateLimit(rateLimit) {
  const rateLimitInfo = document.getElementById('rateLimitInfo');

  // Only show rate limit when remaining <= 1000
  if (!rateLimit || rateLimit.remaining > 1000) {
    rateLimitInfo.textContent = '';
    rateLimitInfo.style.display = 'none';
    return;
  }

  // Show in yellow warning when low
  rateLimitInfo.textContent = `⚠️ ${rateLimit.remaining}/${rateLimit.limit} API calls remaining`;
  rateLimitInfo.style.color = '#f0ad4e'; // Yellow/orange warning color
  rateLimitInfo.style.display = 'block';

  // Show when rate limit resets
  if (rateLimit.reset) {
    const resetDate = new Date(rateLimit.reset);
    const now = new Date();
    const minutesUntilReset = Math.ceil((resetDate - now) / 60000);

    if (minutesUntilReset > 0) {
      rateLimitInfo.textContent += ` (resets in ${minutesUntilReset}m)`;
    }
  }
}

function showError(lastError) {
  const errorMsg = document.getElementById('errorMessage');
  if (!lastError || Date.now() - lastError.timestamp > 60000) {
    errorMsg.style.display = 'none';
    return;
  }

  errorMsg.textContent = `Error: ${lastError.message}${lastError.repo ? ` (${lastError.repo})` : ''}`;
  errorMsg.style.display = 'block';

  setTimeout(() => {
    errorMsg.style.display = 'none';
  }, 10000);
}

function renderActivities() {
  const list = document.getElementById('activityList');

  let filtered = allActivities;

  // Filter by type
  if (currentFilter !== 'all') {
    filtered = filtered.filter(a => a.type === currentFilter);
  }

  // Filter by archive (show/hide read items)
  if (!showArchive) {
    filtered = filtered.filter(a => !readItems.includes(a.id));
  }

  // Filter by search query
  if (searchQuery) {
    filtered = filtered.filter(a =>
      a.title.toLowerCase().includes(searchQuery) ||
      a.repo.toLowerCase().includes(searchQuery) ||
      a.author.toLowerCase().includes(searchQuery)
    );
  }

  // Filter by focus mode (only user's own activity)
  // TODO: Implement proper focus filtering based on GitHub username
  // For now, focus mode is a placeholder that doesn't filter
  // Future: Store and compare against user's GitHub username

  if (filtered.length === 0) {
    let emptyMessage = 'No activity';
    if (!showArchive) emptyMessage = 'No unread activity';
    if (searchQuery) emptyMessage = 'No matches found';

    list.innerHTML = `
      <div class="empty-state">
        <p>${emptyMessage}</p>
        <small>Check your settings to add repositories</small>
      </div>
    `;
    return;
  }

  const unreadCount = filtered.filter(a => !readItems.includes(a.id)).length;
  const repoCount = Object.keys(groupByRepo(filtered)).length;
  const allCollapsed = repoCount > 0 && collapsedRepos.size === repoCount;

  const header = `
    <div class="list-header">
      <span>${unreadCount > 0 ? `${unreadCount} unread` : ''}</span>
      <div class="header-actions">
        ${repoCount > 1 ? `<button id="collapseAllBtn" class="text-btn">${allCollapsed ? 'Expand all' : 'Collapse all'}</button>` : ''}
        ${unreadCount > 0 ? `<button id="markAllReadBtn" class="text-btn">Mark all as read</button>` : ''}
      </div>
    </div>
  `;

  // Group activities by repository
  const grouped = groupByRepo(filtered);

  let htmlContent = header;

  // Render each repo group
  Object.keys(grouped).forEach(repo => {
    const activities = grouped[repo];
    const repoUnreadCount = activities.filter(a => !readItems.includes(a.id)).length;
    const isCollapsed = collapsedRepos.has(repo);

    htmlContent += `
      <div class="repo-group-header" data-repo="${repo}">
        <div class="repo-group-title">
          <button class="repo-collapse-btn" data-repo="${repo}" title="${isCollapsed ? 'Expand' : 'Collapse'}">
            ${createSvg(CHEVRON_DOWN_ICON, 12, 12, `chevron ${isCollapsed ? 'collapsed' : ''}`)}
          </button>
          <span class="repo-group-name">${repo}</span>
        </div>
        <div class="repo-group-actions">
          ${repoUnreadCount > 0 ? `<span class="repo-unread-count">${repoUnreadCount}</span>` : ''}
          <button class="repo-snooze-btn" data-repo="${repo}" title="Snooze this repository">
            ${createSvg(SNOOZE_ICON, 14, 14)}
          </button>
        </div>
      </div>
      <div class="repo-activities ${isCollapsed ? 'collapsed' : ''}" data-repo="${repo}">
    `;

    htmlContent += activities.map(activity => renderActivityItem(activity)).join('');
    htmlContent += '</div>';
  });

  list.innerHTML = htmlContent;

  // Event listeners
  document.getElementById('markAllReadBtn')?.addEventListener('click', handleMarkAllRead);
  document.getElementById('collapseAllBtn')?.addEventListener('click', handleCollapseAll);

  // Collapse button listeners
  list.querySelectorAll('.repo-collapse-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const repo = btn.dataset.repo;
      toggleRepoCollapse(repo);
    });
  });

  // Snooze button listeners
  list.querySelectorAll('.repo-snooze-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const repo = btn.dataset.repo;
      snoozeRepo(repo);
    });
  });

  list.querySelectorAll('.activity-item').forEach(item => {
    const content = item.querySelector('.activity-content');
    content.addEventListener('click', () => {
      const id = item.dataset.id;
      const url = item.dataset.url;
      markAsRead(id);
      chrome.tabs.create({ url });
    });

    item.querySelectorAll('.action-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const action = btn.dataset.action;
        const id = item.dataset.id;

        if (action === 'mark-read') {
          markAsReadWithAnimation(id, item);
        }
      });
    });
  });
}

function markAsReadWithAnimation(id, itemElement) {
  // Add removing animation class
  itemElement.classList.add('removing');

  // Wait for animation to complete, then mark as read
  setTimeout(() => {
    markAsRead(id);
    renderActivities();
  }, 300); // Match CSS transition duration
}

function toggleSearch() {
  const searchBox = document.getElementById('searchBox');
  const searchBtn = document.getElementById('searchBtn');
  const searchInput = document.getElementById('searchInput');

  if (searchBox.style.display === 'none' || !searchBox.style.display) {
    searchBox.style.display = 'block';
    searchBtn.classList.add('active');
    searchInput.focus();
  } else {
    searchBox.style.display = 'none';
    searchBtn.classList.remove('active');
    searchQuery = '';
    searchInput.value = '';
    renderActivities();
  }
}

function toggleFocus() {
  const focusBtn = document.getElementById('focusBtn');
  focusMode = !focusMode;
  focusBtn.classList.toggle('active', focusMode);
  renderActivities();
}

function toggleArchive() {
  const archiveBtn = document.getElementById('archiveBtn');
  showArchive = !showArchive;
  archiveBtn.classList.toggle('active', showArchive);
  renderActivities();
}

function renderActivityItem(activity) {
  const isRead = readItems.includes(activity.id);

  return `
    <div class="activity-item ${isRead ? 'read' : 'unread'}" data-id="${activity.id}" data-url="${activity.url}">
      <img src="${activity.authorAvatar}" class="activity-avatar" alt="${activity.author}">
      <div class="activity-content">
        <div class="activity-header">
          <span class="activity-type ${activity.type}">${activity.type}</span>
          <span class="activity-repo">${activity.repo}</span>
        </div>
        <div class="activity-title">${activity.title}</div>
        <div class="activity-meta">
          by ${activity.author} • ${formatDate(activity.createdAt)}
        </div>
      </div>
      <div class="activity-actions">
        <button class="action-btn mark-read-btn" data-action="mark-read" title="Mark as done">
          ${createSvg(CHECK_ICON, 16, 16)}
        </button>
      </div>
    </div>
  `;
}

function groupByTime(activities) {
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterdayStart = new Date(todayStart - 24 * 60 * 60 * 1000);
  const weekStart = new Date(todayStart - 7 * 24 * 60 * 60 * 1000);

  const groups = {
    today: [],
    yesterday: [],
    thisWeek: [],
    older: []
  };

  activities.forEach(activity => {
    const date = new Date(activity.createdAt);
    if (date >= todayStart) {
      groups.today.push(activity);
    } else if (date >= yesterdayStart) {
      groups.yesterday.push(activity);
    } else if (date >= weekStart) {
      groups.thisWeek.push(activity);
    } else {
      groups.older.push(activity);
    }
  });

  return groups;
}

function groupByRepo(activities) {
  const groups = {};

  activities.forEach(activity => {
    if (!groups[activity.repo]) {
      groups[activity.repo] = [];
    }
    groups[activity.repo].push(activity);
  });

  // Sort repos by most recent activity
  const sortedGroups = {};
  Object.keys(groups)
    .sort((a, b) => {
      const latestA = new Date(groups[a][0].createdAt);
      const latestB = new Date(groups[b][0].createdAt);
      return latestB - latestA;
    })
    .forEach(repo => {
      // Sort activities within each repo by newest first
      groups[repo].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
      sortedGroups[repo] = groups[repo];
    });

  return sortedGroups;
}

async function toggleRepoCollapse(repo) {
  if (collapsedRepos.has(repo)) {
    collapsedRepos.delete(repo);
  } else {
    collapsedRepos.add(repo);
  }

  // Save collapsed state
  await chrome.storage.local.set({ collapsedRepos: Array.from(collapsedRepos) });

  // Re-render
  renderActivities();
}

async function snoozeRepo(repo) {
  try {
    // Get snooze duration from settings
    const settings = await chrome.storage.sync.get(['snoozeHours', 'snoozedRepos']);
    const snoozeHours = settings.snoozeHours || 1;
    const snoozedRepos = settings.snoozedRepos || [];

    // Calculate expiration time
    const expiresAt = Date.now() + (snoozeHours * 60 * 60 * 1000);

    // Check if repo is already snoozed and update, otherwise add new
    const existingIndex = snoozedRepos.findIndex(s => s.repo === repo);
    if (existingIndex >= 0) {
      snoozedRepos[existingIndex].expiresAt = expiresAt;
    } else {
      snoozedRepos.push({ repo, expiresAt });
    }

    // Save to storage
    await chrome.storage.sync.set({ snoozedRepos });

    // Reload activities to reflect the snooze
    await loadActivities();

    // Show confirmation
    showSnoozeMessage(repo, snoozeHours);
  } catch (error) {
    console.error('Error snoozing repo:', error);
  }
}

function showSnoozeMessage(repo, hours) {
  const errorMsg = document.getElementById('errorMessage');
  errorMsg.textContent = `${repo} snoozed for ${hours} hour${hours > 1 ? 's' : ''}`;
  errorMsg.style.display = 'block';
  errorMsg.style.background = 'var(--success-bg)';
  errorMsg.style.color = 'var(--success-text)';

  setTimeout(() => {
    errorMsg.style.display = 'none';
    errorMsg.style.background = '';
    errorMsg.style.color = '';
  }, 3000);
}

async function toggleReadState(id) {
  const isRead = readItems.includes(id);
  const action = isRead ? 'markAsUnread' : 'markAsRead';

  try {
    await chrome.runtime.sendMessage({ action, id });
    if (isRead) {
      readItems = readItems.filter(item => item !== id);
    } else {
      readItems.push(id);
    }
    renderActivities();
  } catch (error) {
    console.error('Error toggling read state:', error);
  }
}

async function markAsRead(id) {
  if (readItems.includes(id)) return;

  try {
    await chrome.runtime.sendMessage({ action: 'markAsRead', id });
    readItems.push(id);
  } catch (error) {
    console.error('Error marking as read:', error);
  }
}

async function handleMarkAllRead() {
  try {
    await chrome.runtime.sendMessage({ action: 'markAllAsRead' });
    readItems = allActivities.map(a => a.id);
    renderActivities();
  } catch (error) {
    console.error('Error marking all as read:', error);
  }
}

async function handleCollapseAll() {
  const grouped = groupByRepo(allActivities);
  const allRepos = Object.keys(grouped);
  const allCollapsed = collapsedRepos.size === allRepos.length;

  if (allCollapsed) {
    // Expand all
    collapsedRepos.clear();
  } else {
    // Collapse all
    allRepos.forEach(repo => collapsedRepos.add(repo));
  }

  // Save and re-render
  await chrome.storage.local.set({ collapsedRepos: Array.from(collapsedRepos) });
  renderActivities();
}

// Export functions for testing
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    loadActivities,
    renderActivities,
    groupByTime,
    groupByRepo,
    toggleRepoCollapse,
    snoozeRepo,
    toggleDarkMode,
    updateDarkModeIcon,
    updateRateLimit,
    showError,
    toggleReadState,
    markAsRead,
    markAsReadWithAnimation,
    handleMarkAllRead,
    handleCollapseAll,
    toggleSearch,
    toggleFocus,
    toggleArchive
  };
}

// ES6 exports for tests
export {
  loadActivities,
  renderActivities,
  groupByTime,
  groupByRepo,
  toggleRepoCollapse,
  snoozeRepo,
  toggleDarkMode,
  updateDarkModeIcon,
  updateRateLimit,
  showError,
  toggleReadState,
  markAsRead,
  markAsReadWithAnimation,
  handleMarkAllRead,
  handleCollapseAll,
  toggleSearch,
  toggleFocus,
  toggleArchive
};
