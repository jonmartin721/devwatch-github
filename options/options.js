import { applyTheme, formatDateVerbose } from '../shared/utils.js';
import { getToken, setToken, getLocalItems, setLocalItem } from '../shared/storage-helpers.js';
import { createHeaders } from '../shared/github-api.js';
import { STORAGE_CONFIG, VALIDATION_PATTERNS } from '../shared/config.js';
import { validateRepository } from '../shared/repository-validator.js';
import { fetchGitHubRepoFromNpm } from '../shared/api/npm-api.js';
import { NotificationManager } from '../shared/ui/notification-manager.js';

// Controllers
import { setupThemeListener } from './controllers/theme-controller.js';
import { clearToken, validateToken } from './controllers/token-controller.js';
import { toggleMuteRepo, togglePinRepo } from './controllers/repository-controller.js';
import { openImportModal, closeImportModal, filterImportRepos, importSelectedRepos, updateSelectedCount } from './controllers/import-controller.js';
import { exportSettings, handleImportFile } from './controllers/export-import-controller.js';
import { renderSnoozedRepos } from './controllers/snooze-controller.js';

// Views
import { renderRepoList } from './views/repository-list-view.js';

// Global toast manager instance (singleton)
const toastManager = NotificationManager.getInstance();

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

    // Load version and changelog for Help tab
    await loadVersionAndChangelog();
  });
}

// Theme listener imported from controllers/theme-controller.js

function setupTabNavigation() {
  const tabButtons = document.querySelectorAll('.tab-button');
  const tabPanels = document.querySelectorAll('.tab-panel');

  // Function to switch tabs
  function switchTab(tabName) {
    // Update buttons
    tabButtons.forEach(btn => {
      const isActive = btn.dataset.tab === tabName;
      btn.classList.toggle('active', isActive);
      btn.setAttribute('aria-selected', isActive);
    });

    // Update panels
    tabPanels.forEach(panel => {
      panel.classList.toggle('active', panel.dataset.tab === tabName);
    });

    // Save to localStorage
    localStorage.setItem('activeTab', tabName);

    // Update URL hash without scrolling
    history.replaceState(null, null, `#${tabName}`);
  }

  // Add click listeners to tab buttons
  tabButtons.forEach(button => {
    button.addEventListener('click', () => {
      switchTab(button.dataset.tab);
    });
  });

  // Add click listeners to clickable setup steps
  const clickableSetupSteps = document.querySelectorAll('.setup-step.clickable');
  clickableSetupSteps.forEach(step => {
    step.addEventListener('click', () => {
      const tabName = step.dataset.tab;
      if (tabName) {
        switchTab(tabName);
      }
    });
  });

  // Initialize active tab from localStorage or URL hash
  const hash = window.location.hash.substring(1);
  const savedTab = localStorage.getItem('activeTab');
  const initialTab = hash || savedTab || 'setup';

  // Check if the hash/saved tab is valid
  const validTabs = ['setup', 'repositories', 'filters', 'preferences', 'advanced', 'help'];
  const tabToActivate = validTabs.includes(initialTab) ? initialTab : 'setup';

  switchTab(tabToActivate);
}

function handleUrlParameters() {
  // Check for URL parameters to enhance user experience
  const urlParams = new URLSearchParams(window.location.search);

  // Focus on repo input if showAdd parameter is present
  if (urlParams.get('showAdd') === 'true') {
    // Wait a bit for DOM to be fully ready
    setTimeout(() => {
      const repoInput = document.getElementById('repoInput');
      if (repoInput) {
        repoInput.focus();
      }
    }, 100);
  }

}

