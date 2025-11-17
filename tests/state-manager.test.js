import { jest, describe, test, expect, beforeEach } from '@jest/globals';

// Mock Chrome storage
let mockSyncStorage = {};
let mockLocalStorage = {};

global.chrome = {
  storage: {
    sync: {
      get: jest.fn((keys, callback) => {
        const result = {};
        const keyArray = Array.isArray(keys) ? keys : [keys];
        keyArray.forEach(key => {
          if (Object.prototype.hasOwnProperty.call(mockSyncStorage, key)) {
            result[key] = mockSyncStorage[key];
          }
        });
        callback(result);
      }),
      set: jest.fn((items, callback) => {
        Object.assign(mockSyncStorage, items);
        if (callback) callback();
      })
    },
    local: {
      get: jest.fn((keys, callback) => {
        const result = {};
        const keyArray = Array.isArray(keys) ? keys : [keys];
        keyArray.forEach(key => {
          if (Object.prototype.hasOwnProperty.call(mockLocalStorage, key)) {
            result[key] = mockLocalStorage[key];
          }
        });
        callback(result);
      }),
      set: jest.fn((items, callback) => {
        Object.assign(mockLocalStorage, items);
        if (callback) callback();
      })
    }
  }
};

// Import after mocking chrome
import { stateManager } from '../shared/state-manager.js';
import { STORAGE_DEFAULTS } from '../shared/storage-helpers.js';

