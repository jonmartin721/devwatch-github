import { applyTheme, applyColorTheme } from '../shared/utils.js';
import { getSyncItem, getWatchedRepos } from '../shared/storage-helpers.js';
import { showError } from '../shared/error-handler.js';
import {
  isOffline,
  showOfflineStatus,
  setupOfflineListeners
} from '../shared/offline-manager.js';
import { stateManager, useState, setState, subscribe } from '../shared/state-manager.js';
import { ActivityListRenderer } from '../shared/dom-optimizer.js';
import { OnboardingManager } from '../shared/onboarding.js';

// Import controllers
import {
  loadActivities as loadActivitiesController,
  handleRefresh as handleRefreshController
} from './controllers/activity-controller.js';
import {
  clearArchive as clearArchiveController,
  toggleRepoCollapse as toggleRepoCollapseController,
  togglePinRepo as togglePinRepoController,
  snoozeRepo as snoozeRepoController,
  snoozeRepoWithAnimation as snoozeRepoWithAnimationController,
  markAsRead,
  markAsReadWithAnimation,
  markRepoAsRead,
  handleMarkAllRead as handleMarkAllReadController,
  handleCollapseAll as handleCollapseAllController
} from './controllers/repository-controller.js';
import {
  setupKeyboardNavigation as setupKeyboardNavigationController,
  updateFilterButtonAria
} from './controllers/keyboard-controller.js';

// Import views
import { renderActivities as renderActivitiesView } from './views/activity-list-view.js';
import {
  showOnboarding,
  exitOnboarding
} from './views/onboarding-view.js';

// Onboarding manager
const onboardingManager = new OnboardingManager();

// Optimized DOM renderer
let activityRenderer = null;

async function initializePopup() {
  try {
    // Initialize state manager first
    await stateManager.initialize();

    // Initialize optimized DOM renderer
    const activityList = document.getElementById('activityList');
    if (activityList) {
      activityRenderer = new ActivityListRenderer(activityList);
    }

    // Setup state change subscription
    subscribe((currentState, previousState) => {
      // Re-render activities when relevant state changes
      const relevantKeys = ['allActivities', 'currentFilter', 'searchQuery', 'showArchive', 'readItems', 'collapsedRepos', 'pinnedRepos'];
      const hasRelevantChanges = relevantKeys.some(key => currentState[key] !== previousState[key]);

      if (hasRelevantChanges) {
        renderActivities();
      }
    });

    // Check if onboarding is needed
    if (await onboardingManager.isInOnboarding()) {
      await showOnboarding(() => loadActivities());
    } else {
      // Show main UI elements when not in onboarding
      const header = document.querySelector('header');
      const toolbar = document.querySelector('.toolbar');
      const activityList = document.getElementById('activityList');
      if (header) header.classList.remove('hidden');
      if (toolbar) toolbar.classList.remove('hidden');
      if (activityList) activityList.classList.remove('hidden');

      // Ensure skip button is hidden when not in onboarding
      const footerSkipBtn = document.getElementById('footerSkipBtn');
      if (footerSkipBtn) {
        footerSkipBtn.classList.add('hidden');
      }

      loadActivities();
    }

    setupEventListeners();
    setupKeyboardNavigation();
    setupOfflineHandlers();
  } catch (error) {
    console.error('Failed to initialize popup:', error);
    showError('errorMessage', 'Failed to load extension data');
  }
}

if (typeof document !== 'undefined') {
  document.addEventListener('DOMContentLoaded', async () => {
    await initializePopup();
  });
}

function setupEventListeners() {
  const darkModeBtn = document.getElementById('darkModeBtn');

  document.getElementById('refreshBtn').addEventListener('click', handleRefresh);

  if (darkModeBtn) {
    darkModeBtn.addEventListener('click', () => {
      toggleDarkMode();
    });
  }

  document.getElementById('settingsLink').addEventListener('click', () => {
    chrome.runtime.openOptionsPage();
  });
  document.getElementById('helpBtn').addEventListener('click', () => {
    chrome.tabs.create({ url: 'https://github.com/jonmartin721/devwatch-github#readme' });
  });

  // Footer skip setup button
  const footerSkipBtn = document.getElementById('footerSkipBtn');
  if (footerSkipBtn) {
    footerSkipBtn.addEventListener('click', async () => {
      await onboardingManager.completeOnboarding();
      exitOnboarding(() => loadActivities());
    });
  }

  // Toolbar buttons
  document.getElementById('searchBtn').addEventListener('click', toggleSearch);
  document.getElementById('archiveBtn').addEventListener('click', toggleArchive);

  // Search input
  document.getElementById('searchInput').addEventListener('input', (e) => {
    setState({ searchQuery: e.target.value.toLowerCase() });
  });

  document.querySelectorAll('.filter-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
      e.target.classList.add('active');
      setState({ currentFilter: e.target.dataset.type });
    });
  });

  // Load theme preference - detect system theme on first load
  loadAndApplyThemes().catch(error => {
    console.error('Failed to load theme preferences:', error);
  });

  }

// Theme functions now imported from controllers/theme-controller.js
import { toggleDarkMode, updateDarkModeIcon } from './controllers/theme-controller.js';

