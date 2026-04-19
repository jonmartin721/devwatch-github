import { beforeEach, describe, expect, jest, test } from '@jest/globals';

const mockApplyTheme = jest.fn();
const mockApplyColorTheme = jest.fn();
const mockGetSyncItem = jest.fn();
const mockGetWatchedRepos = jest.fn();
const mockShowError = jest.fn();
const mockIsOffline = jest.fn();
const mockShowOfflineStatus = jest.fn();
const mockSetupOfflineListeners = jest.fn();
const mockStateManagerInitialize = jest.fn();
const mockSetState = jest.fn();
const mockUseState = jest.fn();
const mockSubscribe = jest.fn();
const mockRendererCtor = jest.fn();
const mockOnboardingIsInOnboarding = jest.fn();
const mockOnboardingComplete = jest.fn();
const mockLoadActivitiesController = jest.fn();
const mockHandleRefreshController = jest.fn();
const mockClearArchiveController = jest.fn();
const mockToggleRepoCollapseController = jest.fn();
const mockTogglePinRepoController = jest.fn();
const mockSnoozeRepoController = jest.fn();
const mockSnoozeRepoWithAnimationController = jest.fn();
const mockMarkAsRead = jest.fn();
const mockMarkAsReadWithAnimation = jest.fn();
const mockMarkRepoAsRead = jest.fn();
const mockHandleMarkAllReadController = jest.fn();
const mockHandleCollapseAllController = jest.fn();
const mockSetupKeyboardNavigationController = jest.fn();
const mockUpdateFilterButtonAria = jest.fn();
const mockRenderActivitiesView = jest.fn();
const mockShowOnboarding = jest.fn();
const mockExitOnboarding = jest.fn();
const mockToggleDarkMode = jest.fn();
const mockUpdateDarkModeIcon = jest.fn();

let subscribedCallback = null;

const popupState = {
  allActivities: [],
  currentFilter: 'all',
  searchQuery: '',
  showArchive: false,
  readItems: [],
  collapsedRepos: new Set(),
  pinnedRepos: []
};

jest.unstable_mockModule('../shared/utils.js', () => ({
  applyTheme: mockApplyTheme,
  applyColorTheme: mockApplyColorTheme
}));

jest.unstable_mockModule('../shared/storage-helpers.js', () => ({
  getSyncItem: mockGetSyncItem,
  getWatchedRepos: mockGetWatchedRepos
}));

jest.unstable_mockModule('../shared/error-handler.js', () => ({
  showError: mockShowError
}));

jest.unstable_mockModule('../shared/offline-manager.js', () => ({
  isOffline: mockIsOffline,
  showOfflineStatus: mockShowOfflineStatus,
  setupOfflineListeners: mockSetupOfflineListeners
}));

jest.unstable_mockModule('../shared/state-manager.js', () => ({
  stateManager: {
    initialize: mockStateManagerInitialize,
    getFilteredActivities: jest.fn(() => [])
  },
  useState: mockUseState,
  setState: mockSetState,
  subscribe: mockSubscribe
}));

jest.unstable_mockModule('../shared/dom-optimizer.js', () => ({
  ActivityListRenderer: class {
    constructor(element) {
      this.element = element;
      mockRendererCtor(element);
    }
  }
}));

jest.unstable_mockModule('../shared/onboarding.js', () => ({
  OnboardingManager: class {
    async isInOnboarding() {
      return mockOnboardingIsInOnboarding();
    }

    async completeOnboarding() {
      return mockOnboardingComplete();
    }
  }
}));

jest.unstable_mockModule('../popup/controllers/activity-controller.js', () => ({
  loadActivities: mockLoadActivitiesController,
  handleRefresh: mockHandleRefreshController
}));

jest.unstable_mockModule('../popup/controllers/repository-controller.js', () => ({
  clearArchive: mockClearArchiveController,
  toggleRepoCollapse: mockToggleRepoCollapseController,
  togglePinRepo: mockTogglePinRepoController,
  snoozeRepo: mockSnoozeRepoController,
  snoozeRepoWithAnimation: mockSnoozeRepoWithAnimationController,
  markAsRead: mockMarkAsRead,
  markAsReadWithAnimation: mockMarkAsReadWithAnimation,
  markRepoAsRead: mockMarkRepoAsRead,
  handleMarkAllRead: mockHandleMarkAllReadController,
  handleCollapseAll: mockHandleCollapseAllController
}));

