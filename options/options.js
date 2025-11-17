import { applyTheme, formatDateVerbose } from '../shared/utils.js';
import { getSyncItem, getToken, setToken, clearToken as clearStoredToken, getLocalItems, setLocalItem } from '../shared/storage-helpers.js';
import { extractRepoName } from '../shared/repository-utils.js';
import { createHeaders } from '../shared/github-api.js';
import { STAR_ICON, LINK_ICON, createSvg, getMuteIcon, getPinIcon } from '../shared/icons.js';
import { escapeHtml } from '../shared/sanitize.js';
import { safelyOpenUrl } from '../shared/security.js';
import { STORAGE_CONFIG, VALIDATION_PATTERNS } from '../shared/config.js';
import { validateRepository } from '../shared/repository-validator.js';
import { OnboardingManager } from '../shared/onboarding.js';

/**
 * Toast Notification System
 */
class ToastManager {
  constructor() {
    this.container = null;
    this.toasts = new Map();
    this.toastCounter = 0;
    this.lastValidToken = null;
    this.isManualTokenEntry = false;
  }

  init() {
    this.container = document.getElementById('toastContainer');
    if (!this.container) {
      console.warn('Toast container not found');
    }
  }

  show(message, type = 'info', options = {}) {
    if (!this.container) {
      console.warn('Toast container not initialized');
      return;
    }

    const {
      duration = type === 'error' ? 8000 : 5000,
      persistent = false,
      action = null
    } = options;

    const toastId = ++this.toastCounter;
    const toast = this.createToast(toastId, message, type, action);

    this.container.appendChild(toast);
    this.toasts.set(toastId, { element: toast, timeout: null });

    // Trigger animation
    requestAnimationFrame(() => {
      toast.classList.add('show');
    });

    // Set up auto-remove
    if (!persistent && duration > 0) {
      this.setupAutoRemove(toastId, duration);
    }

    return toastId;
  }

  createToast(id, message, type, action) {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.dataset.toastId = id;

    const icon = this.getIcon(type);

    let toastHTML = `
      <div class="toast-icon">${icon}</div>
      <div class="toast-message">${escapeHtml(message)}</div>
      <button class="toast-close" aria-label="Close toast">✕</button>
      <div class="toast-progress"></div>
    `;

    if (action) {
      const actionButton = `<button class="toast-action" data-action="${action.id}">${escapeHtml(action.text)}</button>`;
      toastHTML = toastHTML.replace('</div><button class="toast-close">', `</div>${actionButton}<button class="toast-close">`);
    }

    toast.innerHTML = toastHTML;

    // Add event listeners
    const closeBtn = toast.querySelector('.toast-close');
    closeBtn.addEventListener('click', () => this.remove(id));

    const actionBtn = toast.querySelector('.toast-action');
    if (actionBtn && action) {
      actionBtn.addEventListener('click', () => {
        action.handler();
        this.remove(id);
      });
    }

    return toast;
  }

  getIcon(type) {
    const icons = {
      success: '✓',
      error: '✕',
      warning: '⚠',
      info: 'ℹ'
    };
    return icons[type] || icons.info;
  }

  setupAutoRemove(id, duration) {
    const progressBar = document.querySelector(`[data-toast-id="${id}"] .toast-progress`);
    if (progressBar) {
      progressBar.style.transition = `width ${duration}ms linear`;
      requestAnimationFrame(() => {
        progressBar.style.width = '0%';
      });
    }

    const timeout = setTimeout(() => {
      this.remove(id);
    }, duration);

    const toastData = this.toasts.get(id);
    if (toastData) {
      toastData.timeout = timeout;
    }
  }

  remove(id) {
    const toastData = this.toasts.get(id);
    if (!toastData) return;

    const { element, timeout } = toastData;

    // Clear timeout if exists
    if (timeout) {
      clearTimeout(timeout);
    }

    // Add removing animation
    element.classList.add('removing');

    // Remove after animation
    setTimeout(() => {
      if (element.parentNode) {
        element.parentNode.removeChild(element);
      }
      this.toasts.delete(id);
    }, 300);
  }

  // Convenience methods
  success(message, options) {
    return this.show(message, 'success', options);
  }

  error(message, options) {
    return this.show(message, 'error', options);
  }

  warning(message, options) {
    return this.show(message, 'warning', options);
  }

  info(message, options) {
    return this.show(message, 'info', options);
  }

  // Clear all toasts
  clear() {
    this.toasts.forEach((_, id) => this.remove(id));
  }
}

// Global toast manager instance
const toastManager = new ToastManager();

const state = {
  watchedRepos: [],
  mutedRepos: [],
  pinnedRepos: [],
  currentPage: 1,
  reposPerPage: 10,
  searchQuery: '',
  hidePinnedRepos: false
};

if (typeof document !== 'undefined') {
  document.addEventListener('DOMContentLoaded', async () => {
    // Initialize toast manager first
    toastManager.init();

    await loadSettings();
    setupEventListeners();
    setupThemeListener();

    // Handle URL parameters for enhanced navigation
    handleUrlParameters();
  });
}

function setupThemeListener() {
  // Listen for system theme changes
  const darkModeQuery = window.matchMedia('(prefers-color-scheme: dark)');
  darkModeQuery.addEventListener('change', async () => {
    const theme = await getSyncItem('theme', 'system');
    if (theme === 'system') {
      applyTheme(theme);
    }
  });
}