function setupEventListeners() {
  // Tab navigation
  setupTabNavigation();

  document.getElementById('addRepoBtn').addEventListener('click', addRepo);
  document.getElementById('clearTokenBtn').addEventListener('click', clearToken);

  // Action button toggles
  const hidePinnedToggleBtn = document.getElementById('hidePinnedToggleBtn2');

  if (hidePinnedToggleBtn) {
    hidePinnedToggleBtn.addEventListener('click', toggleHidePinned);
  }

  // Import repos buttons
  document.getElementById('importWatchedBtn').addEventListener('click', () => openImportModal('watched', state.watchedRepos));
  document.getElementById('importStarredBtn').addEventListener('click', () => openImportModal('starred', state.watchedRepos));
  document.getElementById('importParticipatingBtn').addEventListener('click', () => openImportModal('participating', state.watchedRepos));
  document.getElementById('importMineBtn').addEventListener('click', () => openImportModal('mine', state.watchedRepos));

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
    renderRepoListWrapper();

    // Show/hide clear button
    repoSearchClear.style.display = e.target.value ? 'flex' : 'none';
  });

  repoSearchClear.addEventListener('click', () => {
    repoSearchInput.value = '';
    state.searchQuery = '';
    state.currentPage = 1;
    renderRepoListWrapper();
    repoSearchClear.style.display = 'none';
    repoSearchInput.focus();
  });

  // Listen for custom hide pinned toggle event
  document.addEventListener('hidePinnedToggle', (e) => {
    state.hidePinnedRepos = e.detail.hidden;
    state.currentPage = 1; // Reset to first page
    renderRepoListWrapper();
  });

  // Pagination controls
  document.getElementById('prevPage').addEventListener('click', () => {
    if (state.currentPage > 1) {
      state.currentPage--;
      renderRepoListWrapper();
    }
  });

  document.getElementById('nextPage').addEventListener('click', () => {
    const filteredRepos = getFilteredRepos();
    const totalPages = Math.ceil(filteredRepos.length / state.reposPerPage);
    if (state.currentPage < totalPages) {
      state.currentPage++;
      renderRepoListWrapper();
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
      await validateToken(token, toastManager);
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

  // Auto-save itemExpiryHours changes
  const itemExpiryEnabledCheckbox = document.getElementById('itemExpiryEnabled');
  const itemExpiryHoursInput = document.getElementById('itemExpiryHours');
  const itemExpiryInputRow = document.getElementById('itemExpiryInputRow');

  itemExpiryEnabledCheckbox.addEventListener('change', async (e) => {
    const isEnabled = e.target.checked;
    if (isEnabled) {
      itemExpiryInputRow.style.display = 'block';
      const hours = parseInt(itemExpiryHoursInput.value) || 24;
      itemExpiryHoursInput.value = hours;
      await chrome.storage.sync.set({ itemExpiryHours: hours });
      toastManager.info(`Auto-removal enabled: items older than ${hours} hours will be removed`);
    } else {
      itemExpiryInputRow.style.display = 'none';
      await chrome.storage.sync.set({ itemExpiryHours: null });
      toastManager.info('Auto-removal disabled');
    }
  });

  itemExpiryHoursInput.addEventListener('change', async (e) => {
    let hours = parseInt(e.target.value);
    if (isNaN(hours) || hours < 1) {
      hours = 1;
      e.target.value = 1;
    } else if (hours > 168) {
      hours = 168;
      e.target.value = 168;
    }
    await chrome.storage.sync.set({ itemExpiryHours: hours });
    toastManager.info(`Auto-removal time changed to ${hours} hours`);
  });

  // Auto-save markReadOnSnooze changes
  document.getElementById('markReadOnSnooze').addEventListener('change', async (e) => {
    const markReadOnSnooze = e.target.checked;
    await chrome.storage.sync.set({ markReadOnSnooze });
    toastManager.info(`Mark as read on snooze ${markReadOnSnooze ? 'enabled' : 'disabled'}`);
  });

  // Auto-save allowUnlimitedRepos changes
  document.getElementById('allowUnlimitedRepos').addEventListener('change', async (e) => {
    const allowUnlimitedRepos = e.target.checked;
    await chrome.storage.sync.set({ allowUnlimitedRepos });
    if (allowUnlimitedRepos) {
      toastManager.warning('Unlimited repositories enabled - watch for rate limits');
    } else {
      toastManager.info('Repository limit set to 50');
    }
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
  document.getElementById('confirmImportBtn').addEventListener('click', async () => {
    await importSelectedRepos(state.watchedRepos, async () => {
      // Reload repos from storage to update state
      const result = await chrome.storage.sync.get(['watchedRepos']);
      state.watchedRepos = result.watchedRepos || [];
      renderRepoListWrapper();
      toastManager.show('Repositories imported successfully', 'success');
    });
  });

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

  // Data Management buttons
  document.getElementById('clearCacheBtn').addEventListener('click', clearCacheData);
  document.getElementById('clearAllDataBtn').addEventListener('click', clearAllData);
  document.getElementById('resetSettingsBtn').addEventListener('click', resetSettings);

}

// Panel toggle functionality (removed Add panel toggle, keeping search panel always visible)

function toggleHidePinned() {
  const btn = document.getElementById('hidePinnedToggleBtn2');
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

// Token functions imported from controllers/token-controller.js

async function loadSettings() {
  try {
    // Check if running in a Chrome extension context
    if (typeof chrome === 'undefined' || !chrome.storage) {
      console.warn('Not running in Chrome extension context. Using default settings.');
      // Use default values for demo/testing purposes
      state.watchedRepos = [];
      state.mutedRepos = [];
      state.pinnedRepos = [];
      renderRepoListWrapper();
      return;
    }

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
      'theme',
      'itemExpiryHours',
      'markReadOnSnooze',
      'allowUnlimitedRepos'
    ]);

    const snoozeSettings = await chrome.storage.sync.get(['snoozedRepos']);

    // Safety check: if settings is undefined or null, use defaults
    if (!settings || !snoozeSettings) {
      console.warn('Storage returned undefined/null. Using default settings.');
      state.watchedRepos = [];
      state.mutedRepos = [];
      state.pinnedRepos = [];
      renderRepoListWrapper();
      return;
    }

    // Load and apply theme
    const theme = settings.theme || 'system';
    applyTheme(theme);

    if (githubToken) {
      document.getElementById('githubToken').value = githubToken;
      document.getElementById('clearTokenBtn').style.display = 'block';
      // Validate existing token
      validateToken(githubToken, toastManager);
    } else {
      // No token - set appropriate placeholder and help text
      const repoInput = document.getElementById('repoInput');
      repoInput.disabled = true;
      repoInput.placeholder = 'Enter a valid GitHub token to add repositories';
      document.getElementById('addRepoBtn').disabled = true;
      document.getElementById('repoHelpText').textContent = 'Add a valid GitHub token above to start adding repositories';
      const importSection = document.getElementById('importReposSection');
      importSection.classList.add('hidden');
      importSection.style.display = 'none';
    }

    state.watchedRepos = settings.watchedRepos || [];
    state.mutedRepos = settings.mutedRepos || [];
    state.pinnedRepos = settings.pinnedRepos || [];

    renderRepoListWrapper();

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

    // Load itemExpiryHours setting
    const itemExpiryEnabled = settings.itemExpiryHours !== null && settings.itemExpiryHours !== undefined;
    document.getElementById('itemExpiryEnabled').checked = itemExpiryEnabled;
    if (itemExpiryEnabled) {
      document.getElementById('itemExpiryHours').value = settings.itemExpiryHours;
      document.getElementById('itemExpiryInputRow').style.display = 'block';
    }

    // Load markReadOnSnooze setting (default to false - pause not dismiss)
    const markReadOnSnooze = settings.markReadOnSnooze === true;
    document.getElementById('markReadOnSnooze').checked = markReadOnSnooze;

    // Load allowUnlimitedRepos setting (default to false)
    const allowUnlimitedRepos = settings.allowUnlimitedRepos === true;
    document.getElementById('allowUnlimitedRepos').checked = allowUnlimitedRepos;

    // Update notification toggle states after loading settings
    updateNotificationToggleStates();

    // Load and display current snoozes
    renderSnoozedRepos(snoozeSettings.snoozedRepos || []);
  } catch (error) {
    console.error('Error loading settings:', error);
    // Set defaults even if error occurs
    state.watchedRepos = state.watchedRepos || [];
    state.mutedRepos = state.mutedRepos || [];
    state.pinnedRepos = state.pinnedRepos || [];
    renderRepoListWrapper();
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

  // Check if we've hit the maximum repo limit (unless unlimited repos is enabled)
  const { allowUnlimitedRepos } = await chrome.storage.sync.get(['allowUnlimitedRepos']);
  if (!allowUnlimitedRepos && state.watchedRepos.length >= STORAGE_CONFIG.MAX_WATCHED_REPOS) {
    showRepoError(`Maximum of ${STORAGE_CONFIG.MAX_WATCHED_REPOS} repositories allowed. Enable "Unlimited Repositories" in Advanced settings to watch more.`);
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
    // Add timestamp to track when repo was added (for filtering old activities)
    state.watchedRepos.push({
      ...validationResult,
      addedAt: new Date().toISOString()
    });

    // Reset to last page to show the newly added repo
    const totalPages = Math.ceil(state.watchedRepos.length / state.reposPerPage);
    state.currentPage = totalPages;

    renderRepoListWrapper();

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
      }
    };
  } catch (_error) {
    // If release fetch fails, return basic validation result
    return {
      valid: true,
      metadata: {
        ...basicResult.metadata,
        latestRelease: null
      }
    };
  }
}

async function removeRepo(repoFullName) {
  state.watchedRepos = state.watchedRepos.filter(r => r.fullName !== repoFullName);

  // Adjust current page if we deleted the last item on a page
  const totalPages = Math.ceil(state.watchedRepos.length / state.reposPerPage);
  if (state.currentPage > totalPages && state.currentPage > 1) {
    state.currentPage = totalPages;
  }

  renderRepoListWrapper();

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
      return !state.pinnedRepos.includes(repo.fullName);
    });
  }

  // Apply search filter
  if (!state.searchQuery) {
    return repos;
  }

  return repos.filter(repo => {
    const description = repo.description || '';
    const language = repo.language || '';

    return repo.fullName.toLowerCase().includes(state.searchQuery) ||
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


// Wrapper for renderRepoList to pass callbacks
function renderRepoListWrapper() {
  renderRepoList(
    state,
    (repo, mute) => toggleMuteRepo(repo, mute, state, renderRepoListWrapper),
    (repo, pin) => togglePinRepo(repo, pin, state, renderRepoListWrapper),
    (repo) => removeRepo(repo)
  );
}

// Global wrapper for external calls
window.renderRepoList = renderRepoListWrapper;


// Import modal wrappers to pass state
window.openImportModalWrapper = (type) => openImportModal(type, state.watchedRepos);
window.closeImportModalWrapper = closeImportModal;
window.filterImportReposWrapper = filterImportRepos;
window.importSelectedReposWrapper = () => importSelectedRepos(state.watchedRepos, () => renderRepoListWrapper());

// Export/import wrappers
window.exportSettingsWrapper = exportSettings;
window.handleImportFileWrapper = (event) => handleImportFile(event, loadSettings);

// Make updateSelectedCount available globally for inline event handlers
window.updateSelectedCount = updateSelectedCount;

// Export functions for testing
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    state,
    validateToken,
    addRepo,
    validateRepo,
    removeRepo,
    cleanupRepoNotifications,
    toggleMuteRepo,
    getFilteredRepos,
    renderRepoList,
    formatNumber,
    formatDate: formatDateVerbose,  // Export verbose formatter for tests
    exportSettings,
    handleImportFile,
    clearCacheData,
    clearAllData,
    resetSettings
  };
}

