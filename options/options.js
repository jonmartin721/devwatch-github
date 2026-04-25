import { applyTheme, applyColorTheme, formatDateVerbose } from '../shared/utils.js';
import { escapeHtml } from '../shared/sanitize.js';
import {
  clearAuthSession,
  getAuthSession,
  getAccessToken,
  getLocalItem,
  getSettings,
  getWatchedRepos,
  setLocalItem,
  setWatchedRepos,
  updateSettings
} from '../shared/storage-helpers.js';
import { STORAGE_CONFIG } from '../shared/config.js';
import {
  resolveWatchedRepoInput,
  validateWatchedRepo
} from '../shared/repo-service.js';
import {
  CATEGORY_SETTINGS,
  normalizeSettings
} from '../shared/settings-schema.js';
import { NotificationManager } from '../shared/ui/notification-manager.js';
import { OnboardingManager } from '../shared/onboarding.js';

// Controllers
import { setupThemeListener } from './controllers/theme-controller.js';
import { applyStoredConnection, clearToken, connectGitHub } from './controllers/token-controller.js';
import { toggleMuteRepo, togglePinRepo } from './controllers/repository-controller.js';
import { openImportModal, closeImportModal, filterImportRepos, importSelectedRepos, updateSelectedCount } from './controllers/import-controller.js';
import { exportSettings, handleImportFile } from './controllers/export-import-controller.js';
import { renderSnoozedRepos } from './controllers/snooze-controller.js';

// Views
import { renderRepoList } from './views/repository-list-view.js';

// Global toast manager instance (singleton)
const toastManager = NotificationManager.getInstance();
const onboardingManager = new OnboardingManager();
const LATEST_RELEASE_API_URL = 'https://api.github.com/repos/jonmartin721/devwatch-github/releases/latest';
const CHANGELOG_GITHUB_URL = 'https://github.com/jonmartin721/devwatch-github/releases';

const state = {
  watchedRepos: [],
  popularRepos: [],
  mutedRepos: [],
  pinnedRepos: [],
  currentPage: 1,
  reposPerPage: 10,
  searchQuery: '',
  hidePinnedRepos: false
};

let sidebarStatusStorageListener = null;

if (typeof document !== 'undefined') {
  document.addEventListener('DOMContentLoaded', async () => {
    // Initialize toast manager first
    toastManager.init();

    await loadSettings();
    setupSidebarStatusAutoRefresh();
    setupEventListeners();
    setupThemeListener();
    setupSnoozedReposAutoRefresh();

    // Handle URL parameters for enhanced navigation
    handleUrlParameters();

    // Load version and changelog for Help tab
    await loadVersionAndChangelog();
  });
}

// Theme listener imported from controllers/theme-controller.js