jest.unstable_mockModule('../popup/controllers/keyboard-controller.js', () => ({
  setupKeyboardNavigation: mockSetupKeyboardNavigationController,
  updateFilterButtonAria: mockUpdateFilterButtonAria
}));

jest.unstable_mockModule('../popup/views/activity-list-view.js', () => ({
  renderActivities: mockRenderActivitiesView
}));

jest.unstable_mockModule('../popup/views/onboarding-view.js', () => ({
  showOnboarding: mockShowOnboarding,
  exitOnboarding: mockExitOnboarding
}));

jest.unstable_mockModule('../popup/controllers/theme-controller.js', () => ({
  toggleDarkMode: mockToggleDarkMode,
  updateDarkModeIcon: mockUpdateDarkModeIcon
}));

function renderPopupDom() {
  document.body.innerHTML = `
    <header class="hidden"></header>
    <div class="toolbar hidden"></div>
    <div id="activityList" class="hidden"></div>
    <div id="errorMessage"></div>
    <div id="searchBox" class="hidden"></div>
    <button id="refreshBtn"></button>
    <button id="darkModeBtn"></button>
    <button id="settingsLink"></button>
    <button id="helpBtn"></button>
    <button id="footerSkipBtn"></button>
    <button id="searchBtn"></button>
    <button id="archiveBtn"></button>
    <input id="searchInput" />
    <div id="repoCount"></div>
    <button class="filter-btn active" data-type="all">All</button>
    <button class="filter-btn" data-type="pr">PRs</button>
  `;
}

async function firePopupLoad() {
  const { initializePopup } = await import('../popup/popup.js');
  await initializePopup();
  await Promise.resolve();
  await Promise.resolve();
}

beforeEach(async () => {
  jest.useFakeTimers();
  jest.clearAllMocks();
  jest.resetModules();
  subscribedCallback = null;
  Object.assign(popupState, {
    allActivities: [],
    currentFilter: 'all',
    searchQuery: '',
    showArchive: false,
    readItems: [],
    collapsedRepos: new Set(),
    pinnedRepos: []
  });

  renderPopupDom();

  mockGetSyncItem.mockImplementation(async (key, defaultValue) => {
    if (key === 'theme') {
      return 'dark';
    }

    if (key === 'colorTheme') {
      return 'graphite';
    }

    return defaultValue;
  });
  mockGetWatchedRepos.mockResolvedValue([{ fullName: 'facebook/react' }, { fullName: 'vuejs/core' }]);
  mockIsOffline.mockReturnValue(false);
  mockStateManagerInitialize.mockResolvedValue();
  mockUseState.mockImplementation(() => popupState);
  mockSubscribe.mockImplementation((callback) => {
    subscribedCallback = callback;
    return jest.fn();
  });
  mockOnboardingIsInOnboarding.mockResolvedValue(false);
  mockOnboardingComplete.mockResolvedValue();
  mockLoadActivitiesController.mockResolvedValue();
  mockHandleRefreshController.mockResolvedValue();
  mockClearArchiveController.mockResolvedValue();
  mockToggleRepoCollapseController.mockResolvedValue();
  mockTogglePinRepoController.mockResolvedValue();
  mockSnoozeRepoController.mockResolvedValue();
  mockSnoozeRepoWithAnimationController.mockResolvedValue();
  mockMarkAsRead.mockResolvedValue();
  mockMarkAsReadWithAnimation.mockResolvedValue();
  mockMarkRepoAsRead.mockResolvedValue();
  mockHandleMarkAllReadController.mockResolvedValue();
  mockHandleCollapseAllController.mockResolvedValue();

  chrome.runtime.openOptionsPage = jest.fn();
  chrome.tabs.create = jest.fn();
  chrome.storage.sync.set = jest.fn((items, callback) => {
    callback?.();
    return Promise.resolve();
  });
});