function handleUrlParameters() {
  // Check for URL parameters to enhance user experience
  const urlParams = new URLSearchParams(window.location.search);
  const hash = window.location.hash;

  // Handle showAdd parameter to open Add repository panel
  if (urlParams.get('showAdd') === 'true') {
    // Wait a bit for DOM to be fully ready
    setTimeout(() => {
      const toggleAddBtn = document.getElementById('toggleAddBtn');
      if (toggleAddBtn && !toggleAddBtn.classList.contains('active')) {
        toggleAddBtn.click();
      }
    }, 100);
  }

  // Handle hash navigation to scroll to specific section
  if (hash) {
    setTimeout(() => {
      // Extract just the hash part without query parameters
      const hashParts = hash.split('?');
      const cleanHash = hashParts[0];
      const targetSection = document.querySelector(cleanHash);
      if (targetSection) {
        targetSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }, 200);
  }
}

function setupEventListeners() {
  document.getElementById('addRepoBtn').addEventListener('click', addRepo);
  document.getElementById('clearTokenBtn').addEventListener('click', clearToken);

  // Action button toggles
  const toggleAddBtn = document.getElementById('toggleAddBtn');
  const toggleSearchBtn = document.getElementById('toggleSearchBtn');
  const hidePinnedToggleBtn = document.getElementById('hidePinnedToggleBtn');

  if (toggleAddBtn) {
    toggleAddBtn.addEventListener('click', () => togglePanel('add'));
  }
  if (toggleSearchBtn) {
    toggleSearchBtn.addEventListener('click', () => togglePanel('search'));
  }
  if (hidePinnedToggleBtn) {
    hidePinnedToggleBtn.addEventListener('click', toggleHidePinned);
  }

  // Import repos buttons
  document.getElementById('importWatchedBtn').addEventListener('click', () => openImportModal('watched'));
  document.getElementById('importStarredBtn').addEventListener('click', () => openImportModal('starred'));
  document.getElementById('importParticipatingBtn').addEventListener('click', () => openImportModal('participating'));
  document.getElementById('importMineBtn').addEventListener('click', () => openImportModal('mine'));

  // Import/Export settings buttons
  document.getElementById('importBtn').addEventListener('click', () => {
    document.getElementById('importFileInput').click();
  });
  document.getElementById('importFileInput').addEventListener('change', handleImportFile);
  document.getElementById('exportBtn').addEventListener('click', exportSettings);

  document.getElementById('repoInput').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      addRepo();
    }
  });

  // Search functionality
  const repoSearchInput = document.getElementById('repoSearch');
  const repoSearchClear = document.getElementById('repoSearchClear');

  repoSearchInput.addEventListener('input', (e) => {
    state.searchQuery = e.target.value.toLowerCase();
    state.currentPage = 1; // Reset to first page when searching
    renderRepoList();

    // Show/hide clear button
    repoSearchClear.style.display = e.target.value ? 'flex' : 'none';
  });

  repoSearchClear.addEventListener('click', () => {
    repoSearchInput.value = '';
    state.searchQuery = '';
    state.currentPage = 1;
    renderRepoList();
    repoSearchClear.style.display = 'none';
    repoSearchInput.focus();
  });

  // Listen for custom hide pinned toggle event
  document.addEventListener('hidePinnedToggle', (e) => {
    state.hidePinnedRepos = e.detail.hidden;
    state.currentPage = 1; // Reset to first page
    renderRepoList();
  });

  // Pagination controls
  document.getElementById('prevPage').addEventListener('click', () => {
    if (state.currentPage > 1) {
      state.currentPage--;
      renderRepoList();
    }
  });

  document.getElementById('nextPage').addEventListener('click', () => {
    const filteredRepos = getFilteredRepos();
    const totalPages = Math.ceil(filteredRepos.length / state.reposPerPage);
    if (state.currentPage < totalPages) {
      state.currentPage++;
      renderRepoList();
    }
  });

  // Validate and auto-save token on input
  let tokenValidationTimeout;
  document.getElementById('githubToken').addEventListener('input', (e) => {
    clearTimeout(tokenValidationTimeout);
    const token = e.target.value.trim();

    if (!token) {
      document.getElementById('tokenStatus').textContent = '';
      document.getElementById('tokenStatus').className = 'token-status';
      document.getElementById('clearTokenBtn').style.display = 'none';
      return;
    }

    document.getElementById('tokenStatus').textContent = 'Checking...';
    document.getElementById('tokenStatus').className = 'token-status checking';

    // Mark that this is a manual token entry for toast purposes
    toastManager.isManualTokenEntry = true;

    tokenValidationTimeout = setTimeout(async () => {
      await validateToken(token);
      // Auto-save token after validation
      if (token) {
        await setToken(token);
      }
    }, 500);
  });

  // Auto-save theme changes
  document.querySelectorAll('input[name="theme"]').forEach(radio => {
    radio.addEventListener('change', async (e) => {
      const theme = e.target.value;
      await chrome.storage.sync.set({ theme });
      applyTheme(theme);

      // Show toast notification
      const themeNames = {
        'light': 'Light Mode',
        'dark': 'Dark Mode',
        'system': 'System Theme'
      };
      toastManager.info(`Theme changed to ${themeNames[theme] || theme}`);
    });
  });

  
  // Auto-save check interval changes
  document.querySelectorAll('input[name="checkInterval"]').forEach(radio => {
    radio.addEventListener('change', async (e) => {
      const interval = parseInt(e.target.value);
      await chrome.storage.sync.set({ checkInterval: interval });

      // Update alarm with new interval
      chrome.runtime.sendMessage({
        action: 'updateInterval',
        interval: interval
      });

      // Show toast notification
      toastManager.info(`Check interval changed to ${interval} minutes`);
    });
  });

  // Auto-save snooze duration changes
  document.querySelectorAll('input[name="snoozeHours"]').forEach(radio => {
    radio.addEventListener('change', async (e) => {
      const snoozeHours = parseInt(e.target.value);
      await chrome.storage.sync.set({ snoozeHours });

      // Show toast notification
      toastManager.info(`Default snooze duration changed to ${snoozeHours} hour${snoozeHours > 1 ? 's' : ''}`);
    });
  });

  // Auto-save filter and notification changes
  ['filterPrs', 'filterIssues', 'filterReleases', 'notifyPrs', 'notifyIssues', 'notifyReleases'].forEach(id => {
    document.getElementById(id).addEventListener('change', async (e) => {
      const target = e.target;

      // Handle notification toggle logic
      if (target.id.startsWith('notify')) {
        const category = target.id.replace('notify', '').toLowerCase();
        const filterId = `filter${category.charAt(0).toUpperCase() + category.slice(1)}`;
        const filterToggle = document.getElementById(filterId);

        // If trying to enable notifications but category is disabled, disable the notification
        if (target.checked && !filterToggle.checked) {
          target.checked = false;
          return;
        }
      }

      // Handle filter toggle logic - disable notifications if filter is disabled
      if (target.id.startsWith('filter')) {
        const category = target.id.replace('filter', '').toLowerCase();
        const notifyId = `notify${category.charAt(0).toUpperCase() + category.slice(1)}`;
        const notifyToggle = document.getElementById(notifyId);

        // If disabling filter, also disable notifications
        if (!target.checked && notifyToggle.checked) {
          notifyToggle.checked = false;
        }
      }

      const filters = {
        prs: document.getElementById('filterPrs').checked,
        issues: document.getElementById('filterIssues').checked,
        releases: document.getElementById('filterReleases').checked
      };
      const notifications = {
        prs: document.getElementById('notifyPrs').checked,
        issues: document.getElementById('notifyIssues').checked,
        releases: document.getElementById('notifyReleases').checked
      };
      await chrome.storage.sync.set({ filters, notifications });
      updateNotificationToggleStates();
    });
  });

  // Import modal event listeners
  document.getElementById('closeImportModal').addEventListener('click', closeImportModal);
  document.getElementById('cancelImportBtn').addEventListener('click', closeImportModal);
  document.getElementById('confirmImportBtn').addEventListener('click', importSelectedRepos);

  document.getElementById('selectAllImport').addEventListener('change', (e) => {
    const cards = document.querySelectorAll('.repo-item.import-variant:not(.already-added)');
    cards.forEach(card => {
      if (e.target.checked) {
        card.classList.add('selected');
      } else {
        card.classList.remove('selected');
      }
    });
    updateSelectedCount();
  });

  const importSearchInput = document.getElementById('importRepoSearch');
  const importSearchClear = document.getElementById('importSearchClear');

  importSearchInput.addEventListener('input', (e) => {
    filterImportRepos();
    // Show/hide clear button
    importSearchClear.style.display = e.target.value ? 'flex' : 'none';
  });

  importSearchClear.addEventListener('click', () => {
    importSearchInput.value = '';
    filterImportRepos();
    importSearchClear.style.display = 'none';
    importSearchInput.focus();
  });

  // Close modal when clicking outside
  document.getElementById('importModal').addEventListener('click', (e) => {
    if (e.target.id === 'importModal') {
      closeImportModal();
    }
  });

  // Restart onboarding button
  document.getElementById('restartOnboardingBtn').addEventListener('click', async () => {
    const onboardingManager = new OnboardingManager();
    await onboardingManager.restartOnboarding();

    // Clear any cached activities to force fresh start
    await chrome.storage.local.remove(['activities', 'readItems']);

    // Show success message
    toastManager.show('Setup wizard restarted! Open the extension popup to begin.', 'success');

    // Try to open the extension popup after a short delay
    setTimeout(() => {
      chrome.action.openPopup().catch(() => {
        // If opening popup fails (which it might in some contexts),
        // the user will need to manually click the extension icon
        toastManager.info('Please click the extension icon to start the setup wizard');
      });
    }, 1000);
  });
}