async function loadAndApplyThemes() {
  const savedTheme = await getSyncItem('theme', null);
  let theme = savedTheme ?? 'system';

  if (savedTheme === null) {
    await chrome.storage.sync.set({ theme });
  }

  applyTheme(theme);

  const colorTheme = await getSyncItem('colorTheme', 'polar');
  applyColorTheme(colorTheme);

  // Small delay so the icon swap runs after the theme class is on <body>
  setTimeout(() => {
    updateDarkModeIcon();
  }, 50);
}

// Wrapper for handleRefresh to pass loadActivities callback
async function handleRefresh() {
  await handleRefreshController((...args) => loadActivities(...args));
}

// Update repo count in header
async function updateRepoCount() {
  const watchedRepos = await getWatchedRepos();
  const count = watchedRepos.length;
  const repoCountEl = document.getElementById('repoCount');
  if (repoCountEl) {
    repoCountEl.textContent = count === 0 ? 'Not watching any repos' : `Watching ${count} ${count === 1 ? 'repo' : 'repos'}`;
  }
}

// Wrapper for loadActivities to pass callbacks and update global state
async function loadActivities(options = {}) {
  await loadActivitiesController(() => renderActivities(), options);
  await updateRepoCount();
}

// Wrapper for renderActivities to pass all necessary callbacks
function renderActivities() {
  const currentState = useState();

  renderActivitiesView(
    activityRenderer,
    currentState.collapsedRepos,
    currentState.pinnedRepos,
    (id) => markAsRead(id),
    (id, item) => markAsReadWithAnimation(id, item, () => renderActivities()),
    () => handleMarkAllRead(),
    () => handleCollapseAll(),
    () => clearArchive(),
    (repo) => toggleRepoCollapse(repo),
    (repo) => togglePinRepo(repo),
    (repo) => handleSnoozeRepo(repo),
    (repo) => markRepoAsRead(repo, () => renderActivities())
  );

  // Update ARIA attributes after rendering
  updateFilterButtonAria();
}


function toggleSearch() {
  const searchBox = document.getElementById('searchBox');
  const searchBtn = document.getElementById('searchBtn');
  const searchInput = document.getElementById('searchInput');

  if (searchBox.classList.contains('hidden')) {
    searchBox.classList.remove('hidden');
    searchBtn.classList.add('active');
    searchInput.focus();
  } else {
    searchBox.classList.add('hidden');
    searchBtn.classList.remove('active');
    setState({ searchQuery: '' });
    searchInput.value = '';
    // Note: renderActivities() is called automatically by the state subscription
  }
}

function toggleArchive() {
  const archiveBtn = document.getElementById('archiveBtn');
  const currentState = useState().showArchive;
  setState({ showArchive: !currentState });
  archiveBtn.classList.toggle('active', !currentState);
  // Note: renderActivities() is called automatically by the state subscription
}


// Wrapper for toggleRepoCollapse
async function toggleRepoCollapse(repo) {
  await toggleRepoCollapseController(repo, useState().collapsedRepos, () => renderActivities());
}

// Wrapper for togglePinRepo
async function togglePinRepo(repo) {
  await togglePinRepoController(
    repo,
    useState().pinnedRepos,
    null,
    () => renderActivities()
  );
}

// Wrapper for snoozeRepo
async function snoozeRepo(repo) {
  await snoozeRepoController(repo, () => loadActivities());
}

// Wrapper for snoozeRepoWithAnimation
async function handleSnoozeRepo(repo) {
  // Find the DOM elements for this repo
  const repoHeader = document.querySelector(`.repo-group-header[data-repo="${repo}"]`);
  const repoActivities = document.querySelector(`.repo-activities[data-repo="${repo}"]`);

  if (repoHeader && repoActivities) {
    await snoozeRepoWithAnimationController(repo, repoHeader, repoActivities, () => loadActivities());
  } else {
    // Fallback to non-animated snooze if elements not found
    await snoozeRepoController(repo, () => loadActivities());
  }
}

// Wrapper for handleMarkAllRead
async function handleMarkAllRead() {
  await handleMarkAllReadController(() => renderActivities());
}

// Wrapper for handleCollapseAll
async function handleCollapseAll() {
  await handleCollapseAllController(useState().collapsedRepos, () => renderActivities());
}

async function clearArchive() {
  await clearArchiveController(() => renderActivities());
}

// Wrapper for setupKeyboardNavigation
function setupKeyboardNavigation() {
  setupKeyboardNavigationController(
    () => handleRefresh(),
    () => toggleSearch(),
    () => toggleArchive()
  );
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
    initializePopup,
    loadActivities,
    renderActivities,
    toggleRepoCollapse,
    togglePinRepo,
    snoozeRepo,
    handleSnoozeRepo,
    toggleDarkMode,
    updateDarkModeIcon,
    showError,
    handleMarkAllRead,
    handleCollapseAll,
    clearArchive,
    toggleSearch,
    toggleArchive
  };
}

// ES6 exports for tests
export {
  initializePopup,
  loadActivities,
  renderActivities,
  toggleRepoCollapse,
  togglePinRepo,
  snoozeRepo,
  handleSnoozeRepo,
  toggleDarkMode,
  updateDarkModeIcon,
  showError,
  handleMarkAllRead,
  handleCollapseAll,
  clearArchive,
  toggleSearch,
  toggleArchive
};