// Snooze functions are now imported from controllers/snooze-controller.js

// Data Management Functions
/**
 * Clear cache data (activities only, preserves settings and repos)
 */
async function clearCacheData() {
  try {
    await setLocalItem('activities', []);
    await setLocalItem('readItems', []);

    // Reset badge count
    chrome.runtime.sendMessage({ action: 'clearBadge' });

    toastManager.success('Cache cleared successfully');
  } catch (error) {
    console.error('Error clearing cache:', error);
    toastManager.error('Failed to clear cache');
  }
}

/**
 * Clear all data (activities and activity history, preserves settings and repos)
 */
async function clearAllData() {
  // Show confirmation dialog
  const confirmed = confirm(
    'This will clear all cached data and activity history, but preserve your settings and repositories.\n\nAre you sure you want to continue?'
  );

  if (!confirmed) {
    return;
  }

  try {
    // Clear local storage (activities, readItems, collapsedRepos, etc.)
    await chrome.storage.local.clear();

    // Reset badge count
    chrome.runtime.sendMessage({ action: 'clearBadge' });

    toastManager.success('All data cleared successfully');
  } catch (error) {
    console.error('Error clearing all data:', error);
    toastManager.error('Failed to clear data');
  }
}

/**
 * Reset all settings to defaults (clears everything)
 */
