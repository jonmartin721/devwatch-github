import { jest, describe, test, beforeEach, expect } from '@jest/globals';

const mockGetSyncItems = jest.fn(async () => ({}));
const mockGetLocalItems = jest.fn(async () => ({}));
const mockGetSettings = jest.fn(async () => ({
  watchedRepos: [],
  mutedRepos: [],
  snoozedRepos: [],
  pinnedRepos: [],
  filters: { prs: true, issues: true, releases: true },
  notifications: { prs: true, issues: true, releases: true },
  checkInterval: 15,
  snoozeHours: 1,
  theme: 'system',
  colorTheme: 'polar',
  itemExpiryHours: null,
  markReadOnSnooze: false,
  allowUnlimitedRepos: false,
  lastCheck: 0
}));
const mockGetActivityData = jest.fn(async () => ({
  activities: [],
  readItems: [],
  collapsedRepos: []
}));
const mockGetWatchedRepos = jest.fn(async () => []);
const mockSetWatchedRepos = jest.fn(async () => {});
const mockGetExcludedRepos = jest.fn((mutedRepos = [], snoozedRepos = []) => {
  const now = Date.now();
  return new Set([
    ...mutedRepos,
    ...snoozedRepos.filter(repo => repo.expiresAt > now).map(repo => repo.repo)
  ]);
});

// Mock Chrome APIs before importing
global.chrome = {
  storage: {
    sync: {
      get: jest.fn((keys, callback) => callback({})),
      set: jest.fn((items, callback) => callback())
    },
    local: {
      get: jest.fn((keys, callback) => callback({})),
      set: jest.fn((items, callback) => callback())
    }
  },
  runtime: {
    lastError: null
  }
};

// Mock storage helpers
jest.unstable_mockModule('../shared/storage-helpers.js', () => ({
  getSyncItems: mockGetSyncItems,
  getLocalItems: mockGetLocalItems,
  getSettings: mockGetSettings,
  getActivityData: mockGetActivityData,
  getWatchedRepos: mockGetWatchedRepos,
  setWatchedRepos: mockSetWatchedRepos,
  getExcludedRepos: mockGetExcludedRepos,
  STORAGE_KEYS: {
    SETTINGS: ['watchedRepos', 'mutedRepos', 'snoozedRepos', 'pinnedRepos', 'filters', 'notifications', 'checkInterval', 'theme', 'itemExpiryHours'],
    ACTIVITY: ['activities', 'readItems', 'collapsedRepos']
  },
  STORAGE_DEFAULTS: {
    watchedRepos: [],
    mutedRepos: [],
    snoozedRepos: [],
    pinnedRepos: [],
    collapsedRepos: [],
    filters: { prs: true, issues: true, releases: true },
    notifications: { prs: true, issues: true, releases: true },
    checkInterval: 15,
    snoozeHours: 1,
    theme: 'system',
    colorTheme: 'polar',
    itemExpiryHours: null,
    markReadOnSnooze: false,
    allowUnlimitedRepos: false,
    activities: [],
    readItems: []
  }
}));

const { stateManager, getFilteredActivities, getStats, addActivities, markAsRead, addWatchedRepo, removeWatchedRepo } = await import('../shared/state-manager.js');

