let currentFilter = 'all';
let allActivities = [];
let readItems = [];

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

  document.querySelectorAll('.filter-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
      e.target.classList.add('active');
      currentFilter = e.target.dataset.type;
      renderActivities();
    });
  });

  // Load theme preference
  chrome.storage.sync.get(['theme'], (result) => {
    const theme = result.theme || 'system';
    applyTheme(theme);
    updateDarkModeIcon();
  });
}

function applyTheme(theme) {
  if (theme === 'system') {
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    document.body.classList.toggle('dark-mode', prefersDark);
  } else if (theme === 'dark') {
    document.body.classList.add('dark-mode');
  } else {
    document.body.classList.remove('dark-mode');
  }
}

function toggleDarkMode() {
  // Cycle through: light -> dark -> system
  chrome.storage.sync.get(['theme'], (result) => {
    let currentTheme = result.theme || 'system';
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
  });
}

function updateDarkModeIcon() {
  const btn = document.getElementById('darkModeBtn');
  const moonIcon = btn.querySelector('.moon-icon');
  const sunIcon = btn.querySelector('.sun-icon');

  if (document.body.classList.contains('dark-mode')) {
    moonIcon.style.display = 'none';
    sunIcon.style.display = 'block';
  } else {
    moonIcon.style.display = 'block';
    sunIcon.style.display = 'none';
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
    const data = await chrome.storage.local.get(['activities', 'readItems', 'rateLimit', 'lastError']);
    allActivities = data.activities || [];
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
  if (currentFilter !== 'all') {
    filtered = allActivities.filter(a => a.type === currentFilter);
  }

  if (filtered.length === 0) {
    list.innerHTML = `
      <div class="empty-state">
        <p>No ${currentFilter === 'all' ? 'recent' : currentFilter} activity</p>
        <small>Check your settings to add repositories</small>
      </div>
    `;
    return;
  }

  const unreadCount = filtered.filter(a => !readItems.includes(a.id)).length;
  const header = unreadCount > 0 ? `
    <div class="list-header">
      <span>${unreadCount} unread</span>
      <button id="markAllReadBtn" class="text-btn">Mark all as read</button>
    </div>
  ` : '';

  // Group activities by time
  const grouped = groupByTime(filtered);

  let htmlContent = header;

  ['today', 'yesterday', 'thisWeek', 'older'].forEach(group => {
    if (grouped[group].length > 0) {
      const groupTitle = {
        today: 'Today',
        yesterday: 'Yesterday',
        thisWeek: 'This Week',
        older: 'Older'
      }[group];

      htmlContent += `<div class="time-group-header">${groupTitle}</div>`;
      htmlContent += grouped[group].map(activity => renderActivityItem(activity)).join('');
    }
  });

  list.innerHTML = htmlContent;

  // Event listeners
  if (unreadCount > 0) {
    document.getElementById('markAllReadBtn')?.addEventListener('click', handleMarkAllRead);
  }

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
        const url = item.dataset.url;

        if (action === 'toggle-read') {
          toggleReadState(id);
        } else if (action === 'copy') {
          navigator.clipboard.writeText(url);
        }
      });
    });
  });
}

function renderActivityItem(activity) {
  const isRead = readItems.includes(activity.id);

  const readIcon = `<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><circle cx="8" cy="8" r="6" stroke="currentColor" stroke-width="2" fill="none"/></svg>`;
  const unreadIcon = `<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><circle cx="8" cy="8" r="6"/></svg>`;
  const copyIcon = `<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M0 6.75C0 5.784.784 5 1.75 5h1.5a.75.75 0 0 1 0 1.5h-1.5a.25.25 0 0 0-.25.25v7.5c0 .138.112.25.25.25h7.5a.25.25 0 0 0 .25-.25v-1.5a.75.75 0 0 1 1.5 0v1.5A1.75 1.75 0 0 1 9.25 16h-7.5A1.75 1.75 0 0 1 0 14.25Z"/><path d="M5 1.75C5 .784 5.784 0 6.75 0h7.5C15.216 0 16 .784 16 1.75v7.5A1.75 1.75 0 0 1 14.25 11h-7.5A1.75 1.75 0 0 1 5 9.25Zm1.75-.25a.25.25 0 0 0-.25.25v7.5c0 .138.112.25.25.25h7.5a.25.25 0 0 0 .25-.25v-7.5a.25.25 0 0 0-.25-.25Z"/></svg>`;

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
        <button class="action-btn" data-action="toggle-read" title="${isRead ? 'Mark as unread' : 'Mark as read'}">
          ${isRead ? readIcon : unreadIcon}
        </button>
        <button class="action-btn" data-action="copy" title="Copy URL">
          ${copyIcon}
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

function formatDate(dateString) {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now - date;
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 60) {
    return `${diffMins}m ago`;
  } else if (diffHours < 24) {
    return `${diffHours}h ago`;
  } else if (diffDays < 7) {
    return `${diffDays}d ago`;
  } else {
    return date.toLocaleDateString();
  }
}

// Export functions for testing
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    loadActivities,
    renderActivities,
    groupByTime,
    formatDate,
    applyTheme,
    toggleDarkMode,
    updateDarkModeIcon,
    updateRateLimit,
    showError,
    toggleReadState,
    markAsRead,
    handleMarkAllRead
  };
}