// Panel toggle functionality
function togglePanel(type) {
  const addPanel = document.getElementById('addRepoPanel');
  const searchPanel = document.getElementById('searchRepoPanel');
  const addBtn = document.getElementById('toggleAddBtn');
  const searchBtn = document.getElementById('toggleSearchBtn');

  const isAddVisible = addPanel.classList.contains('show');
  const isSearchVisible = searchPanel.classList.contains('show');

  // Clicked 'add'
  if (type === 'add') {
    if (isAddVisible) {
      addPanel.classList.remove('show');
      addBtn.classList.remove('active');
    } else {
      addPanel.classList.add('show');
      addBtn.classList.add('active');
      searchPanel.classList.remove('show');
      searchBtn.classList.remove('active');

      // Clear search text when switching from search to add mode
      if (isSearchVisible) {
        const searchInput = document.getElementById('repoSearch');
        searchInput.value = '';
        state.searchQuery = '';
        renderRepoList(); // Re-render without search filter
      }

      // Focus on input after animation
      setTimeout(() => {
        document.getElementById('repoInput').focus();
      }, 300);
    }
  }
  // Clicked 'search'
  else if (type === 'search') {
    if (isSearchVisible) {
      searchPanel.classList.remove('show');
      searchBtn.classList.remove('active');
    } else {
      searchPanel.classList.add('show');
      searchBtn.classList.add('active');
      addPanel.classList.remove('show');
      addBtn.classList.remove('active');
      // Focus on search input after animation
      setTimeout(() => {
        document.getElementById('repoSearch').focus();
      }, 300);
    }
  }
}

function toggleHidePinned() {
  const btn = document.getElementById('hidePinnedToggleBtn');
  btn.classList.toggle('active');

  // Trigger existing hide pinned functionality
  const event = new CustomEvent('hidePinnedToggle', {
    detail: { hidden: btn.classList.contains('active') }
  });
  document.dispatchEvent(event);
}

function updateNotificationToggleStates() {
  // Update notification toggle states based on filter states
  const categories = ['prs', 'issues', 'releases'];

  categories.forEach(category => {
    const filterId = `filter${category.charAt(0).toUpperCase() + category.slice(1)}`;
    const notifyId = `notify${category.charAt(0).toUpperCase() + category.slice(1)}`;
    const filterToggle = document.getElementById(filterId);
    const notifyToggle = document.getElementById(notifyId);
    const notifyToggleLabel = notifyToggle.closest('.notification-toggle');

    if (filterToggle && notifyToggle && notifyToggleLabel) {
      if (filterToggle.checked) {
        // Category is enabled, notification toggle is active
        notifyToggleLabel.classList.remove('disabled');
        notifyToggle.disabled = false;
      } else {
        // Category is disabled, notification toggle is disabled
        notifyToggleLabel.classList.add('disabled');
        notifyToggle.disabled = true;
        // Make sure notification is also unchecked when disabled
        if (notifyToggle.checked) {
          notifyToggle.checked = false;
        }
      }
    }
  });
}

async function clearToken() {
  if (!confirm('Are you sure you want to clear your GitHub token?')) {
    return;
  }

  document.getElementById('githubToken').value = '';
  document.getElementById('tokenStatus').textContent = '';
  document.getElementById('tokenStatus').className = 'token-status';
  document.getElementById('clearTokenBtn').style.display = 'none';

  // Disable repo input when token is cleared
  const repoInput = document.getElementById('repoInput');
  repoInput.disabled = true;
  repoInput.placeholder = 'Enter a valid GitHub token to add repositories';
  document.getElementById('addRepoBtn').disabled = true;
  document.getElementById('repoHelpText').textContent = 'Add a valid GitHub token above to start adding repositories';

  // Hide import section when token is cleared
  document.getElementById('importReposSection').style.display = 'none';

  // Clear token from secure storage
  await clearStoredToken();

  // Show success toast
  toastManager.info('GitHub token cleared successfully');
}

async function validateToken(token) {
  const statusEl = document.getElementById('tokenStatus');

  try {
    const response = await fetch('https://api.github.com/user', {
      headers: createHeaders(token)
    });

    if (response.ok) {
      const user = await response.json();
      statusEl.textContent = `✓ Valid (${user.login})`;
      statusEl.className = 'token-status valid';
      document.getElementById('clearTokenBtn').style.display = 'block';

      // Enable repo input when token is valid
      const repoInput = document.getElementById('repoInput');
      repoInput.disabled = false;
      repoInput.placeholder = 'e.g., react, facebook/react, or GitHub URL';
      document.getElementById('addRepoBtn').disabled = false;
      document.getElementById('repoHelpText').textContent = 'Add repositories to monitor (npm package, owner/repo, or GitHub URL)';

      // Show import section when token is valid
      document.getElementById('importReposSection').style.display = 'block';

      // Show success toast for valid token (only when user manually enters a new token)
      // Don't show toast on page load or automatic validation
      if (!toastManager.lastValidToken || toastManager.lastValidToken !== token) {
        // Only show toast if this was a manual token entry (not on page load)
        if (toastManager.isManualTokenEntry) {
          toastManager.success(`GitHub token validated successfully for user: ${user.login}`);
        }
        toastManager.lastValidToken = token;
      }

      // Reset the manual entry flag after showing toast
      toastManager.isManualTokenEntry = false;
    } else if (response.status === 401) {
      statusEl.textContent = '✗ Invalid token';
      statusEl.className = 'token-status invalid';
      document.getElementById('clearTokenBtn').style.display = 'none';

      // Disable repo input when token is invalid
      const repoInput = document.getElementById('repoInput');
      repoInput.disabled = true;
      repoInput.placeholder = 'Enter a valid GitHub token to add repositories';
      document.getElementById('addRepoBtn').disabled = true;
      document.getElementById('repoHelpText').textContent = 'Invalid token. Please check your GitHub token and try again.';

      // Hide import section when token is invalid
      document.getElementById('importReposSection').style.display = 'none';

      // Show error toast for invalid token (only show once, not on every keystroke)
      if (!toastManager.lastInvalidToken || toastManager.lastInvalidToken !== token) {
        toastManager.error('Invalid GitHub token. Please check your token and try again.');
        toastManager.lastInvalidToken = token;
      }
    } else {
      statusEl.textContent = `✗ Error (${response.status})`;
      statusEl.className = 'token-status invalid';
      document.getElementById('clearTokenBtn').style.display = 'none';

      // Disable repo input on error
      const repoInput = document.getElementById('repoInput');
      repoInput.disabled = true;
      repoInput.placeholder = 'Enter a valid GitHub token to add repositories';
      document.getElementById('addRepoBtn').disabled = true;
      document.getElementById('repoHelpText').textContent = 'GitHub API error. Please try again later.';

      // Hide import section on error
      document.getElementById('importReposSection').style.display = 'none';

      // Show error toast for API errors
      if (!toastManager.lastApiError || toastManager.lastApiError !== response.status) {
        toastManager.error(`GitHub API error (${response.status}). Please try again later.`);
        toastManager.lastApiError = response.status;
      }
    }
  } catch (error) {
    statusEl.textContent = '✗ Network error';
    statusEl.className = 'token-status invalid';
    document.getElementById('clearTokenBtn').style.display = 'none';

    // Disable repo input on network error
    const repoInput = document.getElementById('repoInput');
    repoInput.disabled = true;
    repoInput.placeholder = 'Enter a valid GitHub token to add repositories';
    document.getElementById('addRepoBtn').disabled = true;
    document.getElementById('repoHelpText').textContent = 'Network error. Please check your connection and try again.';

    // Hide import section on network error
    document.getElementById('importReposSection').style.display = 'none';

    // Show network error toast
    toastManager.error('Network error while validating token. Please check your connection and try again.');
  }
}