describe('state-manager', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    chrome.storage.sync.set.mockImplementation((items, callback) => callback());
    chrome.storage.local.set.mockImplementation((items, callback) => callback());
    chrome.runtime.lastError = null;
    mockGetSettings.mockResolvedValue({
      watchedRepos: [],
      mutedRepos: [],
      snoozedRepos: [],
      pinnedRepos: [],
      filters: { prs: true, issues: true, releases: true },
      notifications: { prs: true, issues: true, releases: true },
      checkInterval: 15,
      snoozeHours: 1,
      theme: 'system',
      colorTheme: 'polar',
      itemExpiryHours: null,
      markReadOnSnooze: false,
      allowUnlimitedRepos: false,
      lastCheck: 0
    });
    mockGetActivityData.mockResolvedValue({
      activities: [],
      readItems: [],
      collapsedRepos: []
    });

    // Reset state manager
    stateManager.initialized = false;
    stateManager.initializationLock = null;
    stateManager.state = {
      currentFilter: 'all',
      searchQuery: '',
      showArchive: false,
      allActivities: [],
      readItems: [],
      watchedRepos: [],
      mutedRepos: [],
      snoozedRepos: [],
      pinnedRepos: [],
      collapsedRepos: new Set(),
      filters: { prs: true, issues: true, releases: true },
      notifications: { prs: true, issues: true, releases: true },
      checkInterval: 15,
      snoozeHours: 1,
      theme: 'system',
      colorTheme: 'polar',
      itemExpiryHours: null,
      markReadOnSnooze: false,
      allowUnlimitedRepos: false,
      isLoading: false,
      error: null
    };
    stateManager.subscribers = new Map();
  });

  describe('getFilteredActivities', () => {
    beforeEach(async () => {
      stateManager.initialized = true;
      const now = Date.now();

      stateManager.state.allActivities = [
        { id: '1', type: 'pr', title: 'Add feature', repo: 'facebook/react', createdAt: new Date(now - 1000).toISOString() },
        { id: '2', type: 'issue', title: 'Bug report', repo: 'facebook/react', createdAt: new Date(now - 2000).toISOString() },
        { id: '3', type: 'release', title: 'v1.0.0', repo: 'vuejs/vue', createdAt: new Date(now - 3000).toISOString() },
        { id: '4', type: 'pr', title: 'Fix bug', repo: 'vuejs/vue', createdAt: new Date(now - 4000).toISOString() }
      ];
      stateManager.state.readItems = ['2'];
    });

    test('returns all unread activities by default', () => {
      const filtered = getFilteredActivities();

      expect(filtered).toHaveLength(3);
      expect(filtered.map(a => a.id)).toEqual(['1', '3', '4']);
    });

    test('filters by type', () => {
      stateManager.state.currentFilter = 'pr';
      const filtered = getFilteredActivities();

      expect(filtered).toHaveLength(2);
      expect(filtered.every(a => a.type === 'pr')).toBe(true);
    });

    test('filters by search query', () => {
      stateManager.state.searchQuery = 'bug';
      const filtered = getFilteredActivities();

      expect(filtered).toHaveLength(1);
      expect(filtered[0].id).toBe('4');
    });

    test('shows only read items in archive view', () => {
      stateManager.state.showArchive = true;
      const filtered = getFilteredActivities();

      expect(filtered).toHaveLength(1);
      expect(filtered[0].id).toBe('2');
    });

    test('filters by repository name', () => {
      stateManager.state.searchQuery = 'vue';
      const filtered = getFilteredActivities();

      expect(filtered).toHaveLength(2);
      expect(filtered.every(a => a.repo === 'vuejs/vue')).toBe(true);
    });

    test('applies time-based expiry filter', () => {
      const now = Date.now();
      stateManager.state.allActivities = [
        { id: '1', type: 'pr', title: 'Recent', repo: 'test/repo', createdAt: new Date(now - 1000).toISOString() },
        { id: '2', type: 'pr', title: 'Old', repo: 'test/repo', createdAt: new Date(now - 25 * 60 * 60 * 1000).toISOString() }
      ];
      stateManager.state.itemExpiryHours = 24;
      stateManager.state.readItems = [];

      const filtered = getFilteredActivities();

      expect(filtered).toHaveLength(1);
      expect(filtered[0].id).toBe('1');
    });

    test('filters excluded repositories from the feed', () => {
      stateManager.state.mutedRepos = ['facebook/react'];

      const filtered = getFilteredActivities();

      expect(filtered).toHaveLength(2);
      expect(filtered.every(activity => activity.repo === 'vuejs/vue')).toBe(true);
    });

    test('combines multiple filters', () => {
      stateManager.state.currentFilter = 'pr';
      stateManager.state.searchQuery = 'feature';
      const filtered = getFilteredActivities();

      expect(filtered).toHaveLength(1);
      expect(filtered[0].id).toBe('1');
    });
  });

  describe('getStats', () => {
    beforeEach(() => {
      stateManager.initialized = true;
      stateManager.state.allActivities = [
        { id: '1', createdAt: '2025-01-15T10:00:00Z' },
        { id: '2', createdAt: '2025-01-14T10:00:00Z' },
        { id: '3', createdAt: '2025-01-13T10:00:00Z' }
      ];
      stateManager.state.readItems = ['1', '2'];
      stateManager.state.watchedRepos = ['repo1/test', 'repo2/test'];
    });

    test('returns correct statistics', () => {
      const stats = getStats();

      expect(stats).toEqual({
        totalActivities: 3,
        readActivities: 2,
        unreadActivities: 1,
        watchedRepositories: 2,
        lastActivity: '2025-01-15T10:00:00Z'
      });
    });

    test('returns null for lastActivity when no activities', () => {
      stateManager.state.allActivities = [];
      const stats = getStats();

      expect(stats.lastActivity).toBeNull();
    });

    test('handles empty read items', () => {
      stateManager.state.readItems = [];
      const stats = getStats();

      expect(stats.readActivities).toBe(0);
      expect(stats.unreadActivities).toBe(3);
    });
  });

  describe('addActivities', () => {
    beforeEach(() => {
      stateManager.initialized = true;
    });

    test('adds new activities', async () => {
      const newActivities = [
        { id: '1', title: 'Test' },
        { id: '2', title: 'Test 2' }
      ];

      await addActivities(newActivities);

      expect(stateManager.state.allActivities).toHaveLength(2);
    });

    test('prepends new activities to existing ones', async () => {
      stateManager.state.allActivities = [{ id: '3', title: 'Existing' }];

      await addActivities([{ id: '1', title: 'New' }]);

      expect(stateManager.state.allActivities[0].id).toBe('1');
      expect(stateManager.state.allActivities[1].id).toBe('3');
    });

    test('limits activities to 2000', async () => {
      const existingActivities = Array.from({ length: 2000 }, (_, i) => ({ id: `old-${i}` }));
      stateManager.state.allActivities = existingActivities;

      await addActivities([{ id: 'new-1' }, { id: 'new-2' }]);

      expect(stateManager.state.allActivities).toHaveLength(2000);
      expect(stateManager.state.allActivities[0].id).toBe('new-1');
    });

    test('filters excluded repositories before storing activities', async () => {
      stateManager.state.mutedRepos = ['muted/repo'];

      await addActivities([
        { id: 'muted', repo: 'muted/repo' },
        { id: 'visible', repo: 'visible/repo' }
      ]);

      expect(stateManager.state.allActivities.map(activity => activity.id)).toEqual(['visible']);
    });
  });

  describe('markAsRead', () => {
    beforeEach(() => {
      stateManager.initialized = true;
      stateManager.state.readItems = ['1', '2'];
    });

    test('marks activities as read', async () => {
      await markAsRead(['3', '4']);

      expect(stateManager.state.readItems).toContain('3');
      expect(stateManager.state.readItems).toContain('4');
    });

    test('does not duplicate read items', async () => {
      await markAsRead(['1', '2', '3']);

      const uniqueItems = [...new Set(stateManager.state.readItems)];
      expect(stateManager.state.readItems.length).toBe(uniqueItems.length);
    });

    test('handles empty array', async () => {
      const before = [...stateManager.state.readItems];
      await markAsRead([]);

      expect(stateManager.state.readItems).toEqual(before);
    });
  });

  describe('addWatchedRepo', () => {
    beforeEach(() => {
      stateManager.initialized = true;
      stateManager.state.watchedRepos = ['facebook/react'];
    });

    test('adds new repository', async () => {
      await addWatchedRepo('vuejs/vue');

      expect(stateManager.state.watchedRepos).toContain('vuejs/vue');
      expect(stateManager.state.watchedRepos).toHaveLength(2);
    });

    test('does not add duplicate repository', async () => {
      await addWatchedRepo('facebook/react');

      expect(stateManager.state.watchedRepos).toHaveLength(1);
    });
  });

  describe('removeWatchedRepo', () => {
    beforeEach(() => {
      stateManager.initialized = true;
      stateManager.state.watchedRepos = ['facebook/react', 'vuejs/vue', 'nodejs/node'];
    });

    test('removes repository', async () => {
      await removeWatchedRepo('vuejs/vue');

      expect(stateManager.state.watchedRepos).not.toContain('vuejs/vue');
      expect(stateManager.state.watchedRepos).toHaveLength(2);
    });

    test('handles non-existent repository', async () => {
      await removeWatchedRepo('nonexistent/repo');

      expect(stateManager.state.watchedRepos).toHaveLength(3);
    });
  });

  describe('subscribe', () => {
    beforeEach(() => {
      stateManager.initialized = true;
    });

    test('calls callback on state change', async () => {
      const callback = jest.fn();
      stateManager.subscribe(callback);

      await stateManager.setState({ searchQuery: 'test' });

      expect(callback).toHaveBeenCalled();
    });

    test('only calls callback for watched keys', async () => {
      const callback = jest.fn();
      stateManager.subscribe(callback, ['searchQuery']);

      await stateManager.setState({ currentFilter: 'pr' });
      expect(callback).not.toHaveBeenCalled();

      await stateManager.setState({ searchQuery: 'test' });
      expect(callback).toHaveBeenCalled();
    });

    test('unsubscribe removes callback', async () => {
      const callback = jest.fn();
      const unsubscribe = stateManager.subscribe(callback);

      unsubscribe();
      await stateManager.setState({ searchQuery: 'test' });

      expect(callback).not.toHaveBeenCalled();
    });

    test('handles callback errors gracefully', async () => {
      allowUnexpectedConsole('error');
      const errorCallback = jest.fn(() => {
        throw new Error('Test error');
      });
      const goodCallback = jest.fn();

      stateManager.subscribe(errorCallback);
      stateManager.subscribe(goodCallback);

      await stateManager.setState({ searchQuery: 'test' });

      expect(goodCallback).toHaveBeenCalled();
    });
  });

  describe('initialize', () => {
    test('coalesces concurrent initialize calls behind a single lock', async () => {
      let resolveSettings;
      const settingsPromise = new Promise((resolve) => {
        resolveSettings = resolve;
      });
      mockGetSettings.mockReturnValue(settingsPromise);

      const firstInitialize = stateManager.initialize();
      const secondInitialize = stateManager.initialize();

      expect(mockGetSettings).toHaveBeenCalledTimes(1);
      expect(stateManager.initializationLock).toBeTruthy();

      resolveSettings({
        watchedRepos: ['facebook/react'],
        mutedRepos: [],
        snoozedRepos: [],
        pinnedRepos: [],
        filters: { prs: true, issues: true, releases: true },
        notifications: { prs: true, issues: true, releases: true },
        checkInterval: 15,
        snoozeHours: 1,
        theme: 'dark',
        colorTheme: 'graphite',
        itemExpiryHours: null,
        markReadOnSnooze: false,
        allowUnlimitedRepos: false,
        lastCheck: 0
      });

      await Promise.all([firstInitialize, secondInitialize]);

      expect(mockGetSettings).toHaveBeenCalledTimes(1);
      expect(mockGetActivityData).toHaveBeenCalledTimes(1);
      expect(stateManager.getState('watchedRepos')).toEqual(['facebook/react']);
      expect(stateManager.initializationLock).toBeNull();
    });

    test('returns immediately when already initialized', async () => {
      stateManager.initialized = true;

      await stateManager.initialize();

      expect(mockGetSettings).not.toHaveBeenCalled();
      expect(mockGetActivityData).not.toHaveBeenCalled();
    });
  });

  describe('setState and reset', () => {
    beforeEach(() => {
      stateManager.initialized = true;
    });

    test('supports functional updater callbacks', async () => {
      await stateManager.setState((currentState) => ({
        ...currentState,
        searchQuery: `${currentState.searchQuery}react`
      }), { persist: false });

      expect(stateManager.getState('searchQuery')).toBe('react');
    });

    test('skips persistence when persist is false', async () => {
      await stateManager.setState({ searchQuery: 'offline' }, { persist: false });

      expect(chrome.storage.sync.set).not.toHaveBeenCalled();
      expect(chrome.storage.local.set).not.toHaveBeenCalled();
      expect(mockSetWatchedRepos).not.toHaveBeenCalled();
    });

    test('skips subscriber notifications when notify is false', async () => {
      const callback = jest.fn();
      stateManager.subscribe(callback);

      await stateManager.setState({ searchQuery: 'silent' }, { persist: false, notify: false });

      expect(callback).not.toHaveBeenCalled();
    });

    test('resets only the requested keys', async () => {
      stateManager.state.theme = 'dark';
      stateManager.state.collapsedRepos = new Set(['facebook/react']);
      stateManager.state.searchQuery = 'keep-me';

      await stateManager.reset(['theme', 'collapsedRepos']);

      expect(stateManager.getState('theme')).toBe('system');
      expect(stateManager.getState('collapsedRepos')).toEqual(new Set());
      expect(stateManager.getState('searchQuery')).toBe('keep-me');
    });

    test('rejects when persistence hits a storage error', async () => {
      chrome.runtime.lastError = { message: 'sync failed' };

      await expect(stateManager.setState({ theme: 'dark' })).rejects.toThrow('sync failed');
    });
  });
});
