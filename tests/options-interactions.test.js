import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, jest, test } from '@jest/globals';

const mockApplyTheme = jest.fn();
const mockApplyColorTheme = jest.fn();
const mockGetSettings = jest.fn();
const mockGetWatchedRepos = jest.fn();
const mockUpdateSettings = jest.fn();
const mockGetAuthSession = jest.fn();
const mockClearAuthSession = jest.fn();
const mockSetLocalItem = jest.fn();
const mockSetWatchedRepos = jest.fn();
const mockGetAccessToken = jest.fn();
const mockResolveWatchedRepoInput = jest.fn();
const mockValidateWatchedRepo = jest.fn();
const toastInstance = {
  init: jest.fn(),
  info: jest.fn(),
  success: jest.fn(),
  error: jest.fn(),
  warning: jest.fn(),
  show: jest.fn()
};
const mockSetupThemeListener = jest.fn();
const mockApplyStoredConnection = jest.fn();
const mockClearToken = jest.fn();
const mockConnectGitHub = jest.fn();
const mockToggleMuteRepo = jest.fn();
const mockTogglePinRepo = jest.fn();
const mockOpenImportModal = jest.fn();
const mockCloseImportModal = jest.fn();
const mockFilterImportRepos = jest.fn();
const mockImportSelectedRepos = jest.fn();
const mockUpdateSelectedCount = jest.fn();
const mockExportSettings = jest.fn();
const mockHandleImportFile = jest.fn();
const mockRenderSnoozedRepos = jest.fn();
const mockRenderRepoList = jest.fn();

jest.unstable_mockModule('../shared/utils.js', () => ({
  applyTheme: mockApplyTheme,
  applyColorTheme: mockApplyColorTheme,
  formatDateVerbose: jest.fn((value) => value)
}));

jest.unstable_mockModule('../shared/storage-helpers.js', () => ({
  clearAuthSession: mockClearAuthSession,
  getAuthSession: mockGetAuthSession,
  getAccessToken: mockGetAccessToken,
  getSettings: mockGetSettings,
  getWatchedRepos: mockGetWatchedRepos,
  setLocalItem: mockSetLocalItem,
  setWatchedRepos: mockSetWatchedRepos,
  updateSettings: mockUpdateSettings
}));

jest.unstable_mockModule('../shared/repo-service.js', () => ({
  resolveWatchedRepoInput: mockResolveWatchedRepoInput,
  validateWatchedRepo: mockValidateWatchedRepo
}));

jest.unstable_mockModule('../shared/ui/notification-manager.js', () => ({
  NotificationManager: {
    getInstance: () => toastInstance
  }
}));

jest.unstable_mockModule('../options/controllers/theme-controller.js', () => ({
  setupThemeListener: mockSetupThemeListener
}));

jest.unstable_mockModule('../options/controllers/token-controller.js', () => ({
  applyStoredConnection: mockApplyStoredConnection,
  clearToken: mockClearToken,
  connectGitHub: mockConnectGitHub
}));

jest.unstable_mockModule('../options/controllers/repository-controller.js', () => ({
  toggleMuteRepo: mockToggleMuteRepo,
  togglePinRepo: mockTogglePinRepo
}));

jest.unstable_mockModule('../options/controllers/import-controller.js', () => ({
  openImportModal: mockOpenImportModal,
  closeImportModal: mockCloseImportModal,
  filterImportRepos: mockFilterImportRepos,
  importSelectedRepos: mockImportSelectedRepos,
  updateSelectedCount: mockUpdateSelectedCount
}));

jest.unstable_mockModule('../options/controllers/export-import-controller.js', () => ({
  exportSettings: mockExportSettings,
  handleImportFile: mockHandleImportFile
}));

jest.unstable_mockModule('../options/controllers/snooze-controller.js', () => ({
  renderSnoozedRepos: mockRenderSnoozedRepos
}));

jest.unstable_mockModule('../options/views/repository-list-view.js', () => ({
  renderRepoList: mockRenderRepoList
}));