async function resetSettings() {
  // Show confirmation dialog
  const confirmed = confirm(
    'This will reset ALL settings to defaults and clear your GitHub token and repositories.\n\nThis action cannot be undone. Are you sure?'
  );

  if (!confirmed) {
    return;
  }

  try {
    // Clear all storage (both sync and local)
    await chrome.storage.sync.clear();
    await chrome.storage.local.clear();

    // Reset badge count
    chrome.runtime.sendMessage({ action: 'clearBadge' });

    toastManager.success('Settings reset to defaults');

    // Reload the page to show default state
    setTimeout(() => {
      window.location.reload();
    }, 1000);
  } catch (error) {
    console.error('Error resetting settings:', error);
    toastManager.error('Failed to reset settings');
  }
}

/**
 * Load and display version information and changelog
 */
async function loadVersionAndChangelog() {
  try {
    // Load version from manifest.json
    const manifestUrl = chrome.runtime.getURL('manifest.json');
    const manifestResponse = await fetch(manifestUrl);
    const manifest = await manifestResponse.json();

    const versionInfo = document.getElementById('versionInfo');
    if (versionInfo) {
      versionInfo.innerHTML = `
        <div class="version-badge">
          <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z"/>
          </svg>
          <span>Current Version: <strong>v${manifest.version}</strong></span>
        </div>
      `;
    }

    // Load changelog from CHANGELOG.md
    const changelogUrl = chrome.runtime.getURL('CHANGELOG.md');
    const changelogResponse = await fetch(changelogUrl);
    const changelogText = await changelogResponse.text();

    // Parse markdown to HTML (basic conversion)
    const changelogHtml = parseChangelogMarkdown(changelogText);

    const changelogContent = document.getElementById('changelogContent');
    if (changelogContent) {
      changelogContent.innerHTML = changelogHtml;
    }
  } catch (error) {
    console.error('Error loading version/changelog:', error);
    const versionInfo = document.getElementById('versionInfo');
    const changelogContent = document.getElementById('changelogContent');
    if (versionInfo) {
      versionInfo.innerHTML = '<p class="error-text">Unable to load version information</p>';
    }
    if (changelogContent) {
      changelogContent.innerHTML = '<p class="error-text">Unable to load changelog</p>';
    }
  }
}