async function loadSettings() {
  try {
    // Get token from secure local storage (with automatic migration)
    const githubToken = await getToken();

    const settings = await chrome.storage.sync.get([
      'watchedRepos',
      'mutedRepos',
      'pinnedRepos',
      'checkInterval',
      'snoozeHours',
      'filters',
      'notifications',
      'theme'
    ]);

    const snoozeSettings = await chrome.storage.sync.get(['snoozedRepos']);

    // Load and apply theme
    const theme = settings.theme || 'system';
    applyTheme(theme);

    if (githubToken) {
      document.getElementById('githubToken').value = githubToken;
      document.getElementById('clearTokenBtn').style.display = 'block';
      // Validate existing token
      validateToken(githubToken);
    } else {
      // No token - set appropriate placeholder and help text
      const repoInput = document.getElementById('repoInput');
      repoInput.disabled = true;
      repoInput.placeholder = 'Enter a valid GitHub token to add repositories';
      document.getElementById('addRepoBtn').disabled = true;
      document.getElementById('repoHelpText').textContent = 'Add a valid GitHub token above to start adding repositories';
      document.getElementById('importReposSection').style.display = 'none';
    }

    state.watchedRepos = settings.watchedRepos || [];
    state.mutedRepos = settings.mutedRepos || [];
    state.pinnedRepos = settings.pinnedRepos || [];

    // Migrate old string format to new object format
    if (githubToken && state.watchedRepos.some(r => typeof r === 'string')) {
      await migrateRepoFormat(githubToken);
    }

    renderRepoList();

    if (settings.checkInterval) {
      const intervalRadio = document.getElementById(`interval-${settings.checkInterval}`);
      if (intervalRadio) {
        intervalRadio.checked = true;
      }
    }

    if (settings.snoozeHours) {
      const snoozeRadio = document.getElementById(`snooze-${settings.snoozeHours}`);
      if (snoozeRadio) {
        snoozeRadio.checked = true;
      }
    }

    if (settings.filters) {
      document.getElementById('filterPrs').checked = settings.filters.prs !== false;
      document.getElementById('filterIssues').checked = settings.filters.issues !== false;
      document.getElementById('filterReleases').checked = settings.filters.releases !== false;
    }

    if (settings.notifications) {
      document.getElementById('notifyPrs').checked = settings.notifications.prs !== false;
      document.getElementById('notifyIssues').checked = settings.notifications.issues !== false;
      document.getElementById('notifyReleases').checked = settings.notifications.releases !== false;
    }

    // Set theme radio button
    const themeRadio = document.getElementById(`theme-${theme}`);
    if (themeRadio) {
      themeRadio.checked = true;
    }

    // Update notification toggle states after loading settings
    updateNotificationToggleStates();

    // Load and display current snoozes
    renderSnoozedRepos(snoozeSettings.snoozedRepos || []);
  } catch (error) {
    console.error('Error loading settings:', error);
  }
}

async function migrateRepoFormat() {
  let needsMigration = false;
  const oldRepos = state.watchedRepos.filter(r => typeof r === 'string');

  if (oldRepos.length > 0) {
    needsMigration = true;
    console.log(`Migrating ${oldRepos.length} repositories to new format...`);

    for (const repoName of oldRepos) {
      try {
        const result = await validateRepo(repoName);
        if (result.valid) {
          // Replace string with object
          const index = state.watchedRepos.findIndex(r => r === repoName);
          if (index !== -1) {
            state.watchedRepos[index] = result.metadata;
          }
        }
      } catch (error) {
        console.error(`Failed to migrate ${repoName}:`, error);
      }
    }
  }

  // Add addedAt to repos that don't have it (set to now to avoid old notifications)
  const reposWithoutAddedAt = state.watchedRepos.filter(r => typeof r === 'object' && !r.addedAt);
  if (reposWithoutAddedAt.length > 0) {
    needsMigration = true;
    const now = new Date().toISOString();
    reposWithoutAddedAt.forEach(repo => {
      repo.addedAt = now;
    });
  }

  if (needsMigration) {
    // Save migrated repos
    await chrome.storage.sync.set({ watchedRepos: state.watchedRepos });
    console.log('Migration complete');
  }
}

async function addRepo() {
  const input = document.getElementById('repoInput');
  const statusEl = document.getElementById('repoValidationStatus');
  const errorEl = document.getElementById('repoError');
  let repo = input.value.trim();

  // Clear previous error state
  input.classList.remove('error');
  errorEl.textContent = '';

  if (!repo) {
    return;
  }

  // Check if we've hit the maximum repo limit
  if (state.watchedRepos.length >= STORAGE_CONFIG.MAX_WATCHED_REPOS) {
    showRepoError(`Maximum of ${STORAGE_CONFIG.MAX_WATCHED_REPOS} repositories allowed`);
    statusEl.className = 'repo-validation-status error';
    return;
  }

  // Show checking indicator
  statusEl.className = 'repo-validation-status checking';

  // Parse GitHub URL if provided
  const urlMatch = repo.match(/github\.com\/([^/]+\/[^/]+)/);
  if (urlMatch) {
    repo = urlMatch[1].replace(/\.git$/, '');
    input.value = repo; // Update input to show parsed format
  }
  // Check if it might be an NPM package (no slash or scoped package)
  else if (!repo.includes('/') || repo.startsWith('@')) {
    const npmResult = await fetchGitHubRepoFromNpm(repo);
    if (npmResult.success) {
      repo = npmResult.repo;
      input.value = repo; // Update input to show GitHub repo
    } else {
      showRepoError(npmResult.error);
      statusEl.className = 'repo-validation-status error';
      return;
    }
  }

  // Validate owner/repo format using the same pattern as the validator
  if (!VALIDATION_PATTERNS.REPOSITORY_NAME.test(repo)) {
    showRepoError('Invalid format. Use: owner/repo, GitHub URL, or npm package');
    statusEl.className = 'repo-validation-status error';
    return;
  }

  if (state.watchedRepos.includes(repo)) {
    showRepoError('Repository already added');
    statusEl.className = 'repo-validation-status error';
    return;
  }

  // Validate repo exists on GitHub and fetch metadata
  let validationResult;
  try {
    validationResult = await validateRepo(repo);
  } catch (error) {
    console.error('Validation error:', error);
    showRepoError(`Validation error: ${error.message}`);
    statusEl.className = 'repo-validation-status error';
    return;
  }

  if (!validationResult) {
    showRepoError('Validation returned no result');
    statusEl.className = 'repo-validation-status error';
    return;
  }

  if (!validationResult.valid) {
      showRepoError(validationResult.error || 'Repository validation failed');
    statusEl.className = 'repo-validation-status error';
    return;
  }

  // Check if already added (by fullName)
  const alreadyExists = state.watchedRepos.some(r => (typeof r === 'string' ? r : r.fullName) === validationResult.fullName);

  if (alreadyExists) {
    showRepoError('Repository already added');
    statusEl.className = 'repo-validation-status error';
    return;
  }
  // Show success indicator
  statusEl.className = 'repo-validation-status success';

  try {
    state.watchedRepos.push(validationResult);

    // Reset to last page to show the newly added repo
    const totalPages = Math.ceil(state.watchedRepos.length / state.reposPerPage);
    state.currentPage = totalPages;

    renderRepoList();

    // Auto-save
    await chrome.storage.sync.set({ watchedRepos: state.watchedRepos });

    // Show success toast
    toastManager.success(`Successfully added ${validationResult.fullName} to watched repositories`);
  } catch (error) {
    console.error('Error adding repository:', error);
    showRepoError('Failed to add repository. Please try again.');
    statusEl.className = 'repo-validation-status error';
    // Remove the repo that was added to state if saving failed
    state.watchedRepos.pop();
    return;
  }

  // Clear input and success indicator after brief delay
  setTimeout(() => {
    input.value = '';
    statusEl.className = 'repo-validation-status';
  }, 800);
}

async function fetchGitHubRepoFromNpm(packageName) {
  try {
    const response = await fetch(`https://registry.npmjs.org/${packageName}`);

    if (!response.ok) {
      if (response.status === 404) {
        return { success: false, error: `NPM package "${packageName}" not found` };
      }
      return { success: false, error: `Error fetching NPM package (${response.status})` };
    }

    const data = await response.json();

    if (!data.repository) {
      return { success: false, error: `Package "${packageName}" has no repository info` };
    }

    let repoUrl = typeof data.repository === 'string' ? data.repository : data.repository.url;

    // Extract GitHub repo from URL
    const githubMatch = repoUrl.match(/github\.com[/:]([^/]+\/[^/.]+)/);
    if (!githubMatch) {
      return { success: false, error: `Package "${packageName}" is not hosted on GitHub` };
    }

    const repo = githubMatch[1].replace(/\.git$/, '');
    return { success: true, repo };
  } catch (error) {
    return { success: false, error: 'Network error fetching NPM package' };
  }
}