const {
  addRepo,
  clearAllData,
  clearCacheData,
  loadSettings,
  resetSettings,
  setupEventListeners,
  setupTabNavigation,
  state
} = await import('../options/options.js');

const optionsStyles = readFileSync(new URL('../options/options.css', import.meta.url), 'utf8');

function renderOptionsDom() {
  document.body.innerHTML = `
    <button id="connectGitHubBtn">Connect GitHub</button>
    <div id="tokenStatus"></div>
    <button id="clearTokenBtn"></button>
    <input id="repoInput" />
    <button id="addRepoBtn"></button>
    <div id="repoHelpText"></div>
    <div id="importReposSection"></div>
    <button id="togglePopularReposBtn" aria-expanded="false"></button>
    <div id="popularReposPanel" class="repo-panel"></div>
    <button id="importWatchedBtn" class="github-import-btn hidden"></button>
    <button id="importStarredBtn" class="github-import-btn hidden"></button>
    <button id="importParticipatingBtn" class="github-import-btn hidden"></button>
    <button id="importMineBtn" class="github-import-btn hidden"></button>
    <div id="repoValidationStatus"></div>
    <div id="repoError"></div>
    <div id="popularReposState"></div>
    <div id="popularReposList" class="hidden"></div>
    <div id="repoList"></div>
    <div id="repoCountBadge"></div>
    <div id="paginationControls" class="pagination-controls hidden"></div>
    <button id="prevPage"></button>
    <button id="nextPage"></button>
    <div id="pageInfo"></div>
    <input id="repoSearch" />
    <button id="repoSearchClear" class="search-clear-btn hidden"></button>
    <button id="hidePinnedToggleBtn2"></button>

    <button class="tab-button" data-tab="repositories">Repositories</button>
    <button class="tab-button" data-tab="filters">Filters</button>
    <button class="tab-button" data-tab="preferences">Preferences</button>
    <button class="tab-button" data-tab="advanced">Advanced</button>
    <button class="tab-button" data-tab="setup">Setup</button>
    <div class="tab-panel" data-tab="repositories"></div>
    <div class="tab-panel" data-tab="filters"></div>
    <div class="tab-panel" data-tab="preferences"></div>
    <div class="tab-panel" data-tab="advanced"></div>
    <div class="tab-panel" data-tab="setup"></div>
    <a class="setup-step clickable" data-tab="advanced"></a>
    <a class="setup-inline-link" data-tab="preferences" href="#preferences">Preferences</a>

    <input id="filterPrs" type="checkbox" checked />
    <input id="filterIssues" type="checkbox" checked />
    <input id="filterReleases" type="checkbox" checked />
    <label class="notification-toggle"><input id="notifyPrs" type="checkbox" /></label>
    <label class="notification-toggle"><input id="notifyIssues" type="checkbox" /></label>
    <label class="notification-toggle"><input id="notifyReleases" type="checkbox" /></label>

    <input id="theme-light" name="theme" type="radio" value="light" />
    <input id="theme-dark" name="theme" type="radio" value="dark" />
    <input id="theme-system" name="theme" type="radio" value="system" />
    <input id="color-polar" name="colorTheme" type="radio" value="polar" />
    <input id="color-graphite" name="colorTheme" type="radio" value="graphite" />
    <input id="color-nightfall" name="colorTheme" type="radio" value="nightfall" />
    <input id="interval-15" name="checkInterval" type="radio" value="15" />
    <input id="interval-30" name="checkInterval" type="radio" value="30" />
    <input id="snooze-1" name="snoozeHours" type="radio" value="1" />
    <input id="snooze-4" name="snoozeHours" type="radio" value="4" />
    <input id="itemExpiryEnabled" type="checkbox" />
    <input id="itemExpiryHours" value="24" />
    <div id="itemExpiryInputRow" class="expiry-settings d-none"></div>
    <input id="markReadOnSnooze" type="checkbox" />
    <input id="allowUnlimitedRepos" type="checkbox" />

    <div id="snoozedReposList"></div>
    <button id="importBtn"></button>
    <input id="importFileInput" type="file" />
    <button id="exportBtn"></button>
    <button id="closeImportModal"></button>
    <button id="cancelImportBtn"></button>
    <button id="confirmImportBtn"></button>
    <input id="selectAllImport" type="checkbox" />
    <input id="importRepoSearch" />
    <button id="importSearchClear" class="search-clear-btn hidden"></button>
    <div id="importModal"></div>

    <button id="clearCacheBtn"></button>
    <button id="clearAllDataBtn"></button>
    <button id="resetSettingsBtn"></button>

    <div id="versionInfo"></div>
    <div id="changelogContent"></div>
  `;
}