function setupTabNavigation() {
  const tabButtons = Array.from(document.querySelectorAll('.tab-button'));
  const tabPanels = Array.from(document.querySelectorAll('.tab-panel'));

  if (tabButtons.length === 0 || tabPanels.length === 0) {
    return;
  }

  const validTabs = tabButtons
    .map(button => button.dataset.tab)
    .filter(Boolean);

  function getTabButton(tabName) {
    return tabButtons.find(button => button.dataset.tab === tabName);
  }

  function switchTab(tabName, { focusTab = false } = {}) {
    if (!validTabs.includes(tabName)) {
      return;
    }

    // Update buttons
    tabButtons.forEach(btn => {
      const isActive = btn.dataset.tab === tabName;
      btn.classList.toggle('active', isActive);
      btn.setAttribute('aria-selected', isActive ? 'true' : 'false');
      btn.tabIndex = isActive ? 0 : -1;
    });

    // Update panels
    tabPanels.forEach(panel => {
      const isActive = panel.dataset.tab === tabName;
      panel.hidden = !isActive;
    });

    // Save to localStorage
    localStorage.setItem('activeTab', tabName);

    // Update URL hash without scrolling
    history.replaceState(null, null, `#${tabName}`);

    if (focusTab) {
      getTabButton(tabName)?.focus();
    }
  }

  // Add click listeners to tab buttons
  tabButtons.forEach((button, index) => {
    button.addEventListener('click', () => {
      switchTab(button.dataset.tab);
    });

    button.addEventListener('keydown', (event) => {
      let targetIndex = null;

      switch (event.key) {
      case 'ArrowUp':
      case 'ArrowLeft':
        targetIndex = (index - 1 + tabButtons.length) % tabButtons.length;
        break;
      case 'ArrowDown':
      case 'ArrowRight':
        targetIndex = (index + 1) % tabButtons.length;
        break;
      case 'Home':
        targetIndex = 0;
        break;
      case 'End':
        targetIndex = tabButtons.length - 1;
        break;
      default:
        return;
      }

      event.preventDefault();
      switchTab(tabButtons[targetIndex].dataset.tab, { focusTab: true });
    });
  });

  // Add click listeners to clickable setup steps
  const bindTabTrigger = (element) => {
    element.addEventListener('click', (event) => {
      event.preventDefault();
      const tabName = element.dataset.tab;
      if (tabName) {
        switchTab(tabName, { focusTab: true });
      }
    });
  };

  const clickableSetupSteps = document.querySelectorAll('.setup-step.clickable');
  clickableSetupSteps.forEach(bindTabTrigger);

  const setupTabLinks = document.querySelectorAll('.setup-inline-link[data-tab]');
  setupTabLinks.forEach(bindTabTrigger);

  // Initialize active tab from localStorage or URL hash
  const hash = window.location.hash.substring(1);
  const savedTab = localStorage.getItem('activeTab');
  const initialTab = hash || savedTab || 'repositories';

  const tabToActivate = validTabs.includes(initialTab) ? initialTab : 'repositories';

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

function togglePopularReposPanel(forceOpen = null) {
  const panel = document.getElementById('popularReposPanel');
  const button = document.getElementById('togglePopularReposBtn');

  if (!panel || !button) {
    return;
  }

  const shouldOpen = forceOpen === null ? !panel.classList.contains('show') : forceOpen;
  panel.classList.toggle('show', shouldOpen);
  button.classList.toggle('active', shouldOpen);
  button.setAttribute('aria-expanded', shouldOpen ? 'true' : 'false');
}

function formatCompactNumber(num) {
  if (!Number.isFinite(num)) {
    return '0';
  }

  if (num >= 1000000) {
    return `${(num / 1000000).toFixed(1).replace(/\.0$/, '')}M`;
  }

  if (num >= 1000) {
    return `${(num / 1000).toFixed(1).replace(/\.0$/, '')}k`;
  }

  return String(num);
}

function getPopularRepoFullName(repo) {
  return `${repo?.owner?.login || 'unknown'}/${repo?.name || 'unknown'}`;
}

function renderPopularReposSection() {
  const popularReposState = document.getElementById('popularReposState');
  const popularReposList = document.getElementById('popularReposList');

  if (!popularReposState || !popularReposList) {
    return;
  }

  const watchedRepoNames = new Set(state.watchedRepos.map(repo => repo.fullName.toLowerCase()));
  const visibleRepos = state.popularRepos
    .filter(repo => !watchedRepoNames.has(getPopularRepoFullName(repo).toLowerCase()))
    .slice(0, 3);

  if (visibleRepos.length === 0) {
    popularReposState.textContent = state.popularRepos.length > 0
      ? 'All suggested repositories are already on your watchlist.'
      : 'No popular repositories are available right now.';
    popularReposState.classList.remove('hidden');
    popularReposList.classList.add('hidden');
    popularReposList.innerHTML = '';
    return;
  }

  popularReposState.classList.add('hidden');
  popularReposList.classList.remove('hidden');
  popularReposList.innerHTML = visibleRepos.map((repo) => {
    const fullName = getPopularRepoFullName(repo);
    const stars = Number.isFinite(repo?.stargazers_count) ? formatCompactNumber(repo.stargazers_count) : '';

    return `
      <div class="popular-repo-card">
        <div class="popular-repo-info">
          <div class="popular-repo-name">${escapeHtml(repo?.owner?.login || 'unknown')}/${escapeHtml(repo?.name || 'unknown')}</div>
          <div class="popular-repo-description">${escapeHtml(repo?.description || `${repo?.language || 'Popular'} project worth watching`)}</div>
          <div class="popular-repo-meta">
            ${repo?.language ? `<span class="meta-item">${escapeHtml(repo.language)}</span>` : ''}
            ${stars ? `<span class="meta-item">${stars} stars</span>` : ''}
          </div>
        </div>
        <button type="button" class="primary popular-repo-add-btn" data-popular-repo="${escapeHtml(fullName)}" aria-label="Add ${escapeHtml(fullName)}">+</button>
      </div>
    `;
  }).join('');

  popularReposList.querySelectorAll('.popular-repo-add-btn').forEach((button) => {
    button.addEventListener('click', async () => {
      const repoFullName = button.dataset.popularRepo;
      if (!repoFullName) {
        return;
      }

      button.disabled = true;

      try {
        const currentSettings = normalizeSettings(await getSettings());
        if (!currentSettings.allowUnlimitedRepos && state.watchedRepos.length >= STORAGE_CONFIG.MAX_WATCHED_REPOS) {
          showRepoError(`Maximum of ${STORAGE_CONFIG.MAX_WATCHED_REPOS} repositories allowed. Enable "Unlimited Repositories" in Advanced settings to watch more.`);
          button.disabled = false;
          return;
        }

        const githubToken = await getAccessToken();
        const resolution = await resolveWatchedRepoInput(repoFullName, {
          githubToken,
          existingRepos: state.watchedRepos
        });

        if (!resolution.valid) {
          showRepoError(resolution.error || 'Repository validation failed');
          button.disabled = false;
          return;
        }

        state.watchedRepos.push(resolution.record);
        state.currentPage = Math.ceil(state.watchedRepos.length / state.reposPerPage);
        renderRepoListWrapper();
        renderPopularReposSection();
        await setWatchedRepos(state.watchedRepos);
        toastManager.success(`Successfully added ${resolution.record.fullName} to watched repositories`);
      } catch (error) {
        console.error('Error adding repository from popular list:', error);
        showRepoError('Failed to add repository. Please try again.');
        button.disabled = false;
      }
    });
  });
}

async function loadPopularRepos() {
  const popularReposState = document.getElementById('popularReposState');
  const popularReposList = document.getElementById('popularReposList');

  if (!popularReposState || !popularReposList) {
    return;
  }

  popularReposState.textContent = 'Loading popular repositories...';
  popularReposState.classList.remove('hidden');
  popularReposList.classList.add('hidden');

  try {
    state.popularRepos = await onboardingManager.getPopularRepos();
    renderPopularReposSection();
  } catch (error) {
    console.error('Error loading popular repositories:', error);
    state.popularRepos = [];
    popularReposState.textContent = 'Could not load popular repositories right now.';
    popularReposState.classList.remove('hidden');
    popularReposList.classList.add('hidden');
  }
}

function syncTokenUiWithStoredCredential(hasStoredToken) {
  applyStoredConnection(hasStoredToken ? { accessToken: 'stored-session' } : null);
}

function shouldClearStoredToken(validationResult) {
  return !validationResult.isValid && validationResult.reason === 'invalid';
}

function getThemeDisplayName(theme) {
  const themeNames = {
    light: 'Light Mode',
    dark: 'Dark Mode',
    system: 'System Theme'
  };

  return themeNames[theme] || theme;
}

function getColorThemeDisplayName(colorTheme) {
  const themeNames = {
    polar: 'Polar',
    graphite: 'Graphite',
    nightfall: 'Nightfall',
    obsidian: 'Obsidian',
    sand: 'Sand',
    'terminal-ledger': 'Terminal Ledger'
  };

  return themeNames[colorTheme] || colorTheme;
}

function formatSidebarTimestamp(timestamp) {
  if (!timestamp) {
    return '';
  }

  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) {
    return '';
  }

  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  }).format(date);
}

