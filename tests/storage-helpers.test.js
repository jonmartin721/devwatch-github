/**
 * Chrome storage helper functions tests
 */

import { jest } from '@jest/globals';
import {
  getSyncItem,
  getLocalItem,
  getSyncItems,
  getLocalItems,
  setSyncItem,
  setLocalItem,
  getExcludedRepos,
  getToken,
  setToken,
  clearToken
} from '../shared/storage-helpers.js';

describe('Storage Helpers', () => {
  let mockSyncStorage;
  let mockLocalStorage;

  beforeEach(() => {
    // Mock storage with in-memory objects
    mockSyncStorage = {};
    mockLocalStorage = {};

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
          remove: jest.fn((keys) => {
            return new Promise((resolve) => {
              const keyArray = Array.isArray(keys) ? keys : [keys];
              keyArray.forEach(key => {
                delete mockSyncStorage[key];
              });
              resolve();
            });
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
          remove: jest.fn((keys) => {
            return new Promise((resolve) => {
              const keyArray = Array.isArray(keys) ? keys : [keys];
              keyArray.forEach(key => {
                delete mockLocalStorage[key];
              });
              resolve();
            });
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

  describe('getToken', () => {
    it('should return token from local storage if it exists', async () => {
      mockLocalStorage.githubToken = 'local-token-123';

      const result = await getToken();

      expect(result).toBe('local-token-123');
    });

    it('should migrate token from sync to local storage', async () => {
      mockSyncStorage.githubToken = 'sync-token-456';

      const result = await getToken();

      expect(result).toBe('sync-token-456');
      // Should be copied to local storage
      expect(mockLocalStorage.githubToken).toBe('sync-token-456');
      // Should be removed from sync storage
      expect(mockSyncStorage.githubToken).toBeUndefined();
    });

    it('should return null if no token exists', async () => {
      const result = await getToken();

      expect(result).toBeNull();
    });

    it('should prefer local token over sync token', async () => {
      mockLocalStorage.githubToken = 'local-token-123';
      mockSyncStorage.githubToken = 'sync-token-456';

      const result = await getToken();

      expect(result).toBe('local-token-123');
      // Should not migrate if local already exists
      expect(mockSyncStorage.githubToken).toBe('sync-token-456');
    });

    it('should not migrate empty sync token', async () => {
      mockSyncStorage.githubToken = '';

      const result = await getToken();

      expect(result).toBeNull();
      expect(mockLocalStorage.githubToken).toBeUndefined();
    });
  });

  describe('setToken', () => {
    it('should set token in local storage', async () => {
      await setToken('new-token-789');

      expect(mockLocalStorage.githubToken).toBe('new-token-789');
    });

    it('should remove token from sync storage', async () => {
      mockSyncStorage.githubToken = 'old-sync-token';

      await setToken('new-token-789');

      expect(mockSyncStorage.githubToken).toBeUndefined();
    });

    it('should overwrite existing local token', async () => {
      mockLocalStorage.githubToken = 'old-local-token';

      await setToken('new-token-789');

      expect(mockLocalStorage.githubToken).toBe('new-token-789');
    });
  });

  describe('clearToken', () => {
    it('should clear token from both storages', async () => {
      mockLocalStorage.githubToken = 'local-token';
      mockSyncStorage.githubToken = 'sync-token';

      await clearToken();

      expect(mockLocalStorage.githubToken).toBe('');
      expect(mockSyncStorage.githubToken).toBe('');
    });

    it('should work even if no tokens exist', async () => {
      await clearToken();

      expect(mockLocalStorage.githubToken).toBe('');
      expect(mockSyncStorage.githubToken).toBe('');
    });
  });
});

export {};