async function fireOptionsLoad() {
  document.dispatchEvent(new Event('DOMContentLoaded'));
  await Promise.resolve();
  await Promise.resolve();
}

beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
  localStorage.clear();
  history.replaceState(null, '', '/options/options.html');
  renderOptionsDom();

  const style = document.createElement('style');
  style.textContent = `
    .hidden { display: none !important; }
    .d-none { display: none !important; }
    .search-clear-btn { display: flex; }
    .pagination-controls { display: flex; }
    .expiry-settings { display: block; }
  `;
  document.head.appendChild(style);

  Object.assign(state, {
    watchedRepos: [],
    mutedRepos: [],
    pinnedRepos: [],
    currentPage: 1,
    reposPerPage: 10,
    searchQuery: '',
    hidePinnedRepos: false
  });

  mockGetSettings.mockResolvedValue({
    watchedRepos: [{ fullName: 'facebook/react', description: 'React', language: 'JS' }],
    mutedRepos: [],
    snoozedRepos: [],
    pinnedRepos: ['facebook/react'],
    filters: { prs: true, issues: true, releases: true },
    notifications: { prs: true, issues: true, releases: true },
    checkInterval: 15,
    snoozeHours: 1,
    theme: 'dark',
    colorTheme: 'graphite',
    itemExpiryHours: 24,
    markReadOnSnooze: false,
    allowUnlimitedRepos: false
  });
  mockGetWatchedRepos.mockResolvedValue([]);
  mockGetAuthSession.mockResolvedValue(null);
  mockGetAccessToken.mockResolvedValue('token');
  mockUpdateSettings.mockResolvedValue();
  mockSetLocalItem.mockResolvedValue();
  mockSetWatchedRepos.mockResolvedValue();
  mockResolveWatchedRepoInput.mockResolvedValue({
    valid: true,
    normalizedRepo: 'facebook/react',
    record: { fullName: 'facebook/react', description: 'React', language: 'JS' }
  });
  mockValidateWatchedRepo.mockResolvedValue({ valid: true });
  chrome.runtime.sendMessage.mockResolvedValue({});
  chrome.runtime.getURL = jest.fn((path) => path);
  chrome.storage.local.clear = jest.fn().mockResolvedValue();
  chrome.storage.sync.clear = jest.fn().mockResolvedValue();
  chrome.storage.sync.get = jest.fn().mockResolvedValue({ snoozedRepos: [] });
  chrome.storage.onChanged = {
    addListener: jest.fn(),
    removeListener: jest.fn()
  };
  fetch.mockImplementation(async (url) => {
    if (url === 'manifest.json') {
      return {
        ok: true,
        json: async () => ({ version: '1.2.3' })
      };
    }

    if (url === 'CHANGELOG.md') {
      return {
        ok: true,
        text: async () => '# Changelog\n\n- Added tests'
      };
    }

    if (url === 'https://api.github.com/repos/jonmartin721/devwatch-github/releases/latest') {
      return {
        ok: true,
        json: async () => ({
          tag_name: 'v1.2.3',
          name: 'v1.2.3',
          body: '## Highlights\n- Added tests',
          published_at: '2026-04-20T00:00:00Z',
          html_url: 'https://github.com/jonmartin721/devwatch-github/releases/tag/v1.2.3'
        })
      };
    }

    return {
      ok: true,
      json: async () => ({}),
      text: async () => ''
    };
  });
});

