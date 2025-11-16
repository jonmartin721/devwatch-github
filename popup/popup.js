import { applyTheme, formatDate, toggleElementVisibility } from '../shared/utils.js';
import { getSyncItem } from '../shared/storage-helpers.js';
import { CHEVRON_DOWN_ICON, SNOOZE_ICON, CHECK_ICON, createSvg } from '../shared/icons.js';
import { escapeHtml, sanitizeImageUrl } from '../shared/sanitize.js';
import { safelyOpenUrl } from '../shared/security.js';
import { showError, clearError } from '../shared/error-handler.js';
import {
  isOffline,
  showOfflineStatus,
  setupOfflineListeners,
  getCachedData,
  cacheForOffline,
  showCachedActivities
} from '../shared/offline-manager.js';

let currentFilter = 'all';
let allActivities = [];
let readItems = [];
let showArchive = false;
let searchQuery = '';
let collapsedRepos = new Set();
let pinnedRepos = [];

if (typeof document !== 'undefined') {
  document.addEventListener('DOMContentLoaded', () => {
    loadActivities();
    setupEventListeners();
    setupKeyboardNavigation();
    setupOfflineHandlers();
  });
}

function setupEventListeners() {
  document.getElementById('refreshBtn').addEventListener('click', handleRefresh);
  document.getElementById('darkModeBtn').addEventListener('click', toggleDarkMode);
  document.getElementById('settingsLink').addEventListener('click', () => {
    chrome.runtime.openOptionsPage();
  });
  document.getElementById('helpBtn').addEventListener('click', () => {
    chrome.tabs.create({ url: 'https://github.com/jonmartin721/devwatch-github#readme' });
  });

  // Toolbar buttons
  document.getElementById('searchBtn').addEventListener('click', toggleSearch);
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
  getSyncItem('theme', 'light').then(theme => {
    applyTheme(theme);
    updateDarkModeIcon();
  });
}

async function toggleDarkMode() {
  // Toggle between: light -> dark -> light
  const currentTheme = await getSyncItem('theme', 'light');
  let newTheme;

  if (currentTheme === 'light') {
    newTheme = 'dark';
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
    clearError('errorMessage');
    await chrome.runtime.sendMessage({ action: 'checkNow' });
    await loadActivities();
  } catch (error) {
    showError('errorMessage', error, null, { action: 'refresh activities' }, 5000);
  } finally {
    btn.disabled = false;
    btn.classList.remove('spinning');

    // Add completion animation
    btn.classList.add('refresh-complete');
    setTimeout(() => {
      btn.classList.remove('refresh-complete');
    }, 400);
  }
}

async function loadActivities() {
  const list = document.getElementById('activityList');

  // Check offline status first
  if (isOffline()) {
    list.innerHTML = '<div class="loading" role="status" aria-live="polite">Loading cached data...</div>';
    showOfflineStatus('errorMessage', true);

    try {
      const cachedActivities = await getCachedData('activities_cache');
      const cachedReadItems = await getCachedData('readItems_cache');
      const settings = await chrome.storage.sync.get(['mutedRepos', 'snoozedRepos']);

      if (cachedActivities) {
        // Filter out muted and snoozed repos
        const mutedRepos = settings.mutedRepos || [];
        const snoozedRepos = settings.snoozedRepos || [];
        const now = Date.now();
        const activeSnoozedRepos = snoozedRepos.filter(s => s.expiresAt > now).map(s => s.repo);
        const excludedRepos = new Set([...mutedRepos, ...activeSnoozedRepos]);

        allActivities = cachedActivities.filter(a => !excludedRepos.has(a.repo));
        readItems = cachedReadItems || [];

        // Show cached indicator
        showCachedActivities(allActivities);
        renderActivities();
        return;
      } else {
        list.innerHTML = `
          <div class="empty-state">
            <div class="offline-empty">
              <div class="offline-icon">📡</div>
              <p>No cached data available</p>
              <small>Check your connection and try again</small>
            </div>
          </div>
        `;
        return;
      }
    } catch (error) {
      list.innerHTML = '<div class="empty-state"><p>Unable to load cached data</p></div>';
      showError('errorMessage', error, null, { action: 'load cached activities' }, 0);
      return;
    }
  }

  // Online mode - proceed normally
  list.innerHTML = '<div class="loading" role="status" aria-live="polite">Loading...</div>';
  showOfflineStatus('errorMessage', false);
  clearError('errorMessage');

  try {
    const data = await chrome.storage.local.get(['activities', 'readItems', 'rateLimit', 'lastError', 'collapsedRepos']);
    const settings = await chrome.storage.sync.get(['mutedRepos', 'snoozedRepos', 'pinnedRepos']);

    // Load collapsed state
    collapsedRepos = new Set(data.collapsedRepos || []);
    pinnedRepos = settings.pinnedRepos || [];

    // Filter out muted and snoozed repos
    const mutedRepos = settings.mutedRepos || [];
    const snoozedRepos = settings.snoozedRepos || [];
    const now = Date.now();
    const activeSnoozedRepos = snoozedRepos.filter(s => s.expiresAt > now).map(s => s.repo);
    const excludedRepos = new Set([...mutedRepos, ...activeSnoozedRepos]);

    allActivities = (data.activities || []).filter(a => !excludedRepos.has(a.repo));
    readItems = data.readItems || [];

    // Cache the loaded data for offline use
    await cacheForOffline('activities_cache', allActivities, 3600000); // 1 hour
    await cacheForOffline('readItems_cache', readItems, 3600000);

    renderActivities();
    updateRateLimit(data.rateLimit);
    updateLastUpdated();
    if (data.lastError) {
      showStoredError(data.lastError);
    }
  } catch (error) {
    list.innerHTML = '<div class="empty-state"><p>Unable to load activities</p></div>';
    showError('errorMessage', error, null, { action: 'load activities' }, 0);
  }
}