function showRepoError(message) {
  const input = document.getElementById('repoInput');
  const statusEl = document.getElementById('repoValidationStatus');
  const errorEl = document.getElementById('repoError');

  // Show visual error indication
  input.classList.add('error');
  statusEl.className = 'repo-validation-status error';
  errorEl.textContent = message;

  // Show toast notification
  toastManager.error(message);

  // Remove error class after animation
  setTimeout(() => {
    input.classList.remove('error');
  }, 500);
}

/**
 * Validates a GitHub repository using simplified validation logic
 *
 * This function provides streamlined validation that focuses on:
 * - Quick format validation using regex patterns
 * - Single API call to verify repository existence
 * - Essential metadata extraction for UI display
 * - Proper error handling with user-friendly messages
 *
 * @param {string} repo - Repository identifier in format "owner/repo"
 * @returns {Promise<Object|null>} Repository data if valid, null if invalid
 *
 * @example
 * // Valid repository
 * const repo = await validateRepo('microsoft/vscode');
 * // Returns: { fullName: 'microsoft/vscode', stars: 140000, ... }
 *
 * // Invalid repository
 * const invalid = await validateRepo('invalid/repo');
 * // Returns: null
 */
async function validateRepo(repo) {
  const githubToken = await getToken();

  if (!githubToken) {
    return { valid: false, error: 'No GitHub token found. Please add a token first.' };
  }

  // First do basic validation
  const basicResult = await validateRepository(repo, githubToken);

  if (!basicResult.valid) {
    return basicResult;
  }

  try {
    // Try to fetch latest release for additional metadata
    const headers = createHeaders(githubToken);
    const releasesResponse = await fetch(`https://api.github.com/repos/${repo}/releases/latest`, { headers });

    let latestRelease = null;
    if (releasesResponse.ok) {
      const releaseData = await releasesResponse.json();
      latestRelease = {
        version: releaseData.tag_name,
        publishedAt: releaseData.published_at
      };
    }
    // If no releases, that's ok - latestRelease stays null

    // Return the enhanced result
    return {
      valid: true,
      metadata: {
        ...basicResult.metadata,
        latestRelease
      },
      // Legacy compatibility fields
      name: basicResult.metadata.name,
      fullName: basicResult.metadata.fullName,
      description: basicResult.metadata.description,
      language: basicResult.metadata.language,
      stars: basicResult.metadata.stars,
      forks: basicResult.metadata.forks,
      updatedAt: basicResult.metadata.updatedAt
    };
  } catch (error) {
    // If release fetch fails, return basic validation result
    return {
      valid: true,
      metadata: {
        ...basicResult.metadata,
        latestRelease: null
      },
      // Legacy compatibility fields
      name: basicResult.metadata.name,
      fullName: basicResult.metadata.fullName,
      description: basicResult.metadata.description,
      language: basicResult.metadata.language,
      stars: basicResult.metadata.stars,
      forks: basicResult.metadata.forks,
      updatedAt: basicResult.metadata.updatedAt
    };
  }
}

async function removeRepo(repoFullName) {
  state.watchedRepos = state.watchedRepos.filter(r => {
    const fullName = typeof r === 'string' ? r : r.fullName;
    return fullName !== repoFullName;
  });

  // Adjust current page if we deleted the last item on a page
  const totalPages = Math.ceil(state.watchedRepos.length / state.reposPerPage);
  if (state.currentPage > totalPages && state.currentPage > 1) {
    state.currentPage = totalPages;
  }

  renderRepoList();

  // Auto-save
  await chrome.storage.sync.set({ watchedRepos: state.watchedRepos });

  // Show success toast
  toastManager.success(`Removed ${repoFullName} from watched repositories`);

  // Clean up notifications and activities for the removed repository
  await cleanupRepoNotifications(repoFullName);
}

async function cleanupRepoNotifications(repoFullName) {
  try {
    // Get current activities and read items from local storage
    const { activities = [], readItems = [] } = await getLocalItems(['activities', 'readItems']);

    // Filter out activities for the removed repository
    const updatedActivities = activities.filter(activity => activity.repo !== repoFullName);

    // Filter out read items for activities from the removed repository
    const removedActivityIds = activities
      .filter(activity => activity.repo === repoFullName)
      .map(activity => activity.id);

    const updatedReadItems = readItems.filter(id => !removedActivityIds.includes(id));

    // Save the filtered data back to local storage
    await setLocalItem('activities', updatedActivities);
    await setLocalItem('readItems', updatedReadItems);

    } catch (error) {
    console.error(`[DevWatch] Error cleaning up notifications for ${repoFullName}:`, error);
    // Don't show an error message to the user since this is cleanup logic
    // The repo removal was successful even if cleanup failed
  }
}

function getFilteredRepos() {
  let repos = state.watchedRepos;

  // Filter out pinned repos if hide pinned is enabled
  if (state.hidePinnedRepos) {
    repos = repos.filter(repo => {
      const fullName = extractRepoName(repo);
      return !state.pinnedRepos.includes(fullName);
    });
  }

  // Apply search filter
  if (!state.searchQuery) {
    return repos;
  }

  return repos.filter(repo => {
    const fullName = extractRepoName(repo);
    const description = typeof repo === 'string' ? '' : repo.description;
    const language = typeof repo === 'string' ? '' : repo.language;

    return fullName.toLowerCase().includes(state.searchQuery) ||
           description.toLowerCase().includes(state.searchQuery) ||
           language.toLowerCase().includes(state.searchQuery);
  });
}

function formatNumber(num) {
  if (num >= 1000000) {
    return (num / 1000000).toFixed(1) + 'M';
  } else if (num >= 1000) {
    return (num / 1000).toFixed(1) + 'k';
  }
  return num.toString();
}