function getSidebarAuthMeta(authSession) {
  if (!authSession?.accessToken) {
    return 'Connect GitHub to show the signed-in account and scopes.';
  }

  const authTypeLabel = authSession.authType === 'oauth_device'
    ? 'OAuth device flow'
    : 'GitHub OAuth';
  const scopes = Array.isArray(authSession.scopes) && authSession.scopes.length > 0
    ? authSession.scopes.join(', ')
    : 'scopes unavailable';
  const grantedAt = formatSidebarTimestamp(authSession.grantedAt);

  return grantedAt
    ? `${authTypeLabel} · ${scopes} · since ${grantedAt}`
    : `${authTypeLabel} · ${scopes}`;
}

function getSidebarRateLimitMeta(rateLimit) {
  if (!rateLimit || !Number.isFinite(rateLimit.remaining) || !Number.isFinite(rateLimit.limit)) {
    return 'Updates after the next GitHub request finishes.';
  }

  if (rateLimit.reset) {
    const resetTime = formatSidebarTimestamp(rateLimit.reset);
    if (resetTime) {
      return `Latest GitHub budget snapshot. Resets ${resetTime}.`;
    }
  }

  return 'Latest GitHub budget snapshot from the most recent API response.';
}

function renderSidebarStatus(authSession, rateLimit) {
  const accountEl = document.getElementById('sidebarAuthAccount');
  const authMetaEl = document.getElementById('sidebarAuthMeta');
  const rateValueEl = document.getElementById('sidebarRateLimitValue');
  const rateMetaEl = document.getElementById('sidebarRateLimitMeta');

  if (!accountEl || !authMetaEl || !rateValueEl || !rateMetaEl) {
    return;
  }

  const isConnected = Boolean(authSession?.accessToken);
  accountEl.textContent = isConnected
    ? `@${authSession.username || 'Connected'}`
    : 'Not connected';
  authMetaEl.textContent = getSidebarAuthMeta(authSession);

  if (rateLimit && Number.isFinite(rateLimit.remaining) && Number.isFinite(rateLimit.limit)) {
    rateValueEl.textContent = `${rateLimit.remaining}/${rateLimit.limit} left`;
  } else {
    rateValueEl.textContent = 'No data yet';
  }

  rateMetaEl.textContent = getSidebarRateLimitMeta(rateLimit);
}

async function refreshSidebarStatus(overrides = {}) {
  const authSession = overrides.authSession !== undefined
    ? overrides.authSession
    : await getAuthSession();
  const rateLimit = overrides.rateLimit !== undefined
    ? overrides.rateLimit
    : await getLocalItem('rateLimit', null);

  renderSidebarStatus(authSession, rateLimit);
}

function teardownSidebarStatusAutoRefresh() {
  if (sidebarStatusStorageListener && chrome?.storage?.onChanged) {
    chrome.storage.onChanged.removeListener(sidebarStatusStorageListener);
    sidebarStatusStorageListener = null;
  }
}

function setupSidebarStatusAutoRefresh() {
  if (typeof chrome === 'undefined' || !chrome.storage?.onChanged) {
    return;
  }

  teardownSidebarStatusAutoRefresh();

  sidebarStatusStorageListener = async (changes, areaName) => {
    const authChanged = (areaName === 'local' || areaName === 'session') && changes.githubAuthSession;
    const rateLimitChanged = areaName === 'local' && changes.rateLimit;

    if (!authChanged && !rateLimitChanged) {
      return;
    }

    try {
      await refreshSidebarStatus({
        authSession: authChanged ? changes.githubAuthSession.newValue ?? null : undefined,
        rateLimit: rateLimitChanged ? changes.rateLimit.newValue ?? null : undefined
      });
    } catch (error) {
      console.error('Failed to refresh sidebar status:', error);
    }
  };

  chrome.storage.onChanged.addListener(sidebarStatusStorageListener);

  if (typeof window !== 'undefined') {
    window.addEventListener('beforeunload', teardownSidebarStatusAutoRefresh, { once: true });
  }
}