describe('StateManager', () => {
  beforeEach(() => {
    // Reset storage
    mockSyncStorage = {};
    mockLocalStorage = {};

    // Reset Chrome API mocks with fresh implementations
    global.chrome = {
      storage: {
        sync: {
          get: jest.fn((keys, callback) => {
            const result = {};
            const keyArray = Array.isArray(keys) ? keys : [keys];
            keyArray.forEach(key => {
              if (Object.prototype.hasOwnProperty.call(mockSyncStorage, key)) {
                result[key] = mockSyncStorage[key];
              }
            });
            callback(result);
          }),
          set: jest.fn((items, callback) => {
            Object.assign(mockSyncStorage, items);
            if (callback) callback();
          })
        },
        local: {
          get: jest.fn((keys, callback) => {
            const result = {};
            const keyArray = Array.isArray(keys) ? keys : [keys];
            keyArray.forEach(key => {
              if (Object.prototype.hasOwnProperty.call(mockLocalStorage, key)) {
                result[key] = mockLocalStorage[key];
              }
            });
            callback(result);
          }),
          set: jest.fn((items, callback) => {
            Object.assign(mockLocalStorage, items);
            if (callback) callback();
          })
        }
      }
    };

    // Reset state manager to uninitialized state
    stateManager.initialized = false;
    stateManager.state = {
      currentFilter: 'all',
      searchQuery: '',
      showArchive: false,
      allActivities: [],
      readItems: [],
      watchedRepos: [],
      mutedRepos: [],
      snoozedRepos: [],
      filters: { ...STORAGE_DEFAULTS.filters },
      notifications: { ...STORAGE_DEFAULTS.notifications },
      checkInterval: STORAGE_DEFAULTS.checkInterval,
      theme: STORAGE_DEFAULTS.theme,
      isLoading: false,
      error: null
    };
    stateManager.subscribers.clear();
  });

  describe('constructor', () => {
    test('initializes with default state', () => {
      expect(stateManager.state).toBeDefined();
      expect(stateManager.state.currentFilter).toBe('all');
      expect(stateManager.state.searchQuery).toBe('');
      expect(stateManager.state.allActivities).toEqual([]);
      expect(stateManager.state.watchedRepos).toEqual([]);
      expect(stateManager.initialized).toBe(false);
    });

    test('initializes with empty subscribers map', () => {
      expect(stateManager.subscribers).toBeInstanceOf(Map);
      expect(stateManager.subscribers.size).toBe(0);
    });
  });

  describe('initialize', () => {
    test('loads state from storage', async () => {
      mockSyncStorage = {
        watchedRepos: ['facebook/react', 'nodejs/node'],
        filters: { prs: true, issues: true, releases: false },
        theme: 'dark',
        checkInterval: 30
      };

      mockLocalStorage = {
        activities: [
          { id: '1', type: 'pr', title: 'Test PR', repo: 'facebook/react' }
        ],
        readItems: ['1']
      };

      await stateManager.initialize();

      expect(stateManager.initialized).toBe(true);
      expect(stateManager.state.watchedRepos).toEqual(['facebook/react', 'nodejs/node']);
      expect(stateManager.state.theme).toBe('dark');
      expect(stateManager.state.allActivities).toHaveLength(1);
      expect(stateManager.state.readItems).toEqual(['1']);
    });

    test('uses defaults when storage is empty', async () => {
      await stateManager.initialize();

      expect(stateManager.initialized).toBe(true);
      expect(stateManager.state.watchedRepos).toEqual(STORAGE_DEFAULTS.watchedRepos);
      expect(stateManager.state.filters).toEqual(STORAGE_DEFAULTS.filters);
    });

    test('only initializes once', async () => {
      await stateManager.initialize();
      const firstInitState = { ...stateManager.state };

      await stateManager.initialize();
      const secondInitState = { ...stateManager.state };

      expect(firstInitState).toEqual(secondInitState);
      expect(chrome.storage.sync.get).toHaveBeenCalledTimes(1);
    });

    test('throws error when storage fails', async () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

      chrome.storage.sync.get = jest.fn((keys, callback) => {
        throw new Error('Storage error');
      });

      await expect(stateManager.initialize()).rejects.toThrow('Storage error');

      consoleSpy.mockRestore();
    });
  });

  describe('getState', () => {
    beforeEach(async () => {
      await stateManager.initialize();
    });

    test('returns entire state when no key provided', () => {
      const state = stateManager.getState();

      expect(state).toHaveProperty('currentFilter');
      expect(state).toHaveProperty('allActivities');
      expect(state).toHaveProperty('watchedRepos');
    });

    test('returns specific property when key provided', () => {
      stateManager.state.watchedRepos = ['facebook/react'];

      const repos = stateManager.getState('watchedRepos');

      expect(repos).toEqual(['facebook/react']);
    });

    test('returns undefined for non-existent key', () => {
      const result = stateManager.getState('nonExistentKey');

      expect(result).toBeUndefined();
    });

    test('returns empty object when not initialized', () => {
      stateManager.initialized = false;
      const state = stateManager.getState();

      expect(state).toEqual({});
    });

    test('returns undefined for key when not initialized', () => {
      stateManager.initialized = false;
      const result = stateManager.getState('watchedRepos');

      expect(result).toBeUndefined();
    });
  });

  describe('setState', () => {
    beforeEach(async () => {
      await stateManager.initialize();
    });

    test('updates state with object', async () => {
      await stateManager.setState({ currentFilter: 'pr' });

      expect(stateManager.state.currentFilter).toBe('pr');
    });

    test('updates state with function', async () => {
      await stateManager.setState((state) => ({
        ...state,
        currentFilter: 'issue'
      }));

      expect(stateManager.state.currentFilter).toBe('issue');
    });

    test('persists to storage by default', async () => {
      await stateManager.setState({ watchedRepos: ['facebook/react'] });

      expect(chrome.storage.sync.set).toHaveBeenCalled();
    });

    test('skips persistence when persist: false', async () => {
      chrome.storage.sync.set.mockClear();

      await stateManager.setState(
        { currentFilter: 'pr' },
        { persist: false }
      );

      expect(chrome.storage.sync.set).not.toHaveBeenCalled();
    });

    test('notifies subscribers by default', async () => {
      const callback = jest.fn();
      stateManager.subscribe(callback);

      await stateManager.setState({ currentFilter: 'pr' });

      expect(callback).toHaveBeenCalled();
    });

    test('skips notification when notify: false', async () => {
      const callback = jest.fn();
      stateManager.subscribe(callback);

      await stateManager.setState(
        { currentFilter: 'pr' },
        { notify: false }
      );

      expect(callback).not.toHaveBeenCalled();
    });

    test('does nothing when not initialized', async () => {
      stateManager.initialized = false;
      stateManager.state.currentFilter = 'all';

      await stateManager.setState({ currentFilter: 'pr' });

      expect(stateManager.state.currentFilter).toBe('all');
    });
  });

  describe('subscribe', () => {
    beforeEach(async () => {
      await stateManager.initialize();
    });

    test('adds subscriber and returns unsubscribe function', () => {
      const callback = jest.fn();

      const unsubscribe = stateManager.subscribe(callback);

      expect(stateManager.subscribers.size).toBe(1);
      expect(typeof unsubscribe).toBe('function');
    });

    test('unsubscribe removes subscriber', () => {
      const callback = jest.fn();
      const unsubscribe = stateManager.subscribe(callback);

      expect(stateManager.subscribers.size).toBe(1);

      unsubscribe();

      expect(stateManager.subscribers.size).toBe(0);
    });

    test('allows multiple subscribers', () => {
      const callback1 = jest.fn();
      const callback2 = jest.fn();

      stateManager.subscribe(callback1);
      stateManager.subscribe(callback2);

      expect(stateManager.subscribers.size).toBe(2);
    });

    test('subscriber can watch specific keys', async () => {
      const callback = jest.fn();
      stateManager.subscribe(callback, ['currentFilter']);

      await stateManager.setState({ currentFilter: 'pr' });

      expect(callback).toHaveBeenCalled();
    });
  });

  describe('notifySubscribers', () => {
    beforeEach(async () => {
      await stateManager.initialize();
    });

    test('notifies all subscribers of changes', () => {
      const callback1 = jest.fn();
      const callback2 = jest.fn();

      stateManager.subscribe(callback1);
      stateManager.subscribe(callback2);

      const prevState = { ...stateManager.state };
      const newState = { ...stateManager.state, currentFilter: 'pr' };

      stateManager.notifySubscribers(prevState, newState);

      expect(callback1).toHaveBeenCalledWith(newState, prevState);
      expect(callback2).toHaveBeenCalledWith(newState, prevState);
    });

    test('only notifies when watched keys change', () => {
      const callback = jest.fn();
      stateManager.subscribe(callback, ['currentFilter']);

      const prevState = { ...stateManager.state };
      const newState = { ...stateManager.state, searchQuery: 'test' };

      stateManager.notifySubscribers(prevState, newState);

      expect(callback).not.toHaveBeenCalled();
    });

    test('handles errors in subscriber callbacks gracefully', () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
      const errorCallback = jest.fn(() => {
        throw new Error('Subscriber error');
      });

      stateManager.subscribe(errorCallback);

      const prevState = { ...stateManager.state };
      const newState = { ...stateManager.state, currentFilter: 'pr' };

      expect(() => {
        stateManager.notifySubscribers(prevState, newState);
      }).not.toThrow();

      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });
  });

  describe('persistState', () => {
    beforeEach(async () => {
      await stateManager.initialize();
    });

    test('persists sync storage keys', async () => {
      await stateManager.persistState({
        watchedRepos: ['facebook/react'],
        theme: 'dark'
      });

      expect(chrome.storage.sync.set).toHaveBeenCalledWith(
        { watchedRepos: ['facebook/react'] },
        expect.any(Function)
      );
      expect(chrome.storage.sync.set).toHaveBeenCalledWith(
        { theme: 'dark' },
        expect.any(Function)
      );
    });

    test('persists local storage keys', async () => {
      await stateManager.persistState({
        allActivities: [{ id: '1', title: 'Test' }],
        readItems: ['1']
      });

      expect(chrome.storage.local.set).toHaveBeenCalledWith(
        { activities: [{ id: '1', title: 'Test' }] },
        expect.any(Function)
      );
      expect(chrome.storage.local.set).toHaveBeenCalledWith(
        { readItems: ['1'] },
        expect.any(Function)
      );
    });

    test('handles function updates', async () => {
      const updateFn = (state) => ({ watchedRepos: ['facebook/react'] });

      await stateManager.persistState(updateFn);

      expect(chrome.storage.sync.set).toHaveBeenCalled();
    });

    test('skips persistence when no relevant keys', async () => {
      chrome.storage.sync.set.mockClear();
      chrome.storage.local.set.mockClear();

      await stateManager.persistState({ currentFilter: 'pr' });

      expect(chrome.storage.sync.set).not.toHaveBeenCalled();
      expect(chrome.storage.local.set).not.toHaveBeenCalled();
    });
  });

  describe('reset', () => {
    beforeEach(async () => {
      await stateManager.initialize();
      stateManager.state.watchedRepos = ['facebook/react'];
      stateManager.state.currentFilter = 'pr';
    });

    test('resets all state to defaults', async () => {
      await stateManager.reset();

      expect(stateManager.state.watchedRepos).toEqual(STORAGE_DEFAULTS.watchedRepos);
      expect(stateManager.state.filters).toEqual(STORAGE_DEFAULTS.filters);
    });

    test('resets specific keys only', async () => {
      const originalFilter = stateManager.state.currentFilter;

      await stateManager.reset(['watchedRepos']);

      expect(stateManager.state.watchedRepos).toEqual(STORAGE_DEFAULTS.watchedRepos);
      expect(stateManager.state.currentFilter).toBe(originalFilter);
    });
  });

  describe('addActivities', () => {
    beforeEach(async () => {
      await stateManager.initialize();
    });

    test('adds new activities to the beginning', async () => {
      const existingActivity = { id: '1', title: 'Old' };
      stateManager.state.allActivities = [existingActivity];

      const newActivities = [
        { id: '2', title: 'New 1' },
        { id: '3', title: 'New 2' }
      ];

      await stateManager.addActivities(newActivities);

      expect(stateManager.state.allActivities[0].id).toBe('2');
      expect(stateManager.state.allActivities[1].id).toBe('3');
      expect(stateManager.state.allActivities[2].id).toBe('1');
    });

    test('limits activities to maximum of 100', async () => {
      const manyActivities = Array.from({ length: 110 }, (_, i) => ({
        id: `${i}`,
        title: `Activity ${i}`
      }));

      await stateManager.addActivities(manyActivities);

      expect(stateManager.state.allActivities).toHaveLength(100);
    });
  });

  describe('markAsRead', () => {
    beforeEach(async () => {
      await stateManager.initialize();
    });

    test('marks activities as read', async () => {
      await stateManager.markAsRead(['1', '2', '3']);

      expect(stateManager.state.readItems).toEqual(expect.arrayContaining(['1', '2', '3']));
    });

    test('avoids duplicates in read items', async () => {
      stateManager.state.readItems = ['1'];

      await stateManager.markAsRead(['1', '2']);

      expect(stateManager.state.readItems).toHaveLength(2);
      expect(stateManager.state.readItems).toEqual(expect.arrayContaining(['1', '2']));
    });
  });

  describe('addWatchedRepo', () => {
    beforeEach(async () => {
      await stateManager.initialize();
    });

    test('adds new repository', async () => {
      await stateManager.addWatchedRepo('facebook/react');

      expect(stateManager.state.watchedRepos).toContain('facebook/react');
    });

    test('avoids duplicates', async () => {
      await stateManager.addWatchedRepo('facebook/react');
      await stateManager.addWatchedRepo('facebook/react');

      const reactRepos = stateManager.state.watchedRepos.filter(r => r === 'facebook/react');
      expect(reactRepos).toHaveLength(1);
    });
  });

  describe('removeWatchedRepo', () => {
    beforeEach(async () => {
      await stateManager.initialize();
      stateManager.state.watchedRepos = ['facebook/react', 'nodejs/node'];
    });

    test('removes repository', async () => {
      await stateManager.removeWatchedRepo('facebook/react');

      expect(stateManager.state.watchedRepos).not.toContain('facebook/react');
      expect(stateManager.state.watchedRepos).toContain('nodejs/node');
    });

    test('handles removing non-existent repo', async () => {
      await stateManager.removeWatchedRepo('nonexistent/repo');

      expect(stateManager.state.watchedRepos).toHaveLength(2);
    });
  });

  describe('getFilteredActivities', () => {
    beforeEach(async () => {
      await stateManager.initialize();

      stateManager.state.allActivities = [
        { id: '1', type: 'pr', title: 'Pull Request', description: 'Test PR', repo: 'facebook/react' },
        { id: '2', type: 'issue', title: 'Issue', description: 'Test Issue', repo: 'nodejs/node' },
        { id: '3', type: 'pr', title: 'Another PR', description: 'More tests', repo: 'facebook/react' }
      ];
    });

    test('returns all activities when filter is "all"', () => {
      stateManager.state.currentFilter = 'all';

      const filtered = stateManager.getFilteredActivities();

      expect(filtered).toHaveLength(3);
    });

    test('filters by type', () => {
      stateManager.state.currentFilter = 'pr';

      const filtered = stateManager.getFilteredActivities();

      expect(filtered).toHaveLength(2);
      expect(filtered.every(a => a.type === 'pr')).toBe(true);
    });

    test('filters out read items when showArchive is false', () => {
      stateManager.state.readItems = ['1'];
      stateManager.state.showArchive = false;

      const filtered = stateManager.getFilteredActivities();

      expect(filtered).toHaveLength(2);
      expect(filtered.find(a => a.id === '1')).toBeUndefined();
    });

    test('includes read items when showArchive is true', () => {
      stateManager.state.readItems = ['1'];
      stateManager.state.showArchive = true;

      const filtered = stateManager.getFilteredActivities();

      expect(filtered).toHaveLength(3);
    });

    test('filters by search query in title', () => {
      stateManager.state.searchQuery = 'Issue';

      const filtered = stateManager.getFilteredActivities();

      expect(filtered).toHaveLength(1);
      expect(filtered[0].title).toBe('Issue');
    });

    test('filters by search query in description', () => {
      stateManager.state.searchQuery = 'tests';

      const filtered = stateManager.getFilteredActivities();

      expect(filtered).toHaveLength(1);
      expect(filtered[0].id).toBe('3');
    });

    test('filters by search query in repo', () => {
      stateManager.state.searchQuery = 'react';

      const filtered = stateManager.getFilteredActivities();

      expect(filtered).toHaveLength(2);
      expect(filtered.every(a => a.repo.includes('react'))).toBe(true);
    });

    test('combines multiple filters', () => {
      stateManager.state.currentFilter = 'pr';
      stateManager.state.searchQuery = 'react';
      stateManager.state.readItems = ['1'];
      stateManager.state.showArchive = false;

      const filtered = stateManager.getFilteredActivities();

      expect(filtered).toHaveLength(1);
      expect(filtered[0].id).toBe('3');
    });
  });

  describe('getStats', () => {
    beforeEach(async () => {
      await stateManager.initialize();

      stateManager.state.allActivities = [
        { id: '1', createdAt: '2024-01-01T00:00:00Z' },
        { id: '2', createdAt: '2024-01-02T00:00:00Z' },
        { id: '3', createdAt: '2024-01-03T00:00:00Z' }
      ];
      stateManager.state.readItems = ['2'];
      stateManager.state.watchedRepos = ['facebook/react', 'nodejs/node'];
    });

    test('returns correct statistics', () => {
      const stats = stateManager.getStats();

      expect(stats.totalActivities).toBe(3);
      expect(stats.readActivities).toBe(1);
      expect(stats.unreadActivities).toBe(2);
      expect(stats.watchedRepositories).toBe(2);
      expect(stats.lastActivity).toBe('2024-01-01T00:00:00Z');
    });

    test('handles empty activities', () => {
      stateManager.state.allActivities = [];
      stateManager.state.readItems = [];

      const stats = stateManager.getStats();

      expect(stats.totalActivities).toBe(0);
      expect(stats.readActivities).toBe(0);
      expect(stats.unreadActivities).toBe(0);
      expect(stats.lastActivity).toBeNull();
    });
  });
});