function renderRepoList() {
  const list = document.getElementById('repoList');
  const paginationControls = document.getElementById('paginationControls');

  if (state.watchedRepos.length === 0) {
    list.innerHTML = '<p class="help-text">No repositories added yet</p>';
    paginationControls.style.display = 'none';
    return;
  }

  const filteredRepos = getFilteredRepos();

  if (filteredRepos.length === 0) {
    list.innerHTML = '<p class="help-text">No repositories match your search</p>';
    paginationControls.style.display = 'none';
    return;
  }

  // Sort repos: pinned repos first, then others
  const sortedRepos = [...filteredRepos].sort((a, b) => {
    const aFullName = typeof a === 'string' ? a : a.fullName;
    const bFullName = typeof b === 'string' ? b : b.fullName;
    const aIsPinned = state.pinnedRepos.includes(aFullName);
    const bIsPinned = state.pinnedRepos.includes(bFullName);

    if (aIsPinned && !bIsPinned) return -1;
    if (!aIsPinned && bIsPinned) return 1;
    return 0;
  });

  // Calculate pagination
  const totalPages = Math.ceil(sortedRepos.length / state.reposPerPage);
  const startIndex = (state.currentPage - 1) * state.reposPerPage;
  const endIndex = startIndex + state.reposPerPage;
  const reposToDisplay = sortedRepos.slice(startIndex, endIndex);

  // Show/hide pagination based on number of repos
  if (filteredRepos.length > state.reposPerPage) {
    paginationControls.style.display = 'flex';
    document.getElementById('prevPage').disabled = state.currentPage === 1;
    document.getElementById('nextPage').disabled = state.currentPage === totalPages;
    document.getElementById('pageInfo').textContent = `Page ${state.currentPage} of ${totalPages}`;
  } else {
    paginationControls.style.display = 'none';
  }

  list.innerHTML = reposToDisplay.map(repo => {
    // Handle both old string format and new object format
    if (typeof repo === 'string') {
      const isMuted = state.mutedRepos.includes(repo);
      const isPinned = state.pinnedRepos.includes(repo);
      const sanitizedRepo = escapeHtml(repo);
      return `
        <li class="repo-item ${isMuted ? 'muted' : ''} ${isPinned ? 'pinned' : ''}">
          <div class="repo-content">
            <div class="repo-name">
              ${sanitizedRepo}
              <button class="link-btn inline-link" data-repo="${sanitizedRepo}" title="Open repository on GitHub">
                ${createSvg(LINK_ICON, 14, 14)}
              </button>
            </div>
            <div class="repo-description">Legacy format - remove and re-add to see details</div>
          </div>
          <div class="repo-actions">
            <button class="pin-btn ${isPinned ? 'pinned' : ''}" data-repo="${sanitizedRepo}" title="${isPinned ? 'Unpin repository' : 'Pin repository'}">
              ${getPinIcon(isPinned)}
            </button>
            <button class="mute-btn ${isMuted ? 'muted' : ''}" data-repo="${sanitizedRepo}" title="${isMuted ? 'Unmute notifications' : 'Mute notifications'}">
              ${getMuteIcon(isMuted)}
            </button>
            <button class="danger" data-repo="${sanitizedRepo}">Remove</button>
          </div>
        </li>
      `;
    }

    const { fullName, description, language, stars, updatedAt, latestRelease } = repo;
    const isMuted = state.mutedRepos.includes(fullName);
    const isPinned = state.pinnedRepos.includes(fullName);

    // Sanitize all user-generated content to prevent XSS
    const sanitizedFullName = escapeHtml(fullName);
    const sanitizedDescription = escapeHtml(description || '');
    const sanitizedLanguage = escapeHtml(language || '');
    const sanitizedReleaseVersion = latestRelease ? escapeHtml(latestRelease.version) : '';

    return `
      <li class="repo-item ${isMuted ? 'muted' : ''} ${isPinned ? 'pinned' : ''}">
        <div class="repo-content">
          <div class="repo-name">
            ${sanitizedFullName}
            <button class="link-btn inline-link" data-repo="${sanitizedFullName}" title="Open repository on GitHub">
              ${createSvg(LINK_ICON, 14, 14)}
            </button>
          </div>
          <div class="repo-description">${sanitizedDescription}</div>
          <div class="repo-meta">
            <span class="meta-item">${createSvg(STAR_ICON, 16, 16, 'star-icon')}${formatNumber(stars)}</span>
            ${sanitizedLanguage ? `<span class="meta-item">${sanitizedLanguage}</span>` : ''}
            ${latestRelease ? `<span class="meta-item">Latest: ${sanitizedReleaseVersion}</span>` : ''}
            <span class="meta-item">Updated ${formatDateVerbose(updatedAt)}</span>
          </div>
        </div>
        <div class="repo-actions">
          <button class="pin-btn ${isPinned ? 'pinned' : ''}" data-repo="${sanitizedFullName}" title="${isPinned ? 'Unpin repository' : 'Pin repository'}">
            ${getPinIcon(isPinned)}
          </button>
          <button class="mute-btn ${isMuted ? 'muted' : ''}" data-repo="${sanitizedFullName}" title="${isMuted ? 'Unmute notifications' : 'Mute notifications'}">
            ${getMuteIcon(isMuted)}
          </button>
          <button class="danger" data-repo="${sanitizedFullName}">Remove</button>
        </div>
      </li>
    `;
  }).join('');

  list.querySelectorAll('.pin-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const repo = btn.dataset.repo;
      const isPinned = state.pinnedRepos.includes(repo);
      togglePinRepo(repo, !isPinned);
    });
  });

  list.querySelectorAll('.mute-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const repo = btn.dataset.repo;
      const isMuted = state.mutedRepos.includes(repo);
      toggleMuteRepo(repo, !isMuted);
    });
  });

  list.querySelectorAll('button.danger').forEach(btn => {
    btn.addEventListener('click', () => {
      removeRepo(btn.dataset.repo);
    });
  });

  list.querySelectorAll('.link-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const repo = btn.dataset.repo;
      await safelyOpenUrl(`https://github.com/${repo}`);
    });
  });
}

async function toggleMuteRepo(repoFullName, mute) {
  if (mute) {
    if (!state.mutedRepos.includes(repoFullName)) {
      state.mutedRepos.push(repoFullName);
    }
  } else {
    state.mutedRepos = state.mutedRepos.filter(r => r !== repoFullName);
    // Track when the repository was unmuted to prevent showing old notifications
    await trackRepoUnmuted(repoFullName);
  }

  // Auto-save and re-render
  await chrome.storage.sync.set({ mutedRepos: state.mutedRepos });
  renderRepoList();

  // Show toast notification
  if (mute) {
    toastManager.info(`Muted notifications for ${repoFullName}`);
  } else {
    toastManager.info(`Unmuted notifications for ${repoFullName}`);
  }
}

async function trackRepoUnmuted(repoFullName) {
  try {
    const settings = await chrome.storage.sync.get(['unmutedRepos']);
    let unmutedRepos = settings.unmutedRepos || [];

    // Remove any existing entry for this repo (in case it was unmuted before)
    unmutedRepos = unmutedRepos.filter(r => r.repo !== repoFullName);

    // Add new entry with current timestamp
    unmutedRepos.push({
      repo: repoFullName,
      unmutedAt: new Date().toISOString()
    });

    // Keep only the last 100 unmuted entries to prevent storage bloat
    if (unmutedRepos.length > 100) {
      unmutedRepos = unmutedRepos.slice(-100);
    }

    await chrome.storage.sync.set({ unmutedRepos });
      } catch (error) {
    console.error(`[DevWatch] Error tracking unmute for ${repoFullName}:`, error);
    // Don't show error to user - this is enhancement functionality
  }
}

async function togglePinRepo(repoFullName, pin) {
  if (pin) {
    if (!state.pinnedRepos.includes(repoFullName)) {
      state.pinnedRepos.push(repoFullName);
    }
  } else {
    state.pinnedRepos = state.pinnedRepos.filter(r => r !== repoFullName);
  }

  // Auto-save and re-render
  await chrome.storage.sync.set({ pinnedRepos: state.pinnedRepos });
  renderRepoList();

  // Show toast notification
  if (pin) {
    toastManager.info(`Pinned ${repoFullName} to the top`);
  } else {
    toastManager.info(`Unpinned ${repoFullName}`);
  }
}


// Import repositories functionality
let importModalState = {
  type: null, // 'watched', 'starred', 'participating'
  repos: [],
  filteredRepos: [],
  previousFocusElement: null
};

// Focus trap helpers for modal accessibility
function getFocusableElements(container) {
  const selector = 'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
  return Array.from(container.querySelectorAll(selector));
}

function handleModalFocusTrap(e) {
  if (e.key !== 'Tab') return;

  const modal = document.getElementById('importModal');
  const focusableElements = getFocusableElements(modal);

  if (focusableElements.length === 0) return;

  const firstElement = focusableElements[0];
  const lastElement = focusableElements[focusableElements.length - 1];

  if (e.shiftKey) {
    // Shift + Tab
    if (document.activeElement === firstElement) {
      e.preventDefault();
      lastElement.focus();
    }
  } else {
    // Tab
    if (document.activeElement === lastElement) {
      e.preventDefault();
      firstElement.focus();
    }
  }
}

function setupModalFocusTrap(modal) {
  modal.addEventListener('keydown', handleModalFocusTrap);
}