describe('options interactions', () => {
  test('focuses the repository input when showAdd is present on page load', async () => {
    const repoInput = document.getElementById('repoInput');
    repoInput.focus = jest.fn();
    history.replaceState(null, '', '/options/options.html?showAdd=true');

    await fireOptionsLoad();
    await jest.advanceTimersByTimeAsync(100);

    expect(toastInstance.init).toHaveBeenCalled();
    expect(mockSetupThemeListener).toHaveBeenCalled();
    expect(repoInput.focus).toHaveBeenCalled();
  });

  test('supports keyboard tab navigation and persists the selected tab', () => {
    const buttons = document.querySelectorAll('.tab-button');
    buttons[1].focus = jest.fn();

    setupTabNavigation();
    buttons[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));

    expect(buttons[1].classList.contains('active')).toBe(true);
    expect(buttons[1].focus).toHaveBeenCalled();
    expect(localStorage.getItem('activeTab')).toBe('filters');
    expect(document.querySelector('.tab-panel[data-tab="filters"]').hidden).toBe(false);
    expect(document.querySelector('.tab-panel[data-tab="repositories"]').hidden).toBe(true);
  });

  test('defaults to repositories when there is no saved tab or hash', () => {
    setupTabNavigation();

    expect(localStorage.getItem('activeTab')).toBe('repositories');
    expect(document.querySelector('.tab-button[data-tab="repositories"]').classList.contains('active')).toBe(true);
    expect(document.querySelector('.tab-panel[data-tab="repositories"]').hidden).toBe(false);
    expect(document.querySelector('.tab-panel[data-tab="setup"]').hidden).toBe(true);
  });

  test('setup inline links can switch directly to another tab', () => {
    const preferencesLink = document.querySelector('.setup-inline-link');

    setupTabNavigation();
    preferencesLink.click();

    expect(localStorage.getItem('activeTab')).toBe('preferences');
    expect(document.querySelector('.tab-button[data-tab="preferences"]').classList.contains('active')).toBe(true);
    expect(document.querySelector('.tab-panel[data-tab="preferences"]').hidden).toBe(false);
  });

  test('search, hide-pinned, and modal close interactions update local state and controller calls', () => {
    const repoSearch = document.getElementById('repoSearch');
    const repoSearchClear = document.getElementById('repoSearchClear');
    repoSearch.focus = jest.fn();

    setupEventListeners();

    repoSearch.value = 'React';
    repoSearch.dispatchEvent(new Event('input', { bubbles: true }));
    expect(state.searchQuery).toBe('react');
    expect(state.currentPage).toBe(1);
    expect(repoSearchClear.classList.contains('hidden')).toBe(false);

    repoSearchClear.click();
    expect(state.searchQuery).toBe('');
    expect(repoSearchClear.classList.contains('hidden')).toBe(true);
    expect(repoSearch.focus).toHaveBeenCalled();

    document.getElementById('hidePinnedToggleBtn2').click();
    expect(state.hidePinnedRepos).toBe(true);

    document.getElementById('importModal').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    expect(mockCloseImportModal).toHaveBeenCalled();
  });

  test('popular repositories open from the quick-action button instead of a standalone card', async () => {
    const popularBtn = document.getElementById('togglePopularReposBtn');
    const popularPanel = document.getElementById('popularReposPanel');

    setupEventListeners();

    popularBtn.click();
    await Promise.resolve();

    expect(popularPanel.classList.contains('show')).toBe(true);
    expect(popularBtn.classList.contains('active')).toBe(true);
    expect(popularBtn.getAttribute('aria-expanded')).toBe('true');
  });

  test('persists radio, checkbox, and category dependency changes through updateSettings', async () => {
    setupEventListeners();

    document.getElementById('theme-dark').checked = true;
    document.getElementById('theme-dark').dispatchEvent(new Event('change', { bubbles: true }));
    await Promise.resolve();

    document.getElementById('interval-30').checked = true;
    document.getElementById('interval-30').dispatchEvent(new Event('change', { bubbles: true }));
    await Promise.resolve();

    document.getElementById('itemExpiryEnabled').checked = true;
    document.getElementById('itemExpiryEnabled').dispatchEvent(new Event('change', { bubbles: true }));
    await Promise.resolve();

    document.getElementById('itemExpiryHours').value = '999';
    document.getElementById('itemExpiryHours').dispatchEvent(new Event('change', { bubbles: true }));
    await Promise.resolve();

    document.getElementById('notifyPrs').checked = true;
    document.getElementById('filterPrs').checked = false;
    document.getElementById('filterPrs').dispatchEvent(new Event('change', { bubbles: true }));
    await Promise.resolve();

    expect(mockUpdateSettings).toHaveBeenCalledWith({ theme: 'dark' });
    expect(mockApplyTheme).toHaveBeenCalledWith('dark');
    expect(mockUpdateSettings).toHaveBeenCalledWith({ checkInterval: 30 });
    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({ action: 'updateInterval', interval: 30 });
    expect(mockUpdateSettings).toHaveBeenCalledWith({ itemExpiryHours: 24 });
    expect(mockUpdateSettings).toHaveBeenCalledWith({ itemExpiryHours: 168 });
    expect(document.getElementById('itemExpiryHours').value).toBe('168');
    expect(document.getElementById('notifyPrs').checked).toBe(false);
    expect(document.getElementById('notifyPrs').disabled).toBe(true);
    expect(mockUpdateSettings).toHaveBeenCalledWith({
      filters: { prs: false, issues: true, releases: true },
      notifications: { prs: false, issues: false, releases: false }
    });
  });

  test('loadSettings applies normalized settings to the UI and renders snoozed repos', async () => {
    mockGetAuthSession.mockResolvedValue({ accessToken: 'stored-token' });

    await loadSettings();

    expect(mockApplyStoredConnection).toHaveBeenCalledWith({ accessToken: 'stored-token' });
    expect(mockApplyTheme).toHaveBeenCalledWith('dark');
    expect(mockApplyColorTheme).toHaveBeenCalledWith('graphite');
    expect(document.getElementById('theme-dark').checked).toBe(true);
    expect(document.getElementById('color-graphite').checked).toBe(true);
    expect(document.getElementById('itemExpiryEnabled').checked).toBe(true);
    expect(document.getElementById('itemExpiryInputRow').classList.contains('d-none')).toBe(false);
    expect(mockRenderSnoozedRepos).toHaveBeenCalledWith([]);
  });

  test('loadSettings renders a popular public repositories section', async () => {
    fetch.mockImplementation(async (url) => {
      if (String(url).includes('/search/repositories')) {
        return {
          ok: true,
          status: 200,
          statusText: 'OK',
          headers: new Map(),
          json: async () => ({
            items: [
              {
                owner: { login: 'facebook' },
                name: 'react',
                description: 'A JavaScript library for building user interfaces',
                language: 'JavaScript',
                stargazers_count: 200000
              }
            ]
          })
        };
      }

      return {
        ok: true,
        json: async () => ({}),
        text: async () => ''
      };
    });

    await loadSettings();

    expect(document.getElementById('popularReposList').innerHTML).toContain('microsoft/vscode');
    expect(document.getElementById('popularReposState').classList.contains('hidden')).toBe(true);
  });

  test('import search clear button actually hides when the query is cleared', () => {
    const importSearch = document.getElementById('importRepoSearch');
    const importSearchClear = document.getElementById('importSearchClear');

    setupEventListeners();

    importSearch.value = 'react';
    importSearch.dispatchEvent(new Event('input', { bubbles: true }));
    expect(importSearchClear.classList.contains('hidden')).toBe(false);

    importSearchClear.click();
    expect(importSearch.value).toBe('');
    expect(importSearchClear.classList.contains('hidden')).toBe(true);
  });

  test('disconnected users can still add public repositories manually', async () => {
    mockGetAccessToken.mockResolvedValueOnce(null);
    mockResolveWatchedRepoInput.mockResolvedValueOnce({
      valid: true,
      normalizedRepo: 'facebook/react',
      record: { fullName: 'facebook/react', description: 'React', language: 'JS' }
    });

    state.watchedRepos = [];
    document.getElementById('repoInput').value = 'facebook/react';

    await addRepo();

    expect(mockResolveWatchedRepoInput).toHaveBeenCalled();
    expect(mockResolveWatchedRepoInput.mock.calls[0][0]).toBe('facebook/react');
    expect(mockResolveWatchedRepoInput.mock.calls[0][1].githubToken).toBeNull();
    expect(state.watchedRepos).toEqual([
      { fullName: 'facebook/react', description: 'React', language: 'JS' }
    ]);
  });

  test('options hide utilities override later component display rules', () => {
    expect(optionsStyles).toMatch(/\.hidden\s*\{[\s\S]*display:\s*none\s*!important;/);
    expect(optionsStyles).toMatch(/\.d-none\s*\{[\s\S]*display:\s*none\s*!important;/);
  });

  test('setup inline links use the themed link treatment', () => {
    expect(optionsStyles).toMatch(/\.setup-inline-link\s*\{[\s\S]*font-weight:\s*600/);
    expect(optionsStyles).toMatch(/\.setup-inline-link:focus-visible\s*\{[\s\S]*outline:\s*2px solid var\(--link-color\)/);
  });

  test('setup connection status actions share the same pill language', () => {
    expect(optionsStyles).toMatch(/\.github-disconnect-btn\s*\{[\s\S]*border-radius:\s*999px/);
    expect(optionsStyles).toMatch(/\.github-connect-status-row\s*\{[\s\S]*justify-content:\s*space-between/);
    expect(optionsStyles).toMatch(/\.github-connect-inline-help\s*\{[\s\S]*flex-direction:\s*column/);
    expect(optionsStyles).toMatch(/\.github-connect-card\.is-connected [\s\S]*\.github-connect-flow[\s\S]*display:\s*none/);
  });

  test('popular repositories are tucked behind a toggleable utility panel', () => {
    expect(optionsStyles).toMatch(/\.popular-repos-panel\.show\s*\{[\s\S]*max-height:\s*520px/);
    expect(optionsStyles).toMatch(/\.import-btn\.active\s*\{[\s\S]*border-color:\s*var\(--border-hover\)/);
  });

  test('import selection and focus styles use themed treatment instead of default outlines', () => {
    expect(optionsStyles).toMatch(/\.repo-item\.import-variant\.selected\s*\{[\s\S]*rgba\(16,\s*185,\s*129,\s*0\.12\)/);
    expect(optionsStyles).toMatch(/\.repo-item\.import-variant:focus\s*\{[\s\S]*outline:\s*none/);
    expect(optionsStyles).toMatch(/\.repo-item\.import-variant:focus-visible\s*\{[\s\S]*box-shadow:/);
  });

  test('clears cache data and handles destructive actions', async () => {
    const setTimeoutSpy = jest.spyOn(global, 'setTimeout');

    await clearCacheData();
    expect(mockSetLocalItem).toHaveBeenCalledWith('activities', []);
    expect(mockSetLocalItem).toHaveBeenCalledWith('readItems', []);
    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({ action: 'clearBadge' });

    global.confirm = jest.fn(() => false);
    await clearAllData();
    expect(chrome.storage.local.clear).not.toHaveBeenCalled();

    global.confirm = jest.fn(() => true);
    await clearAllData();
    expect(chrome.storage.local.clear).toHaveBeenCalled();

    await resetSettings();
    expect(mockClearAuthSession).toHaveBeenCalled();
    expect(chrome.storage.sync.clear).toHaveBeenCalled();
    expect(chrome.storage.local.clear).toHaveBeenCalledTimes(2);
    expect(setTimeoutSpy).toHaveBeenCalledWith(expect.any(Function), 1000);

    setTimeoutSpy.mockRestore();
  });
});