function getOptionCategorySettingsFromDom() {
  const filters = {};
  const notifications = {};

  CATEGORY_SETTINGS.forEach(({ key, optionsTrackId, optionsNotifyId }) => {
    filters[key] = document.getElementById(optionsTrackId)?.checked !== false;
    notifications[key] = document.getElementById(optionsNotifyId)?.checked === true;
  });

  return { filters, notifications };
}

function applyCategorySettingsToOptions(settings) {
  CATEGORY_SETTINGS.forEach(({ key, optionsTrackId, optionsNotifyId }) => {
    const trackToggle = document.getElementById(optionsTrackId);
    const notifyToggle = document.getElementById(optionsNotifyId);

    if (trackToggle) {
      trackToggle.checked = settings.filters[key] !== false;
    }

    if (notifyToggle) {
      notifyToggle.checked = settings.notifications[key] !== false;
    }
  });
}

function applySettingsToUi(settings) {
  applyTheme(settings.theme);
  applyColorTheme(settings.colorTheme);

  const themeRadio = document.getElementById(`theme-${settings.theme}`);
  if (themeRadio) {
    themeRadio.checked = true;
  }

  const colorThemeRadio = document.getElementById(`color-${settings.colorTheme}`);
  if (colorThemeRadio) {
    colorThemeRadio.checked = true;
  }

  const intervalRadio = document.getElementById(`interval-${settings.checkInterval}`);
  if (intervalRadio) {
    intervalRadio.checked = true;
  }

  const snoozeRadio = document.getElementById(`snooze-${settings.snoozeHours}`);
  if (snoozeRadio) {
    snoozeRadio.checked = true;
  }

  applyCategorySettingsToOptions(settings);

  const itemExpiryEnabled = settings.itemExpiryHours !== null && settings.itemExpiryHours !== undefined;
  document.getElementById('itemExpiryEnabled').checked = itemExpiryEnabled;
  document.getElementById('itemExpiryInputRow').classList.toggle('d-none', !itemExpiryEnabled);
  if (itemExpiryEnabled) {
    document.getElementById('itemExpiryHours').value = settings.itemExpiryHours;
  }

  document.getElementById('markReadOnSnooze').checked = settings.markReadOnSnooze === true;
  document.getElementById('allowUnlimitedRepos').checked = settings.allowUnlimitedRepos === true;
  updateNotificationToggleStates();
}