function updateLastUpdated() {
  const now = new Date();
  const timeString = now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  document.getElementById('lastUpdated').textContent = `Updated ${timeString}`;
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

function showStoredError(lastError) {
  if (!lastError || Date.now() - lastError.timestamp > 60000) {
    clearError('errorMessage');
    return;
  }

  // Create a mock response object if we have status info
  let mockResponse = null;
  if (lastError.status) {
    mockResponse = {
      status: lastError.status,
      statusText: lastError.statusText || ''
    };
  }

  // Use the enhanced error notification system
  const error = new Error(lastError.message);
  const context = lastError.repo ? { repo: lastError.repo } : {};
  showError('errorMessage', error, mockResponse, context, 10000);
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
    const isPinned = pinnedRepos.includes(repo);

    htmlContent += `
      <div class="repo-group-header ${isPinned ? 'pinned' : ''}" data-repo="${repo}">
        <div class="repo-group-title">
          <button class="repo-collapse-btn" data-repo="${repo}" title="${isCollapsed ? 'Expand' : 'Collapse'}" aria-label="${isCollapsed ? 'Expand' : 'Collapse'} ${repo} activities">
            ${createSvg(CHEVRON_DOWN_ICON, 12, 12, `chevron ${isCollapsed ? 'collapsed' : ''}`)}
          </button>
          <span class="repo-group-name">${repo}</span>
        </div>
        <div class="repo-group-actions">
          ${repoUnreadCount > 0 ? `<span class="repo-unread-count">${repoUnreadCount}</span>` : ''}
          <button class="repo-snooze-btn" data-repo="${repo}" title="Snooze this repository" aria-label="Snooze ${repo} repository">
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

  // Header click listeners for expand/collapse
  list.querySelectorAll('.repo-group-header').forEach(header => {
    header.addEventListener('click', (e) => {
      // Don't trigger if clicking on buttons
      if (e.target.closest('.repo-snooze-btn')) {
        return;
      }

      const repo = header.dataset.repo;
      toggleRepoCollapse(repo);
    });
  });

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
    content.addEventListener('click', async () => {
      const id = item.dataset.id;
      const url = item.dataset.url;
      markAsRead(id);

      // Validate URL before opening to prevent javascript: and data: URLs
      const opened = await safelyOpenUrl(url);
      if (!opened) {
        showError('errorMessage', new Error('Invalid URL detected'), null, { action: 'open link' }, 3000);
      }
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

function toggleArchive() {
  const archiveBtn = document.getElementById('archiveBtn');
  showArchive = !showArchive;
  archiveBtn.classList.toggle('active', showArchive);
  renderActivities();
}

function renderActivityItem(activity) {
  const isRead = readItems.includes(activity.id);

  // Sanitize all user-generated content to prevent XSS
  const sanitizedTitle = escapeHtml(activity.title);
  const sanitizedAuthor = escapeHtml(activity.author);
  const sanitizedRepo = escapeHtml(activity.repo);
  const sanitizedType = escapeHtml(activity.type);
  const sanitizedAvatar = sanitizeImageUrl(activity.authorAvatar);

  return `
    <div class="activity-item ${isRead ? 'read' : 'unread'}" data-id="${escapeHtml(activity.id)}" data-url="${escapeHtml(activity.url)}">
      <img src="${sanitizedAvatar}" class="activity-avatar" alt="${sanitizedAuthor}">
      <div class="activity-content">
        <div class="activity-header">
          <span class="activity-type ${sanitizedType}">${sanitizedType}</span>
          <span class="activity-repo">${sanitizedRepo}</span>
        </div>
        <div class="activity-title">${sanitizedTitle}</div>
        <div class="activity-meta">
          by ${sanitizedAuthor} • ${formatDate(activity.createdAt)}
        </div>
      </div>
      <div class="activity-actions">
        <button class="action-btn mark-read-btn" data-action="mark-read" title="Mark as done" aria-label="Mark ${sanitizedTitle} as done">
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

  // Sort repos: pinned first, then by most recent activity
  const sortedGroups = {};
  Object.keys(groups)
    .sort((a, b) => {
      const aIsPinned = pinnedRepos.includes(a);
      const bIsPinned = pinnedRepos.includes(b);

      // Pinned repos come first
      if (aIsPinned && !bIsPinned) return -1;
      if (!aIsPinned && bIsPinned) return 1;

      // If both pinned or both not pinned, sort by most recent activity
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
  } catch (error) {
    showError('errorMessage', error, null, { action: 'snooze repository', repo }, 3000);
  }
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
    showError('errorMessage', error, null, { action: 'toggle read state' }, 3000);
  }
}

async function markAsRead(id) {
  if (readItems.includes(id)) return;

  try {
    await chrome.runtime.sendMessage({ action: 'markAsRead', id });
    readItems.push(id);
  } catch (error) {
    showError('errorMessage', error, null, { action: 'mark as read' }, 3000);
  }
}

async function handleMarkAllRead() {
  try {
    await chrome.runtime.sendMessage({ action: 'markAllAsRead' });
    readItems = allActivities.map(a => a.id);
    renderActivities();
  } catch (error) {
    showError('errorMessage', error, null, { action: 'mark all as read' }, 3000);
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

function setupKeyboardNavigation() {
  const searchBox = document.getElementById('searchBox');

  // Handle keyboard shortcuts
  document.addEventListener('keydown', (e) => {
    // Only handle shortcuts when not in input fields
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
      return;
    }

    switch (e.key) {
      case 'r':
      case 'R':
        if (!e.ctrlKey && !e.metaKey) {
          e.preventDefault();
          handleRefresh();
        }
        break;
      case 's':
      case 'S':
        if (!e.ctrlKey && !e.metaKey) {
          e.preventDefault();
          toggleSearch();
        }
        break;
      case 'a':
      case 'A':
        if (!e.ctrlKey && !e.metaKey) {
          e.preventDefault();
          toggleArchive();
        }
        break;
      case 'Escape':
        if (searchBox && searchBox.style.display !== 'none') {
          toggleSearch();
        }
        break;
    }
  });

  // Enhanced tab navigation for filter buttons
  const filterButtons = document.querySelectorAll('.filter-btn');
  filterButtons.forEach((btn, index) => {
    btn.addEventListener('keydown', (e) => {
      switch (e.key) {
        case 'ArrowRight':
        case 'ArrowDown': {
          e.preventDefault();
          const nextIndex = (index + 1) % filterButtons.length;
          filterButtons[nextIndex].focus();
          filterButtons[nextIndex].click();
          break;
        }
        case 'ArrowLeft':
        case 'ArrowUp': {
          e.preventDefault();
          const prevIndex = (index - 1 + filterButtons.length) % filterButtons.length;
          filterButtons[prevIndex].focus();
          filterButtons[prevIndex].click();
          break;
        }
        case 'Enter':
        case ' ':
          e.preventDefault();
          btn.click();
          break;
      }
    });
  });

  // Update ARIA attributes when filters change
  const originalRenderActivities = renderActivities;
  const wrappedRenderActivities = function() {
    originalRenderActivities();

    // Update ARIA selected states
    filterButtons.forEach(btn => {
      const isActive = btn.classList.contains('active');
      btn.setAttribute('aria-selected', isActive.toString());
      btn.setAttribute('tabindex', isActive ? '0' : '-1');
    });
  };

  // Replace the original function with the wrapped version
  window.renderActivities = wrappedRenderActivities;
  Object.defineProperty(window, 'renderActivities', {
    value: wrappedRenderActivities,
    writable: true,
    configurable: true
  });
}

function setupOfflineHandlers() {
  // Handle offline/online events
  setupOfflineListeners(
    // When coming back online
    () => {
      showOfflineStatus('errorMessage', false);
      setTimeout(() => {
        loadActivities();
      }, 1000);
    },
    // When going offline
    () => {
      showOfflineStatus('errorMessage', true);
    }
  );

  // Store original handleRefresh for offline-aware handling
  const originalHandleRefresh = window.handleRefresh || handleRefresh;

  // Override handleRefresh with offline check
  window.handleRefresh = async function() {
    if (isOffline()) {
      showError('errorMessage', new Error('Cannot refresh while offline'), null, { action: 'refresh activities' }, 3000);
      return;
    }
    return originalHandleRefresh.call(this);
  };
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
  toggleArchive
};
