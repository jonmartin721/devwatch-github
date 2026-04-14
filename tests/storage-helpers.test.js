/**
 * Chrome storage helper functions tests
 */

import { jest } from '@jest/globals';

// Dynamic import after mocking
const {
  getSyncItem,
  getLocalItem,
  getSyncItems,
  getLocalItems,
  setSyncItem,
  setLocalItem,
  getExcludedRepos,
  getAuthSession,
  getWatchedRepos,
  getSettings,
  setAuthSession,
  clearAuthSession,
  getAccessToken,
  updateSettings
} = await import('../shared/storage-helpers.js');

describe('Storage Helpers', () => {
  let mockSyncStorage;
  let mockLocalStorage;
  let mockSessionStorage;

  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();
    
    // Mock storage with in-memory objects
    mockSyncStorage = {};
    mockLocalStorage = {};
    mockSessionStorage = {};

    // Mock chrome.storage.sync
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
          }),
          remove: jest.fn((keys, callback) => {
            const keyArray = Array.isArray(keys) ? keys : [keys];
            keyArray.forEach(key => {
              delete mockSyncStorage[key];
            });
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
          }),
          remove: jest.fn((keys, callback) => {
            const keyArray = Array.isArray(keys) ? keys : [keys];
            keyArray.forEach(key => {
              delete mockLocalStorage[key];
            });
            if (callback) callback();
          })
        },
        session: {
          get: jest.fn((keys, callback) => {
            const result = {};
            const keyArray = Array.isArray(keys) ? keys : [keys];
            keyArray.forEach(key => {
              if (Object.prototype.hasOwnProperty.call(mockSessionStorage, key)) {
                result[key] = mockSessionStorage[key];
              }
            });
            callback(result);
          }),
          set: jest.fn((items, callback) => {
            Object.assign(mockSessionStorage, items);
            if (callback) callback();
          }),
          remove: jest.fn((keys, callback) => {
            const keyArray = Array.isArray(keys) ? keys : [keys];
            keyArray.forEach(key => {
              delete mockSessionStorage[key];
            });
            if (callback) callback();
          })
        }
      }
    };
  });

  describe('getSyncItem', () => {
    it('should get existing item from sync storage', async () => {
      mockSyncStorage.testKey = 'testValue';

      const result = await getSyncItem('testKey');

      expect(result).toBe('testValue');
      expect(chrome.storage.sync.get).toHaveBeenCalledWith(['testKey'], expect.any(Function));
    });

    it('should return default value for non-existent key', async () => {
      const result = await getSyncItem('nonExistent', 'default');

      expect(result).toBe('default');
    });

    it('should return null if no default provided', async () => {
      const result = await getSyncItem('nonExistent');

      expect(result).toBeNull();
    });

    it('should return 0 as valid value (not default)', async () => {
      mockSyncStorage.numberKey = 0;

      const result = await getSyncItem('numberKey', 'default');

      expect(result).toBe(0);
    });

    it('should return empty string as valid value (not default)', async () => {
      mockSyncStorage.emptyKey = '';

      const result = await getSyncItem('emptyKey', 'default');

      expect(result).toBe('');
    });

    it('returns the default when chrome extension APIs are unavailable', async () => {
      const originalChrome = global.chrome;
      delete global.chrome;

      const result = await getSyncItem('missingKey', 'fallback');

      expect(result).toBe('fallback');
      global.chrome = originalChrome;
    });
  });

  describe('getLocalItem', () => {
    it('should get existing item from local storage', async () => {
      mockLocalStorage.testKey = { data: 'value' };

      const result = await getLocalItem('testKey');

      expect(result).toEqual({ data: 'value' });
      expect(chrome.storage.local.get).toHaveBeenCalledWith(['testKey'], expect.any(Function));
    });

    it('should return default value for non-existent key', async () => {
      const result = await getLocalItem('nonExistent', 'default');

      expect(result).toBe('default');
    });

    it('should return null if no default provided', async () => {
      const result = await getLocalItem('nonExistent');

      expect(result).toBeNull();
    });

    it('should handle arrays', async () => {
      mockLocalStorage.arrayKey = [1, 2, 3];

      const result = await getLocalItem('arrayKey');

      expect(result).toEqual([1, 2, 3]);
    });

    it('rejects when chrome reports a runtime error', async () => {
      chrome.storage.local.get.mockImplementation((keys, callback) => {
        chrome.runtime = { lastError: { message: 'local failure' } };
        callback({});
        chrome.runtime.lastError = null;
      });

      await expect(getLocalItem('broken')).rejects.toThrow('local failure');
    });
  });

  describe('getSyncItems', () => {
    it('should get multiple items from sync storage', async () => {
      mockSyncStorage.key1 = 'value1';
      mockSyncStorage.key2 = 'value2';
      mockSyncStorage.key3 = 'value3';

      const result = await getSyncItems(['key1', 'key2']);

      expect(result).toEqual({
        key1: 'value1',
        key2: 'value2'
      });
    });

    it('should return empty object for non-existent keys', async () => {
      const result = await getSyncItems(['nonExistent1', 'nonExistent2']);

      expect(result).toEqual({});
    });

    it('should return partial results for mixed existent/non-existent keys', async () => {
      mockSyncStorage.exists = 'value';

      const result = await getSyncItems(['exists', 'nonExistent']);

      expect(result).toEqual({
        exists: 'value'
      });
    });
  });

  describe('getLocalItems', () => {
    it('should get multiple items from local storage', async () => {
      mockLocalStorage.setting1 = true;
      mockLocalStorage.setting2 = false;

      const result = await getLocalItems(['setting1', 'setting2']);

      expect(result).toEqual({
        setting1: true,
        setting2: false
      });
    });

    it('should handle empty array', async () => {
      const result = await getLocalItems([]);

      expect(result).toEqual({});
    });
  });

  describe('setSyncItem', () => {
    it('should set item in sync storage', async () => {
      await setSyncItem('newKey', 'newValue');

      expect(mockSyncStorage.newKey).toBe('newValue');
      expect(chrome.storage.sync.set).toHaveBeenCalledWith(
        { newKey: 'newValue' },
        expect.any(Function)
      );
    });

    it('should overwrite existing item', async () => {
      mockSyncStorage.existingKey = 'oldValue';

      await setSyncItem('existingKey', 'newValue');

      expect(mockSyncStorage.existingKey).toBe('newValue');
    });

    it('should store objects', async () => {
      const obj = { nested: { data: 'value' } };

      await setSyncItem('objectKey', obj);

      expect(mockSyncStorage.objectKey).toEqual(obj);
    });

    it('translates quota failures into a clearer sync-storage error', async () => {
      chrome.storage.sync.set.mockImplementation((items, callback) => {
        chrome.runtime = { lastError: { message: 'QUOTA_EXCEEDED per item' } };
        callback();
        chrome.runtime.lastError = null;
      });

      await expect(setSyncItem('oversized', 'value')).rejects.toThrow('Sync storage quota exceeded');
    });
  });

  describe('setLocalItem', () => {
    it('should set item in local storage', async () => {
      await setLocalItem('localKey', 'localValue');

      expect(mockLocalStorage.localKey).toBe('localValue');
      expect(chrome.storage.local.set).toHaveBeenCalledWith(
        { localKey: 'localValue' },
        expect.any(Function)
      );
    });

    it('should store arrays', async () => {
      const arr = [1, 2, 3];

      await setLocalItem('arrayKey', arr);

      expect(mockLocalStorage.arrayKey).toEqual(arr);
    });

    it('translates quota failures into a clearer local-storage error', async () => {
      chrome.storage.local.set.mockImplementation((items, callback) => {
        chrome.runtime = { lastError: { message: 'QUOTA_EXCEEDED bytes' } };
        callback();
        chrome.runtime.lastError = null;
      });

      await expect(setLocalItem('oversized', ['value'])).rejects.toThrow('Storage quota exceeded');
    });
  });

  describe('watched repository helpers', () => {
    it('migrates watched repositories from sync storage into local storage', async () => {
      mockSyncStorage.watchedRepos = ['facebook/react'];

      const repos = await getWatchedRepos();

      expect(repos).toEqual([
        expect.objectContaining({
          fullName: 'facebook/react'
        })
      ]);
      expect(mockLocalStorage.watchedRepos).toEqual([
        expect.objectContaining({
          fullName: 'facebook/react'
        })
      ]);
      expect(chrome.storage.sync.remove).toHaveBeenCalledWith(['watchedRepos'], expect.any(Function));
    });

    it('merges watched repositories into getSettings results', async () => {
      mockLocalStorage.watchedRepos = [{ fullName: 'vuejs/core' }];
      mockSyncStorage.filters = { prs: false, issues: true, releases: true };

      const settings = await getSettings();

      expect(settings.watchedRepos).toEqual([
        expect.objectContaining({ fullName: 'vuejs/core' })
      ]);
      expect(settings.filters).toEqual({ prs: false, issues: true, releases: true });
    });
  });

  describe('getExcludedRepos', () => {
    it('should return empty set when no repos provided', () => {
      const result = getExcludedRepos();

      expect(result).toBeInstanceOf(Set);
      expect(result.size).toBe(0);
    });

    it('should include all muted repos', () => {
      const mutedRepos = ['repo1', 'repo2', 'repo3'];

      const result = getExcludedRepos(mutedRepos, []);

      expect(result.size).toBe(3);
      expect(result.has('repo1')).toBe(true);
      expect(result.has('repo2')).toBe(true);
      expect(result.has('repo3')).toBe(true);
    });

    it('should include active snoozed repos', () => {
      const now = Date.now();
      const snoozedRepos = [
        { repo: 'snoozed1', expiresAt: now + 60000 }, // Expires in 1 minute (active)
        { repo: 'snoozed2', expiresAt: now + 3600000 } // Expires in 1 hour (active)
      ];

      const result = getExcludedRepos([], snoozedRepos);

      expect(result.size).toBe(2);
      expect(result.has('snoozed1')).toBe(true);
      expect(result.has('snoozed2')).toBe(true);
    });

    it('should exclude expired snoozed repos', () => {
      const now = Date.now();
      const snoozedRepos = [
        { repo: 'active', expiresAt: now + 60000 }, // Active
        { repo: 'expired1', expiresAt: now - 60000 }, // Expired
        { repo: 'expired2', expiresAt: now - 3600000 } // Expired
      ];

      const result = getExcludedRepos([], snoozedRepos);

      expect(result.size).toBe(1);
      expect(result.has('active')).toBe(true);
      expect(result.has('expired1')).toBe(false);
      expect(result.has('expired2')).toBe(false);
    });

    it('should combine muted and snoozed repos', () => {
      const now = Date.now();
      const mutedRepos = ['muted1', 'muted2'];
      const snoozedRepos = [
        { repo: 'snoozed1', expiresAt: now + 60000 },
        { repo: 'snoozed2', expiresAt: now + 3600000 }
      ];

      const result = getExcludedRepos(mutedRepos, snoozedRepos);

      expect(result.size).toBe(4);
      expect(result.has('muted1')).toBe(true);
      expect(result.has('muted2')).toBe(true);
      expect(result.has('snoozed1')).toBe(true);
      expect(result.has('snoozed2')).toBe(true);
    });

    it('should handle duplicates between muted and snoozed', () => {
      const now = Date.now();
      const mutedRepos = ['repo1', 'repo2'];
      const snoozedRepos = [
        { repo: 'repo1', expiresAt: now + 60000 }, // Also in muted
        { repo: 'repo3', expiresAt: now + 60000 }
      ];

      const result = getExcludedRepos(mutedRepos, snoozedRepos);

      // Should not have duplicates
      expect(result.size).toBe(3);
      expect(result.has('repo1')).toBe(true);
      expect(result.has('repo2')).toBe(true);
      expect(result.has('repo3')).toBe(true);
    });

    it('should handle null muted repos', () => {
      const now = Date.now();
      const snoozedRepos = [
        { repo: 'snoozed', expiresAt: now + 60000 }
      ];

      const result = getExcludedRepos(null, snoozedRepos);

      expect(result.size).toBe(1);
      expect(result.has('snoozed')).toBe(true);
    });
  });

  describe('auth session helpers', () => {
    it('returns auth session from session storage when available', async () => {
      mockSessionStorage.githubAuthSession = {
        accessToken: 'oauth-token',
        username: 'octocat'
      };

      const result = await getAuthSession();

      expect(result).toEqual({
        accessToken: 'oauth-token',
        username: 'octocat'
      });
      expect(chrome.storage.local.remove).toHaveBeenCalledWith(
        ['encryptedGithubAuthSession', 'encryptionKey'],
        expect.any(Function)
      );
    });

    it('clears legacy persisted auth data when no session exists', async () => {
      mockLocalStorage.encryptedGithubAuthSession = { iv: [1], data: [2] };
      mockLocalStorage.encryptionKey = [3, 4, 5];

      const result = await getAuthSession();

      expect(result).toBeNull();
    });

    it('stores auth session in session storage only', async () => {
      await setAuthSession({
        accessToken: 'oauth-token',
        username: 'octocat'
      });

      expect(mockSessionStorage.githubAuthSession).toEqual({
        accessToken: 'oauth-token',
        username: 'octocat'
      });
      expect(chrome.storage.local.remove).toHaveBeenCalledWith(
        ['encryptedGithubAuthSession', 'encryptionKey'],
        expect.any(Function)
      );
    });

    it('clears the session when the payload is invalid', async () => {
      mockSessionStorage.githubAuthSession = { accessToken: 'old-token' };

      await setAuthSession({ username: 'octocat' });

      expect(mockSessionStorage.githubAuthSession).toBeUndefined();
    });

    it('clears auth session from session storage and removes legacy persisted data', async () => {
      mockSessionStorage.githubAuthSession = { accessToken: 'oauth-token' };
      mockLocalStorage.encryptedGithubAuthSession = { iv: [], data: [] };
      mockLocalStorage.encryptionKey = [1, 2, 3];

      await clearAuthSession();

      expect(mockSessionStorage.githubAuthSession).toBeUndefined();
      expect(chrome.storage.local.remove).toHaveBeenCalledWith(
        ['encryptedGithubAuthSession', 'encryptionKey'],
        expect.any(Function)
      );
    });

    it('returns the access token from the current auth session', async () => {
      mockSessionStorage.githubAuthSession = {
        accessToken: 'oauth-token',
        username: 'octocat'
      };

      const result = await getAccessToken();

      expect(result).toBe('oauth-token');
    });

    it('returns null when no auth session is stored', async () => {
      const result = await getAccessToken();

      expect(result).toBeNull();
    });
  });

  describe('updateSettings', () => {
    it('fans out watched repos, lastCheck, and sync settings to the correct storage backends', async () => {
      await updateSettings({
        watchedRepos: ['facebook/react'],
        lastCheck: '2026-04-13T00:00:00.000Z',
        theme: 'dark',
        colorTheme: 'graphite'
      });

      expect(mockLocalStorage.watchedRepos).toEqual([
        expect.objectContaining({ fullName: 'facebook/react' })
      ]);
      expect(mockSyncStorage.lastCheck).toBe('2026-04-13T00:00:00.000Z');
      expect(mockSyncStorage.theme).toBe('dark');
      expect(mockSyncStorage.colorTheme).toBe('graphite');
    });
  });
});