async function openImportModal(type) {
  const token = await getToken();
  if (!token) {
    return;
  }

  importModalState.type = type;
  const modal = document.getElementById('importModal');
  const title = document.getElementById('importModalTitle');

  // Set title based on type
  const titles = {
    watched: 'Import Watched Repositories',
    starred: 'Import Starred Repositories',
    participating: 'Import Participating Repositories',
    mine: 'Import My Repositories'
  };

  title.textContent = titles[type] || 'Import Repositories';

  // Store currently focused element for later restoration
  importModalState.previousFocusElement = document.activeElement;

  // Show modal and loading state
  modal.classList.add('show');
  document.getElementById('importLoadingState').style.display = 'flex';
  document.getElementById('importReposList').style.display = 'none';
  document.getElementById('importErrorState').style.display = 'none';

  // Set up focus trap
  setupModalFocusTrap(modal);

  // Focus the close button
  setTimeout(() => {
    const closeBtn = document.getElementById('closeImportModal');
    if (closeBtn) closeBtn.focus();
  }, 100);

  try {
    // Fetch repos from GitHub
    const repos = await fetchReposFromGitHub(type, token);

    // Filter out already added repos
    const alreadyAdded = new Set(
      state.watchedRepos.map(r => (typeof r === 'string' ? r : r.fullName).toLowerCase())
    );

    importModalState.repos = repos.map(repo => ({
      ...repo,
      isAdded: alreadyAdded.has(repo.fullName.toLowerCase())
    }));

    importModalState.filteredRepos = [...importModalState.repos];

    // Show repos list
    document.getElementById('importLoadingState').style.display = 'none';
    document.getElementById('importReposList').style.display = 'block';
    renderImportReposList();
  } catch (error) {
    document.getElementById('importLoadingState').style.display = 'none';
    document.getElementById('importErrorState').style.display = 'block';
    document.getElementById('importErrorMessage').textContent = error.message || 'Failed to fetch repositories';
  }
}

async function fetchReposFromGitHub(type, token) {
  const headers = createHeaders(token);
  let allRepos = [];
  let page = 1;
  const perPage = 100;

  // Determine API endpoint based on type
  const endpoints = {
    watched: 'https://api.github.com/user/subscriptions',
    starred: 'https://api.github.com/user/starred',
    participating: 'https://api.github.com/user/repos?affiliation=collaborator,organization_member&sort=pushed',
    mine: 'https://api.github.com/user/repos?type=all&sort=updated'
  };

  const url = endpoints[type];
  if (!url) {
    throw new Error(`Invalid import type: ${type}`);
  }

  // Fetch all pages
  let hasMorePages = true;
  while (hasMorePages) {
    const response = await fetch(`${url}${url.includes('?') ? '&' : '?'}per_page=${perPage}&page=${page}`, {
      headers
    });

    if (!response.ok) {
      if (response.status === 401) {
        throw new Error('Invalid GitHub token');
      } else if (response.status === 403) {
        throw new Error('Rate limit exceeded or insufficient permissions');
      } else {
        throw new Error(`GitHub API error: ${response.status}`);
      }
    }

    const repos = await response.json();
    if (repos.length === 0) {
      hasMorePages = false;
      break;
    }

    // Transform to our format
    const transformed = repos.map(repo => ({
      fullName: repo.full_name,
      description: repo.description || 'No description provided',
      language: repo.language || 'Unknown',
      stars: repo.stargazers_count || 0,
      forks: repo.forks_count || 0,
      updatedAt: repo.updated_at || repo.pushed_at
    }));

    allRepos.push(...transformed);

    // Check if there are more pages
    const linkHeader = response.headers.get('Link');
    if (!linkHeader || !linkHeader.includes('rel="next"')) {
      hasMorePages = false;
    } else {
      page++;
    }
  }

  return allRepos;
}

function closeImportModal() {
  const modal = document.getElementById('importModal');
  modal.classList.remove('show');
  document.getElementById('importRepoSearch').value = '';

  // Remove focus trap
  modal.removeEventListener('keydown', handleModalFocusTrap);

  // Restore focus to previously focused element
  if (importModalState.previousFocusElement) {
    importModalState.previousFocusElement.focus();
  }

  importModalState = { type: null, repos: [], filteredRepos: [], previousFocusElement: null };
}

function renderImportReposList() {
  const container = document.getElementById('importReposContainer');
  const countEl = document.getElementById('importRepoCount');

  countEl.textContent = importModalState.filteredRepos.length;

  if (importModalState.filteredRepos.length === 0) {
    container.innerHTML = '<p style="text-align: center; color: var(--text-secondary); padding: 20px;">No repositories found</p>';
    return;
  }

  // Sort repos: not-added first, already-added at bottom
  const sortedRepos = [...importModalState.filteredRepos].sort((a, b) => {
    if (a.isAdded && !b.isAdded) return 1;
    if (!a.isAdded && b.isAdded) return -1;
    return 0;
  });

  container.innerHTML = sortedRepos.map(repo => {
    const isDisabled = repo.isAdded;

    // Sanitize all user-generated content to prevent XSS
    const sanitizedFullName = escapeHtml(repo.fullName);
    const sanitizedDescription = escapeHtml(repo.description || '');
    const sanitizedLanguage = escapeHtml(repo.language || '');

    return `
      <li class="repo-item import-variant ${isDisabled ? 'already-added' : ''}" ${!isDisabled ? 'tabindex="0"' : ''} data-repo='${JSON.stringify(repo)}'>
        <div class="repo-content">
          <div class="repo-name">${sanitizedFullName}</div>
          <div class="repo-description">${sanitizedDescription}</div>
          <div class="repo-meta">
            <span class="meta-item">${createSvg(STAR_ICON, 16, 16, 'star-icon')}${formatNumber(repo.stars)}</span>
            ${sanitizedLanguage && sanitizedLanguage !== 'Unknown' ? `<span class="meta-item">${sanitizedLanguage}</span>` : ''}
            <span class="meta-item">Updated ${formatDateVerbose(repo.updatedAt)}</span>
          </div>
        </div>
        ${isDisabled ? '<div class="repo-actions"><span class="already-added-badge">Already added</span></div>' : ''}
      </li>
    `;
  }).join('');

  // Add click and keyboard handlers to make cards selectable
  container.querySelectorAll('.repo-item.import-variant:not(.already-added)').forEach(card => {
    const toggleSelection = () => {
      card.classList.toggle('selected');
      updateSelectedCount();
    };

    card.addEventListener('click', toggleSelection);

    // Add keyboard support for Enter and Space keys
    card.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        toggleSelection();
      }
    });
  });

  updateSelectedCount();
}

function filterImportRepos() {
  const query = document.getElementById('importRepoSearch').value.toLowerCase();

  if (!query) {
    importModalState.filteredRepos = [...importModalState.repos];
  } else {
    importModalState.filteredRepos = importModalState.repos.filter(repo => {
      return repo.fullName.toLowerCase().includes(query) ||
             repo.description.toLowerCase().includes(query) ||
             repo.language.toLowerCase().includes(query);
    });
  }

  renderImportReposList();
}

function updateSelectedCount() {
  const selectedCards = document.querySelectorAll('.repo-item.import-variant.selected:not(.already-added)');
  const count = selectedCards.length;
  document.getElementById('selectedCount').textContent = count;
  document.getElementById('confirmImportBtn').disabled = count === 0;
}

async function importSelectedRepos() {
  const selectedCards = document.querySelectorAll('.repo-item.import-variant.selected:not(.already-added)');
  const reposToImport = Array.from(selectedCards).map(card => JSON.parse(card.dataset.repo));

  if (reposToImport.length === 0) {
    return;
  }

  // Add addedAt timestamp to each repo
  const reposWithTimestamp = reposToImport.map(repo => ({
    ...repo,
    addedAt: new Date().toISOString()
  }));

  // Add to watched repos
  state.watchedRepos.push(...reposWithTimestamp);

  // Save to storage
  await chrome.storage.sync.set({ watchedRepos: state.watchedRepos });

  // Re-render repo list
  renderRepoList();

  // Close modal
  closeImportModal();
}

