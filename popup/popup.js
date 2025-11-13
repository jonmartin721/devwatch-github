let currentFilter = 'all';
let allActivities = [];

document.addEventListener('DOMContentLoaded', () => {
  loadActivities();
  setupEventListeners();
});

function setupEventListeners() {
  document.getElementById('refreshBtn').addEventListener('click', handleRefresh);
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
}

async function handleRefresh() {
  const btn = document.getElementById('refreshBtn');
  btn.disabled = true;

  try {
    await chrome.runtime.sendMessage({ action: 'checkNow' });
    await loadActivities();
  } catch (error) {
    console.error('Error refreshing:', error);
  } finally {
    btn.disabled = false;
  }
}

async function loadActivities() {
  try {
    const { activities = [] } = await chrome.storage.local.get(['activities']);
    allActivities = activities;
    renderActivities();
    chrome.runtime.sendMessage({ action: 'clearBadge' });
  } catch (error) {
    console.error('Error loading activities:', error);
  }
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

  list.innerHTML = filtered.map(activity => `
    <div class="activity-item" data-url="${activity.url}">
      <div class="activity-header">
        <span class="activity-type ${activity.type}">${activity.type}</span>
        <span class="activity-repo">${activity.repo}</span>
      </div>
      <div class="activity-title">${activity.title}</div>
      <div class="activity-meta">
        by ${activity.author} • ${formatDate(activity.createdAt)}
      </div>
    </div>
  `).join('');

  list.querySelectorAll('.activity-item').forEach(item => {
    item.addEventListener('click', () => {
      const url = item.dataset.url;
      chrome.tabs.create({ url });
    });
  });
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