/**
 * Convert changelog markdown to HTML
 * @param {string} markdown - The markdown text
 * @returns {string} HTML string
 */
function parseChangelogMarkdown(markdown) {
  let html = markdown;

  // Convert headers
  html = html.replace(/^### (.+)$/gm, '<h4>$1</h4>');
  html = html.replace(/^## (.+)$/gm, '<h3>$1</h3>');
  html = html.replace(/^# (.+)$/gm, '<h2>$1</h2>');

  // Convert links
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');

  // Convert bold
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');

  // Convert inline code
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>');

  // Convert bullet lists
  html = html.replace(/^- (.+)$/gm, '<li>$1</li>');

  // Wrap consecutive <li> elements in <ul>
  html = html.replace(/(<li>.*<\/li>\n?)+/g, (match) => {
    return '<ul>' + match + '</ul>';
  });

  // Convert paragraphs (lines separated by blank lines)
  html = html.split('\n\n').map(paragraph => {
    // Skip if already wrapped in a tag
    if (paragraph.startsWith('<')) return paragraph;
    // Skip if empty
    if (paragraph.trim() === '') return '';
    // Wrap in paragraph
    return `<p>${paragraph}</p>`;
  }).join('\n');

  // Convert line breaks
  html = html.replace(/\n/g, '<br>');

  // Clean up multiple <br> tags
  html = html.replace(/(<br>)+/g, '<br>');
  html = html.replace(/<\/h[234]><br>/g, '</h4>');
  html = html.replace(/<\/ul><br>/g, '</ul>');
  html = html.replace(/<\/p><br>/g, '</p>');

  return html;
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
  validateRepo,
  removeRepo,
  cleanupRepoNotifications,
  getFilteredRepos,
  renderRepoList,
  formatNumber,
  formatDateVerbose as formatDate,  // Export verbose formatter for tests
  exportSettings,
  handleImportFile,
  clearCacheData,
  clearAllData,
  resetSettings
};
