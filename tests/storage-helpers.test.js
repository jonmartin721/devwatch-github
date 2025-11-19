/**
 * Chrome storage helper functions tests
 */

import { jest } from '@jest/globals';

// Mock crypto-utils using unstable_mockModule for ESM support
const mockEncryptData = jest.fn(() => Promise.resolve({ iv: [1, 2, 3], data: [4, 5, 6] }));
const mockDecryptData = jest.fn(() => Promise.resolve('decrypted-token'));

jest.unstable_mockModule('../shared/crypto-utils.js', () => ({
  encryptData: mockEncryptData,
  decryptData: mockDecryptData
}));

// Dynamic import after mocking
const {
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
} = await import('../shared/storage-helpers.js');

describe('Storage Helpers', () => {
  let mockSyncStorage;
  let mockLocalStorage;

  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();
    
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
      // Mock encrypted token in local storage
      mockLocalStorage.encryptedGithubToken = { iv: [], data: [] };
      // Mock decryptData to return a specific token
      mockDecryptData.mockResolvedValueOnce('decrypted-token');

      const result = await getToken();

      expect(result).toBe('decrypted-token');
      expect(mockDecryptData).toHaveBeenCalled();
    });

    it('should return null if no token exists', async () => {
      const result = await getToken();

      expect(result).toBeNull();
    });
  });

  describe('setToken', () => {
    it('should set token in local storage', async () => {
      await setToken('new-token-789');

      // Should store encrypted data
      expect(mockLocalStorage.encryptedGithubToken).toBeDefined();
      expect(mockEncryptData).toHaveBeenCalledWith('new-token-789');
    });

    it('should overwrite existing local token', async () => {
      mockLocalStorage.encryptedGithubToken = { iv: [], data: [] };

      await setToken('new-token-789');

      expect(mockEncryptData).toHaveBeenCalledWith('new-token-789');
      expect(mockLocalStorage.encryptedGithubToken).toBeDefined();
    });
  });

  describe('clearToken', () => {
    it('should clear token from local storage', async () => {
      mockLocalStorage.encryptedGithubToken = { iv: [], data: [] };

      await clearToken();

      expect(mockLocalStorage.encryptedGithubToken).toBeNull();
    });

    it('should work even if no token exists', async () => {
      await clearToken();

      expect(mockLocalStorage.encryptedGithubToken).toBeNull();
    });
  });
});