function setupEventListeners() {
  // Tab navigation
  setupTabNavigation();

  document.getElementById('addRepoBtn').addEventListener('click', addRepo);
  document.getElementById('connectGitHubBtn').addEventListener('click', async () => {
    const result = await connectGitHub(toastManager);
    await refreshSidebarStatus({
      authSession: result?.authSession ?? undefined
    });
  });
  document.getElementById('clearTokenBtn').addEventListener('click', async () => {
    const cleared = await clearToken();
    if (cleared) {
      await refreshSidebarStatus({ authSession: null });
    }
  });

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
  document.getElementById('togglePopularReposBtn').addEventListener('click', async () => {
    togglePopularReposPanel();

    if (state.popularRepos.length === 0) {
      await loadPopularRepos();
    }
  });

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
    repoSearchClear.classList.toggle('hidden', !e.target.value);
  });

  repoSearchClear.addEventListener('click', () => {
    repoSearchInput.value = '';
    state.searchQuery = '';
    state.currentPage = 1;
    renderRepoListWrapper();
    repoSearchClear.classList.add('hidden');
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

  function bindRadioSetting(groupName, key, { formatToast, onChange } = {}) {
    document.querySelectorAll(`input[name="${groupName}"]`).forEach(radio => {
      radio.addEventListener('change', async (e) => {
        const rawValue = e.target.value;
        const value = groupName === 'theme' || groupName === 'colorTheme'
          ? rawValue
          : parseInt(rawValue, 10);

        await updateSettings({ [key]: value });
        await onChange?.(value);

        if (formatToast) {
          toastManager.info(formatToast(value));
        }
      });
    });
  }

  function bindCheckboxSetting(id, key, { onChange } = {}) {
    document.getElementById(id).addEventListener('change', async (e) => {
      const value = e.target.checked;
      await updateSettings({ [key]: value });
      await onChange?.(value);
    });
  }

  bindRadioSetting('theme', 'theme', {
    onChange: async (theme) => applyTheme(theme),
    formatToast: (theme) => `Theme changed to ${getThemeDisplayName(theme)}`
  });

  bindRadioSetting('colorTheme', 'colorTheme', {
    onChange: async (colorTheme) => applyColorTheme(colorTheme),
    formatToast: (colorTheme) => `Color theme changed to ${getColorThemeDisplayName(colorTheme)}`
  });

  bindRadioSetting('checkInterval', 'checkInterval', {
    onChange: async (interval) => {
      chrome.runtime.sendMessage({
        action: 'updateInterval',
        interval
      });
    },
    formatToast: (interval) => `Check interval changed to ${interval} minutes`
  });

  bindRadioSetting('snoozeHours', 'snoozeHours', {
    formatToast: (snoozeHours) => `Default snooze duration changed to ${snoozeHours} hour${snoozeHours > 1 ? 's' : ''}`
  });

  // Auto-save itemExpiryHours changes
  const itemExpiryEnabledCheckbox = document.getElementById('itemExpiryEnabled');
  const itemExpiryHoursInput = document.getElementById('itemExpiryHours');
  const itemExpiryInputRow = document.getElementById('itemExpiryInputRow');

  itemExpiryEnabledCheckbox.addEventListener('change', async (e) => {
    const isEnabled = e.target.checked;
    if (isEnabled) {
      itemExpiryInputRow.classList.remove('d-none');
      const hours = parseInt(itemExpiryHoursInput.value) || 24;
      itemExpiryHoursInput.value = hours;
      await updateSettings({ itemExpiryHours: hours });
      toastManager.info(`Auto-removal enabled: items older than ${hours} hours will be removed`);
    } else {
      itemExpiryInputRow.classList.add('d-none');
      await updateSettings({ itemExpiryHours: null });
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
    await updateSettings({ itemExpiryHours: hours });
    toastManager.info(`Auto-removal time changed to ${hours} hours`);
  });

  bindCheckboxSetting('markReadOnSnooze', 'markReadOnSnooze', {
    onChange: async (markReadOnSnooze) => {
      toastManager.info(`Mark as read on snooze ${markReadOnSnooze ? 'enabled' : 'disabled'}`);
    }
  });

  bindCheckboxSetting('allowUnlimitedRepos', 'allowUnlimitedRepos', {
    onChange: async (allowUnlimitedRepos) => {
      if (allowUnlimitedRepos) {
        toastManager.warning('Unlimited repositories enabled - watch for rate limits');
      } else {
        toastManager.info('Repository limit set to 50');
      }
    }
  });

  CATEGORY_SETTINGS.forEach(({ key, optionsTrackId, optionsNotifyId }) => {
    const trackToggle = document.getElementById(optionsTrackId);
    const notifyToggle = document.getElementById(optionsNotifyId);

    trackToggle?.addEventListener('change', async () => {
      if (!trackToggle.checked && notifyToggle?.checked) {
        notifyToggle.checked = false;
      }

      const categorySettings = getOptionCategorySettingsFromDom();
      await updateSettings(categorySettings);
      updateNotificationToggleStates();
      toastManager.info(`${key === 'prs' ? 'Pull request' : key.slice(0, -1)} tracking ${trackToggle.checked ? 'enabled' : 'disabled'}`);
    });

    notifyToggle?.addEventListener('change', async () => {
      if (notifyToggle.checked && !trackToggle?.checked) {
        notifyToggle.checked = false;
        return;
      }

      const categorySettings = getOptionCategorySettingsFromDom();
      await updateSettings(categorySettings);
      updateNotificationToggleStates();
    });
  });

  // Import modal event listeners
  document.getElementById('closeImportModal').addEventListener('click', closeImportModal);
  document.getElementById('cancelImportBtn').addEventListener('click', closeImportModal);
  document.getElementById('confirmImportBtn').addEventListener('click', async () => {
    const confirmImportBtn = document.getElementById('confirmImportBtn');
    confirmImportBtn.disabled = true;

    try {
      await importSelectedRepos(state.watchedRepos, async () => {
        // Reload repos from storage to update state
        state.watchedRepos = await getWatchedRepos();
        renderRepoListWrapper();
        toastManager.show('Repositories imported successfully', 'success');
      });
    } catch (error) {
      toastManager.error(error.message || 'Failed to import repositories');
      updateSelectedCount();
    }
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
    importSearchClear.classList.toggle('hidden', !e.target.value);
  });

  importSearchClear.addEventListener('click', () => {
    importSearchInput.value = '';
    filterImportRepos();
    importSearchClear.classList.add('hidden');
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
  CATEGORY_SETTINGS.forEach(({ optionsTrackId, optionsNotifyId }) => {
    const filterToggle = document.getElementById(optionsTrackId);
    const notifyToggle = document.getElementById(optionsNotifyId);
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

    const authSession = await getAuthSession();
    const settings = await getSettings();

    if (authSession?.accessToken) {
      applyStoredConnection(authSession);
    } else {
      syncTokenUiWithStoredCredential(false);
    }

    state.watchedRepos = settings.watchedRepos;
    state.mutedRepos = settings.mutedRepos;
    state.pinnedRepos = settings.pinnedRepos;

    renderRepoListWrapper();
    await loadPopularRepos();
    applySettingsToUi(settings);
    await refreshSidebarStatus({ authSession });

    // Load and display current snoozes
    renderSnoozedRepos(settings.snoozedRepos || []);
  } catch (error) {
    console.error('Error loading settings:', error);
    // Set defaults even if error occurs
    state.watchedRepos = state.watchedRepos || [];
    state.mutedRepos = state.mutedRepos || [];
    state.pinnedRepos = state.pinnedRepos || [];
    renderRepoListWrapper();
    renderPopularReposSection();
    await refreshSidebarStatus().catch(() => {});
  }
}

async function addRepo() {
  const input = document.getElementById('repoInput');
  const statusEl = document.getElementById('repoValidationStatus');
  const errorEl = document.getElementById('repoError');
  const repoInput = input.value.trim();

  // Clear previous error state
  input.classList.remove('error');
  errorEl.textContent = '';

  if (!repoInput) {
    return;
  }

  // Check if we've hit the maximum repo limit (unless unlimited repos is enabled)
  const currentSettings = normalizeSettings(await getSettings());
  if (!currentSettings.allowUnlimitedRepos && state.watchedRepos.length >= STORAGE_CONFIG.MAX_WATCHED_REPOS) {
    showRepoError(`Maximum of ${STORAGE_CONFIG.MAX_WATCHED_REPOS} repositories allowed. Enable "Unlimited Repositories" in Advanced settings to watch more.`);
    statusEl.className = 'repo-validation-status error';
    return;
  }

  // Show checking indicator
  statusEl.className = 'repo-validation-status checking';

  try {
    const githubToken = await getAccessToken();
    const resolution = await resolveWatchedRepoInput(repoInput, {
      githubToken,
      existingRepos: state.watchedRepos
    });

    if (!resolution.valid) {
      showRepoError(resolution.error || 'Repository validation failed');
      statusEl.className = 'repo-validation-status error';
      return;
    }

    input.value = resolution.normalizedRepo;
    statusEl.className = 'repo-validation-status success';

    state.watchedRepos.push(resolution.record);

    // Reset to last page to show the newly added repo
    const totalPages = Math.ceil(state.watchedRepos.length / state.reposPerPage);
    state.currentPage = totalPages;

    renderRepoListWrapper();

    // Auto-save
    await setWatchedRepos(state.watchedRepos);

    // Show success toast
    toastManager.success(`Successfully added ${resolution.record.fullName} to watched repositories`);
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
  const githubToken = await getAccessToken();
  return validateWatchedRepo(repo, githubToken);
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
  await setWatchedRepos(state.watchedRepos);

  // Show success toast
  toastManager.success(`Removed ${repoFullName} from watched repositories`);

  // Clean up notifications and activities for the removed repository
  await cleanupRepoNotifications(repoFullName);
}

async function cleanupRepoNotifications(repoFullName) {
  try {
    await chrome.runtime.sendMessage({ action: 'removeRepoData', repo: repoFullName });
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
  renderPopularReposSection();
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
    'This will reset ALL settings to defaults and clear your GitHub connection and repositories.\n\nThis action cannot be undone. Are you sure?'
  );

  if (!confirmed) {
    return;
  }

  try {
    // Clear all storage (both sync and local)
    await clearAuthSession();
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
  const versionInfo = document.getElementById('versionInfo');
  const changelogContent = document.getElementById('changelogContent');

  try {
    // Load version from manifest.json
    const manifestUrl = chrome.runtime.getURL('manifest.json');
    const manifestResponse = await fetch(manifestUrl);
    const manifest = await manifestResponse.json();

    const release = await fetchLatestRelease();

    if (versionInfo) {
      versionInfo.innerHTML = buildVersionBriefHtml(manifest.version, release);
    }

    if (changelogContent) {
      changelogContent.innerHTML = buildLatestReleaseHtml(release);
      bindReleaseSectionChips(changelogContent);
    }
  } catch (error) {
    console.error('Error loading version/changelog:', error);

    if (versionInfo) {
      versionInfo.innerHTML = buildFallbackVersionInfoHtml();
    }
    if (changelogContent) {
      changelogContent.innerHTML = await buildFallbackChangelogHtml();
    }
  }
}

async function fetchLatestRelease() {
  const response = await fetch(LATEST_RELEASE_API_URL, {
    headers: {
      Accept: 'application/vnd.github+json'
    }
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch latest release: ${response.status}`);
  }

  return response.json();
}

function buildVersionBriefHtml(installedVersion, release) {
  const sections = parseReleaseSections(release.body, release.tag_name);
  const displayTitle = extractReleaseTitle(release.name, release.tag_name);
  const publishedAt = formatAbsoluteDate(release.published_at || release.created_at);
  const highlightCards = sections
    .filter(section => section.items.length > 0 || section.paragraphs.length > 0)
    .slice(0, 3)
    .map(section => `
      <div class="release-highlight-card">
        <div class="release-highlight-title">${escapeHtml(section.title)}</div>
        <p class="release-highlight-copy">${renderReleaseInlineMarkdown(summarizeReleaseSection(section))}</p>
      </div>
    `)
    .join('');

  const releasePills = [
    buildVersionPill('Installed', `v${installedVersion}`),
    buildReleasePill('Published', publishedAt)
  ];

  if (release.tag_name && release.tag_name !== `v${installedVersion}`) {
    releasePills.push(buildReleasePill('Latest', release.tag_name));
  }

  return `
    <div class="version-brief">
      <div class="version-brief-top">
        <div>
          <div class="version-label">Latest release</div>
          <h4 class="version-headline">${escapeHtml(release.tag_name || `v${installedVersion}`)}${displayTitle ? ` - ${escapeHtml(displayTitle)}` : ''}</h4>
        </div>
        <div class="release-pills">
          ${releasePills.join('')}
        </div>
      </div>
      <p class="version-summary">${escapeHtml(buildReleaseSummary(displayTitle, sections))}</p>
      ${highlightCards ? `<div class="release-highlight-grid">${highlightCards}</div>` : ''}
    </div>
  `;
}

function buildFallbackVersionInfoHtml() {
  return '<p class="error-text">Unable to load latest release information</p>';
}

async function buildFallbackChangelogHtml() {
  try {
    const changelogUrl = chrome.runtime.getURL('CHANGELOG.md');
    const changelogResponse = await fetch(changelogUrl);
    const changelogText = await changelogResponse.text();
    const changelogHtml = parseChangelogMarkdown(changelogText);

    return changelogHtml + `
      <div class="changelog-footer">
        <a href="https://github.com/jonmartin721/devwatch-github/blob/main/CHANGELOG.md"
           target="_blank"
           rel="noopener noreferrer"
           class="changelog-link">
          <svg width="16" height="16" fill="currentColor" viewBox="0 0 16 16" aria-hidden="true">
            <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"/>
          </svg>
          View full changelog on GitHub
        </a>
      </div>
    `;
  } catch (fallbackError) {
    console.error('Fallback changelog load failed:', fallbackError);
    return `
      <div class="release-empty-state">
        Unable to load the latest release right now. Please try again later.
      </div>
      <div class="changelog-footer">
        <a href="${CHANGELOG_GITHUB_URL}"
           target="_blank"
           rel="noopener noreferrer"
           class="changelog-link">
          <svg width="16" height="16" fill="currentColor" viewBox="0 0 16 16" aria-hidden="true">
            <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"/>
          </svg>
          View releases on GitHub
        </a>
      </div>
    `;
  }
}

function buildLatestReleaseHtml(release) {
  const sections = parseReleaseSections(release.body, release.tag_name);
  const chips = sections
    .map((section, index) => `
      <button type="button"
              class="release-chip${index === 0 ? ' active' : ''}"
              data-target="release-section-${index}"
              aria-pressed="${index === 0 ? 'true' : 'false'}">
        ${escapeHtml(section.title)}
      </button>
    `)
    .join('');

  const sectionCards = sections
    .map((section, index) => {
      const sectionBody = [
        ...section.paragraphs.map(paragraph => `<p>${renderReleaseInlineMarkdown(paragraph)}</p>`),
        section.items.length > 0
          ? `<ul>${section.items.map(item => `<li>${renderReleaseInlineMarkdown(item)}</li>`).join('')}</ul>`
          : ''
      ].join('');

      const countLabel = section.items.length > 0
        ? `${section.items.length} ${section.items.length === 1 ? 'item' : 'items'}`
        : `${section.paragraphs.length} ${section.paragraphs.length === 1 ? 'note' : 'notes'}`;

      return `
        <section id="release-section-${index}" class="release-section">
          <div class="release-section-head">
            <h4 class="release-section-title">${escapeHtml(section.title)}</h4>
            <span class="release-section-count">${escapeHtml(countLabel)}</span>
          </div>
          <div class="release-section-body">${sectionBody}</div>
        </section>
      `;
    })
    .join('');

  return `
    ${chips ? `<div class="release-chip-row">${chips}</div>` : ''}
    <div class="release-notes-list">
      ${sectionCards || '<div class="release-empty-state">No release notes were included with this version.</div>'}
    </div>
    <div class="changelog-footer">
      <a href="${escapeHtml(release.html_url || CHANGELOG_GITHUB_URL)}"
         target="_blank"
         rel="noopener noreferrer"
         class="changelog-link">
        <svg width="16" height="16" fill="currentColor" viewBox="0 0 16 16" aria-hidden="true">
          <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"/>
        </svg>
        View this release on GitHub
      </a>
    </div>
  `;
}

function parseReleaseSections(markdown, releaseTag = '') {
  const normalizedMarkdown = (markdown || '').replace(/\r\n/g, '\n');
  const lines = normalizedMarkdown.split('\n');
  const sections = [];
  let currentSection = null;

  function ensureSection(title = 'Release notes') {
    if (!currentSection) {
      currentSection = { title, paragraphs: [], items: [] };
      sections.push(currentSection);
    }
    return currentSection;
  }

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) {
      continue;
    }

    const levelThreeHeading = line.match(/^###\s+(.+)$/);
    if (levelThreeHeading) {
      currentSection = {
        title: cleanReleaseHeading(levelThreeHeading[1]),
        paragraphs: [],
        items: []
      };
      sections.push(currentSection);
      continue;
    }

    const levelTwoHeading = line.match(/^##\s+(.+)$/);
    if (levelTwoHeading) {
      const title = cleanReleaseHeading(levelTwoHeading[1]);
      if (shouldSkipReleaseHeading(title, releaseTag)) {
        continue;
      }

      currentSection = {
        title,
        paragraphs: [],
        items: []
      };
      sections.push(currentSection);
      continue;
    }

    if (/^[-*]\s+/.test(line)) {
      ensureSection().items.push(line.replace(/^[-*]\s+/, '').trim());
      continue;
    }

    if (/^\d+\.\s+/.test(line)) {
      ensureSection().items.push(line.replace(/^\d+\.\s+/, '').trim());
      continue;
    }

    ensureSection().paragraphs.push(line);
  }

  const nonEmptySections = sections.filter(section => section.items.length > 0 || section.paragraphs.length > 0);
  if (nonEmptySections.length === 0 && normalizedMarkdown.trim()) {
    return [{
      title: 'Release notes',
      paragraphs: [normalizedMarkdown.trim()],
      items: []
    }];
  }

  return nonEmptySections;
}

function cleanReleaseHeading(heading) {
  return heading
    .replace(/\s+[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]+/gu, '')
    .trim();
}

function shouldSkipReleaseHeading(heading, releaseTag) {
  const normalizedHeading = heading.toLowerCase();
  const normalizedTag = releaseTag.toLowerCase();

  return Boolean(
    normalizedHeading === 'changelog' ||
    (normalizedTag && normalizedHeading.startsWith(normalizedTag)) ||
    /^v?\d+\.\d+\.\d+\b/i.test(heading)
  );
}

function extractReleaseTitle(name, tagName) {
  const trimmedName = (name || '').trim();
  if (!trimmedName) {
    return '';
  }

  if (!tagName) {
    return trimmedName;
  }

  const tagPattern = new RegExp(`^${escapeRegExp(tagName)}\\s*[–—:-]\\s*`, 'i');
  return trimmedName.replace(tagPattern, '').trim();
}

function buildReleaseSummary(displayTitle, sections) {
  const sectionNames = sections.slice(0, 3).map(section => section.title);
  if (!displayTitle && sectionNames.length === 0) {
    return 'Read the latest release notes from GitHub.';
  }

  if (displayTitle && sectionNames.length === 0) {
    return `This release focuses on ${displayTitle}.`;
  }

  if (!displayTitle) {
    return `This release includes updates across ${joinNaturalList(sectionNames)}.`;
  }

  return `This release focuses on ${displayTitle} and includes updates across ${joinNaturalList(sectionNames)}.`;
}

function summarizeReleaseSection(section) {
  return section.items[0] || section.paragraphs[0] || 'Release notes updated.';
}

function buildVersionPill(label, value) {
  return `
    <div class="version-badge">
      <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z"/>
      </svg>
      <span>${escapeHtml(label)} ${escapeHtml(value)}</span>
    </div>
  `;
}

function buildReleasePill(label, value) {
  return `
    <div class="release-pill">
      <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/>
      </svg>
      <span>${escapeHtml(label)} ${escapeHtml(value)}</span>
    </div>
  `;
}

function renderReleaseInlineMarkdown(text) {
  let html = escapeHtml(text || '');

  html = html.replace(
    /\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g,
    '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>'
  );
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>');

  return html;
}

function bindReleaseSectionChips(container) {
  const chips = Array.from(container.querySelectorAll('.release-chip'));
  if (chips.length === 0) {
    return;
  }

  chips.forEach(chip => {
    chip.addEventListener('click', () => {
      const targetId = chip.dataset.target;
      if (!targetId) {
        return;
      }

      const selector = typeof window !== 'undefined' && window.CSS && typeof window.CSS.escape === 'function'
        ? `#${window.CSS.escape(targetId)}`
        : `#${targetId}`;
      const target = container.querySelector(selector);
      if (target) {
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }

      chips.forEach(button => {
        button.classList.remove('active');
        button.setAttribute('aria-pressed', 'false');
      });

      chip.classList.add('active');
      chip.setAttribute('aria-pressed', 'true');
    });
  });
}

function formatAbsoluteDate(dateString) {
  if (!dateString) {
    return 'Unknown date';
  }

  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) {
    return 'Unknown date';
  }

  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  }).format(date);
}

function joinNaturalList(items) {
  if (items.length === 0) {
    return '';
  }

  if (items.length === 1) {
    return items[0];
  }

  if (items.length === 2) {
    return `${items[0]} and ${items[1]}`;
  }

  return `${items.slice(0, -1).join(', ')}, and ${items[items.length - 1]}`;
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
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

// Auto-refresh snoozed repos list:
// - storage.onChanged: react instantly when snoozes are added/removed
// - interval: tick down "time remaining" so expired snoozes drop off the list
let snoozedReposRefreshIntervalId = null;
let snoozedReposStorageListener = null;

function setupSnoozedReposAutoRefresh() {
  if (typeof chrome === 'undefined' || !chrome.storage) {
    return;
  }

  const refresh = async () => {
    try {
      const settings = await chrome.storage.sync.get(['snoozedRepos']);
      renderSnoozedRepos(settings.snoozedRepos || []);
    } catch (error) {
      console.error('Failed to refresh snoozed repos:', error);
    }
  };

  snoozedReposStorageListener = (changes, areaName) => {
    if (areaName === 'sync' && changes.snoozedRepos) {
      renderSnoozedRepos(changes.snoozedRepos.newValue || []);
    }
  };
  chrome.storage.onChanged.addListener(snoozedReposStorageListener);

  snoozedReposRefreshIntervalId = setInterval(refresh, 300000);

  if (typeof window !== 'undefined') {
    window.addEventListener('beforeunload', teardownSnoozedReposAutoRefresh, { once: true });
  }
}

function teardownSnoozedReposAutoRefresh() {
  if (snoozedReposRefreshIntervalId !== null) {
    clearInterval(snoozedReposRefreshIntervalId);
    snoozedReposRefreshIntervalId = null;
  }
  if (snoozedReposStorageListener && chrome?.storage?.onChanged) {
    chrome.storage.onChanged.removeListener(snoozedReposStorageListener);
    snoozedReposStorageListener = null;
  }
}

// ES6 exports for tests
export {
  state,
  setupTabNavigation,
  loadSettings,
  setupEventListeners,
  addRepo,
  validateRepo,
  removeRepo,
  cleanupRepoNotifications,
  getFilteredRepos,
  renderRepoList,
  shouldClearStoredToken,
  syncTokenUiWithStoredCredential,
  formatNumber,
  formatDateVerbose as formatDate,  // Export verbose formatter for tests
  exportSettings,
  handleImportFile,
  clearCacheData,
  clearAllData,
  resetSettings
};