// Export settings to JSON file
async function exportSettings() {
  try {
    // Get all settings from storage
    const syncData = await chrome.storage.sync.get(null);

    // Create export object with all settings except the token
    const exportData = {
      version: '1.0.0',
      exportedAt: new Date().toISOString(),
      settings: {
        watchedRepos: syncData.watchedRepos || [],
        mutedRepos: syncData.mutedRepos || [],
        pinnedRepos: syncData.pinnedRepos || [],
        filters: syncData.filters || { prs: true, issues: true, releases: true },
        notifications: syncData.notifications || { prs: true, issues: true, releases: true },
        theme: syncData.theme || 'system',
        checkInterval: syncData.checkInterval || 15,
        snoozeHours: syncData.snoozeHours || 1,
        snoozedRepos: syncData.snoozedRepos || []
      }
    };

    // Convert to JSON string
    const jsonString = JSON.stringify(exportData, null, 2);

    // Create blob and download
    const blob = new Blob([jsonString], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `github-devwatch-settings-${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    // Show success toast
    toastManager.success('Settings exported successfully');
  } catch (error) {
    console.error('Export error:', error);
    toastManager.error('Failed to export settings');
  }
}

// Handle import file selection
async function handleImportFile(event) {
  const file = event.target.files[0];
  if (!file) return;

  try {
    const text = await file.text();
    const importData = JSON.parse(text);

    // Validate import data structure
    if (!importData.settings) {
      throw new Error('Invalid settings file format');
    }

    // Confirm import with user
    const confirmed = confirm(
      'This will replace your current settings (except GitHub token). Continue?'
    );

    if (!confirmed) {
      event.target.value = ''; // Reset file input
      toastManager.info('Import cancelled');
      return;
    }

    // Import settings to storage
    const settings = importData.settings;
    await chrome.storage.sync.set({
      watchedRepos: settings.watchedRepos || [],
      mutedRepos: settings.mutedRepos || [],
      pinnedRepos: settings.pinnedRepos || [],
      filters: settings.filters || { prs: true, issues: true, releases: true },
      notifications: settings.notifications || { prs: true, issues: true, releases: true },
      theme: settings.theme || 'system',
      checkInterval: settings.checkInterval || 15,
      snoozeHours: settings.snoozeHours || 1,
      snoozedRepos: settings.snoozedRepos || []
    });

    // Update interval alarm if needed
    if (settings.checkInterval) {
      chrome.runtime.sendMessage({
        action: 'updateInterval',
        interval: settings.checkInterval
      });
    }

    // Reload settings to update UI
    await loadSettings();

    // Show success toast before reload
    toastManager.success('Settings imported successfully - reloading page...');

    // Reload page after short delay
    setTimeout(() => {
      window.location.reload();
    }, 1500);

  } catch (error) {
    console.error('Import error:', error);
    toastManager.error('Failed to import settings: ' + error.message);
  } finally {
    // Reset file input
    event.target.value = '';
  }
}

// Make updateSelectedCount available globally for inline event handlers
window.updateSelectedCount = updateSelectedCount;

// Export functions for testing
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    state,
    validateToken,
    addRepo,
    fetchGitHubRepoFromNpm,
    validateRepo,
    removeRepo,
    cleanupRepoNotifications,
    toggleMuteRepo,
    trackRepoUnmuted,
    getFilteredRepos,
    renderRepoList,
    migrateRepoFormat,
    formatNumber,
    formatDate: formatDateVerbose,  // Export verbose formatter for tests
    exportSettings,
    handleImportFile
  };
}

// Snooze management functions
function renderSnoozedRepos(snoozedRepos) {
  const container = document.getElementById('snoozedReposList');

  // Filter out expired snoozes
  const now = Date.now();
  const activeSnoozes = snoozedRepos.filter(snooze => snooze.expiresAt > now);

  if (activeSnoozes.length === 0) {
    container.innerHTML = `
      <div class="empty-snoozes" id="emptySnoozes">
        <p>No repositories are currently snoozed</p>
        <small>Snooze repositories from the popup to see them here</small>
      </div>
    `;
    return;
  }

  let html = '';

  // Render active snoozes
  if (activeSnoozes.length > 0) {
    activeSnoozes.forEach(snooze => {
      const timeRemaining = formatTimeRemaining(snooze.expiresAt - now);
      const isExpiringSoon = (snooze.expiresAt - now) < 60 * 60 * 1000; // Less than 1 hour

      html += `
        <div class="snoozed-repo-item">
          <div class="snoozed-repo-info">
            <div class="snoozed-repo-name">${escapeHtml(snooze.repo)}</div>
            <div class="snoozed-repo-time">
              ${isExpiringSoon ? `
                <svg class="snooze-expiry-warning" width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
                  <path d="M6.457 1.047c.659-1.234 2.427-1.234 3.086 0l6.082 11.378A1.75 1.75 0 0114.082 15H1.918a1.75 1.75 0 01-1.543-2.575zm1.763.707a.25.25 0 00-.44 0L1.698 13.132a.25.25 0 00.22.368h12.164a.25.25 0 00.22-.368zm.53 3.996v2.5a.75.75 0 11-1.5 0v-2.5a.75.75 0 111.5 0zM9 11a1 1 0 11-2 0 1 1 0 012 0z"/>
                </svg>
              ` : ''}
              Snoozed until ${new Date(snooze.expiresAt).toLocaleString()} (${timeRemaining})
            </div>
          </div>
          <div class="snoozed-repo-actions">
            <button class="unsnooze-btn" data-repo="${escapeHtml(snooze.repo)}"
                    aria-label="Unsnooze ${escapeHtml(snooze.repo)} repository">
              Unsnooze
            </button>
          </div>
        </div>
      `;
    });
  }

  container.innerHTML = html;

  // Add event listeners to the new buttons
  container.querySelectorAll('.unsnooze-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const repo = e.target.dataset.repo;
      unsnoozeRepo(repo);
    });
  });
}

function formatTimeRemaining(milliseconds) {
  const hours = Math.floor(milliseconds / (1000 * 60 * 60));
  const minutes = Math.floor((milliseconds % (1000 * 60 * 60)) / (1000 * 60));

  if (hours > 24) {
    const days = Math.floor(hours / 24);
    const remainingHours = hours % 24;
    return `${days}d ${remainingHours}h`;
  } else if (hours > 0) {
    return `${hours}h ${minutes}m`;
  } else if (minutes > 0) {
    return `${minutes}m`;
  } else {
    return 'Less than 1m';
  }
}

async function unsnoozeRepo(repo) {
  try {
    const settings = await chrome.storage.sync.get(['snoozedRepos']);
    let snoozedRepos = settings.snoozedRepos || [];

    // Remove the snooze for this repo
    snoozedRepos = snoozedRepos.filter(snooze => snooze.repo !== repo);

    await chrome.storage.sync.set({ snoozedRepos });

    // Re-render the snoozed repos list
    renderSnoozedRepos(snoozedRepos);

    // Show success toast
    toastManager.info(`Unsnoozed ${repo} - notifications will resume`);

  } catch (error) {
    console.error(`Error unsnoozing ${repo}:`, error);
    toastManager.error(`Failed to unsnooze ${repo}`);
  }
}


// Auto-refresh snoozed repos list every 5 minutes
setInterval(async () => {
  const settings = await chrome.storage.sync.get(['snoozedRepos']);
  renderSnoozedRepos(settings.snoozedRepos || []);
}, 300000);

// ES6 exports for tests
export {
  state,
  validateToken,
  addRepo,
  fetchGitHubRepoFromNpm,
  validateRepo,
  removeRepo,
  cleanupRepoNotifications,
  trackRepoUnmuted,
  getFilteredRepos,
  renderRepoList,
  migrateRepoFormat,
  formatNumber,
  formatDateVerbose as formatDate,  // Export verbose formatter for tests
  exportSettings,
  handleImportFile
};