describe('popup bootstrap integration', () => {
  test('initializes the main popup flow on DOMContentLoaded', async () => {
    await firePopupLoad();
    await jest.advanceTimersByTimeAsync(50);

    expect(mockStateManagerInitialize).toHaveBeenCalled();
    expect(mockRendererCtor).toHaveBeenCalledWith(document.getElementById('activityList'));
    expect(mockSubscribe).toHaveBeenCalled();
    expect(mockLoadActivitiesController).toHaveBeenCalledWith(expect.any(Function), {});
    expect(mockSetupKeyboardNavigationController).toHaveBeenCalled();
    expect(mockSetupOfflineListeners).toHaveBeenCalled();
    expect(document.querySelector('header').classList.contains('hidden')).toBe(false);
    expect(document.querySelector('.toolbar').classList.contains('hidden')).toBe(false);
    expect(document.getElementById('activityList').classList.contains('hidden')).toBe(false);
    expect(document.getElementById('footerSkipBtn').classList.contains('hidden')).toBe(true);
    expect(document.getElementById('repoCount').textContent).toBe('Watching 2 repos');
    expect(mockApplyTheme).toHaveBeenCalledWith('dark');
    expect(mockApplyColorTheme).toHaveBeenCalledWith('graphite');
    expect(mockUpdateDarkModeIcon).toHaveBeenCalled();
  });

  test('shows onboarding instead of loading activities when setup is incomplete', async () => {
    mockOnboardingIsInOnboarding.mockResolvedValue(true);

    await firePopupLoad();

    expect(mockShowOnboarding).toHaveBeenCalledWith(expect.any(Function));
    expect(mockLoadActivitiesController).not.toHaveBeenCalled();
  });

  test('wires toolbar and filter interactions after initialization', async () => {
    await firePopupLoad();

    document.getElementById('settingsLink').click();
    document.getElementById('helpBtn').click();
    document.getElementById('darkModeBtn').click();

    const searchInput = document.getElementById('searchInput');
    searchInput.value = 'MiXeD';
    searchInput.dispatchEvent(new Event('input', { bubbles: true }));

    document.querySelector('[data-type="pr"]').click();

    expect(chrome.runtime.openOptionsPage).toHaveBeenCalled();
    expect(chrome.tabs.create).toHaveBeenCalledWith({
      url: 'https://github.com/jonmartin721/devwatch-github#readme'
    });
    expect(mockToggleDarkMode).toHaveBeenCalled();
    expect(mockSetState).toHaveBeenCalledWith({ searchQuery: 'mixed' });
    expect(mockSetState).toHaveBeenCalledWith({ currentFilter: 'pr' });
    expect(document.querySelector('[data-type="pr"]').classList.contains('active')).toBe(true);
  });

  test('re-renders only for relevant subscribed state changes', async () => {
    await firePopupLoad();
    mockRenderActivitiesView.mockClear();

    const previousState = {
      ...popupState,
      collapsedRepos: new Set(),
      pinnedRepos: []
    };

    subscribedCallback(
      {
        ...previousState,
        searchQuery: 'react'
      },
      previousState
    );

    expect(mockRenderActivitiesView).toHaveBeenCalledTimes(1);

    mockRenderActivitiesView.mockClear();
    subscribedCallback(
      {
        ...previousState,
        someOtherKey: 'ignored'
      },
      previousState
    );

    expect(mockRenderActivitiesView).not.toHaveBeenCalled();
  });

  test('handles offline callbacks and refresh override', async () => {
    await firePopupLoad();

    const [onlineCallback, offlineCallback] = mockSetupOfflineListeners.mock.calls[0];
    offlineCallback();
    expect(mockShowOfflineStatus).toHaveBeenCalledWith('errorMessage', true);

    onlineCallback();
    expect(mockShowOfflineStatus).toHaveBeenCalledWith('errorMessage', false);
    await jest.advanceTimersByTimeAsync(1000);
    expect(mockLoadActivitiesController).toHaveBeenCalledTimes(2);

    mockIsOffline.mockReturnValue(true);
    await window.handleRefresh();
    expect(mockShowError).toHaveBeenCalledWith(
      'errorMessage',
      expect.any(Error),
      null,
      { action: 'refresh activities' },
      3000
    );

    mockIsOffline.mockReturnValue(false);
    await window.handleRefresh();
    expect(mockHandleRefreshController).toHaveBeenCalled();
  });

  test('footer skip button completes onboarding and exits back to the feed', async () => {
    await firePopupLoad();

    document.getElementById('footerSkipBtn').click();
    await Promise.resolve();
    await Promise.resolve();

    expect(mockOnboardingComplete).toHaveBeenCalled();
  });
});
