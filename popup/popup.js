import { applyTheme } from '../shared/utils.js';
import { getSyncItem } from '../shared/storage-helpers.js';
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
  toggleRepoCollapse as toggleRepoCollapseController,
  togglePinRepo as togglePinRepoController,
  snoozeRepo as snoozeRepoController,
  markAsRead,
  markAsReadWithAnimation,
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

// Legacy global variables for compatibility (will be phased out)
let collapsedRepos = new Set();
let pinnedRepos = [];

// Onboarding manager
const onboardingManager = new OnboardingManager();

// Optimized DOM renderer
let activityRenderer = null;

if (typeof document !== 'undefined') {
  document.addEventListener('DOMContentLoaded', async () => {
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
        const relevantKeys = ['allActivities', 'currentFilter', 'searchQuery', 'showArchive', 'readItems'];
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
        if (header) header.style.display = 'flex';
        if (toolbar) toolbar.style.display = 'flex';
        if (activityList) activityList.style.display = 'block';
        
        loadActivities();
      }

      setupEventListeners();
      setupKeyboardNavigation();
      setupOfflineHandlers();
    } catch (error) {
      console.error('Failed to initialize popup:', error);
      showError('errorMessage', 'Failed to load extension data');
    }
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
  getSyncItem('theme', null).then(savedTheme => {
    let theme = savedTheme;

    // If no saved theme, detect system preference
    if (theme === null) {
      theme = window.matchMedia('(prefers-color-scheme: dark)') ? 'dark' : 'light';
      // Save the detected system theme as the user's preference
      chrome.storage.sync.set({ theme });
    }

    applyTheme(theme);
    // Add a small delay to ensure DOM is ready before updating icons
    setTimeout(() => {
      updateDarkModeIcon();
    }, 50);
  });

  }

// Theme functions now imported from controllers/theme-controller.js
import { toggleDarkMode, updateDarkModeIcon } from './controllers/theme-controller.js';

// Wrapper for handleRefresh to pass loadActivities callback
async function handleRefresh() {
  await handleRefreshController(() => loadActivities());
}

// Wrapper for loadActivities to pass callbacks and update global state
async function loadActivities() {
  await loadActivitiesController(
    () => renderActivities(),
    (repos) => { pinnedRepos = repos; },
    (repos) => { collapsedRepos = repos; }
  );
}

// Wrapper for renderActivities to pass all necessary callbacks
function renderActivities() {
  renderActivitiesView(
    activityRenderer,
    collapsedRepos,
    pinnedRepos,
    (id) => markAsRead(id),
    (id, item) => markAsReadWithAnimation(id, item, () => renderActivities()),
    () => handleMarkAllRead(),
    () => handleCollapseAll(),
    (repo) => toggleRepoCollapse(repo),
    (repo) => togglePinRepo(repo),
    (repo) => snoozeRepo(repo)
  );

  // Update ARIA attributes after rendering
  updateFilterButtonAria();
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
    setState({ searchQuery: '' });
    searchInput.value = '';
    renderActivities();
  }
}

function toggleArchive() {
  const archiveBtn = document.getElementById('archiveBtn');
  const currentState = useState().showArchive;
  setState({ showArchive: !currentState });
  archiveBtn.classList.toggle('active', !currentState);
  renderActivities();
}


// Wrapper for toggleRepoCollapse
async function toggleRepoCollapse(repo) {
  await toggleRepoCollapseController(repo, collapsedRepos, () => renderActivities());
}

// Wrapper for togglePinRepo
async function togglePinRepo(repo) {
  await togglePinRepoController(
    repo,
    pinnedRepos,
    (repos) => { pinnedRepos = repos; },
    () => renderActivities()
  );
}

// Wrapper for snoozeRepo
async function snoozeRepo(repo) {
  await snoozeRepoController(repo, () => loadActivities());
}

// Wrapper for handleMarkAllRead
async function handleMarkAllRead() {
  await handleMarkAllReadController(() => renderActivities());
}

// Wrapper for handleCollapseAll
async function handleCollapseAll() {
  await handleCollapseAllController(collapsedRepos, () => renderActivities());
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
    loadActivities,
    renderActivities,
    toggleRepoCollapse,
    togglePinRepo,
    snoozeRepo,
    toggleDarkMode,
    updateDarkModeIcon,
    showError,
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
  toggleRepoCollapse,
  togglePinRepo,
  snoozeRepo,
  toggleDarkMode,
  updateDarkModeIcon,
  showError,
  handleMarkAllRead,
  handleCollapseAll,
  toggleSearch,
  toggleArchive
};
