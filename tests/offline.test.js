/**
 * Offline handling tests
 */

import { jest } from '@jest/globals';
import {
  isOffline,
  getOfflineMessage,
  showOfflineStatus,
  setupOfflineListeners,
  fetchWithOfflineFallback,
  cacheForOffline,
  getCachedData,
  clearExpiredCache,
  getStorageUsage,
  showCachedActivities
} from '../shared/offline-manager.js';

// Mock DOM
document.body.innerHTML = `
  <div id="offlineStatus" style="display: none;"></div>
  <div id="activityList">
    <div class="empty-state">
      <p>No recent activity</p>
    </div>
  </div>
`;

// Mock Chrome storage API
global.chrome = {
  storage: {
    local: {
      get: jest.fn(),
      set: jest.fn(),
      remove: jest.fn()
    }
  }
};

// Mock navigator
Object.defineProperty(navigator, 'onLine', {
  writable: true,
  value: true
});

describe('Offline Manager', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    navigator.onLine = true;
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    console.warn.mockRestore();
    console.log.mockRestore();
  });

  describe('isOffline', () => {
    it('should return true when navigator.onLine is false', () => {
      navigator.onLine = false;
      expect(isOffline()).toBe(true);
    });

    it('should return false when navigator.onLine is true', () => {
      navigator.onLine = true;
      expect(isOffline()).toBe(false);
    });
  });

  describe('getOfflineMessage', () => {
    it('should return offline message when offline', () => {
      navigator.onLine = false;
      expect(getOfflineMessage()).toBe('You are currently offline. Showing cached data.');
    });

    it('should return online message when online', () => {
      navigator.onLine = true;
      expect(getOfflineMessage()).toBe('Your connection was restored. Loading fresh data...');
    });
  });

  describe('showOfflineStatus', () => {
    it('should show offline status when offline', () => {
      navigator.onLine = false;
      showOfflineStatus('offlineStatus', true);

      const element = document.getElementById('offlineStatus');
      expect(element.style.display).toBe('block');
      expect(element.innerHTML).toContain('Offline Mode');
      expect(element.className).toBe('offline-message');
    });

    it('should hide offline status when online', () => {
      navigator.onLine = true;
      showOfflineStatus('offlineStatus', false);

      const element = document.getElementById('offlineStatus');
      expect(element.style.display).toBe('none');
      expect(element.className).toBe('');
    });

    it('should handle missing element gracefully', () => {
      expect(() => {
        showOfflineStatus('nonexistent', true);
      }).not.toThrow();
    });
  });

  describe('setupOfflineListeners', () => {
    it('should setup event listeners for online/offline events', () => {
      const mockOnlineCallback = jest.fn();
      const mockOfflineCallback = jest.fn();

      setupOfflineListeners(mockOnlineCallback, mockOfflineCallback);

      // Simulate going offline
      const offlineEvent = new Event('offline');
      window.dispatchEvent(offlineEvent);
      expect(mockOfflineCallback).toHaveBeenCalled();

      // Simulate coming online
      const onlineEvent = new Event('online');
      window.dispatchEvent(onlineEvent);
      expect(mockOnlineCallback).toHaveBeenCalled();
    });

    it('should work without callbacks', () => {
      expect(() => {
        setupOfflineListeners();
      }).not.toThrow();

      const offlineEvent = new Event('offline');
      window.dispatchEvent(offlineEvent);

      const onlineEvent = new Event('online');
      window.dispatchEvent(onlineEvent);
    });
  });

  describe('fetchWithOfflineFallback', () => {
    beforeEach(() => {
      global.fetch = jest.fn();
    });

    afterEach(() => {
      delete global.fetch;
    });

    it('should return fallback data when offline', async () => {
      navigator.onLine = false;
      const fallbackData = { cached: true };

      const result = await fetchWithOfflineFallback('https://api.example.com', {}, fallbackData);
      expect(result).toBe(fallbackData);
    });

    it('should return fetch result when online and successful', async () => {
      navigator.onLine = true;
      const mockResponse = { ok: true };
      fetch.mockResolvedValue(mockResponse);

      const result = await fetchWithOfflineFallback('https://api.example.com');
      expect(result).toBe(mockResponse);
      expect(fetch).toHaveBeenCalledWith('https://api.example.com', {});
    });

    it('should return fallback data when fetch fails and offline', async () => {
      navigator.onLine = false;
      const fallbackData = { cached: true };
      fetch.mockRejectedValue(new Error('Network error'));

      const result = await fetchWithOfflineFallback('https://api.example.com', {}, fallbackData);
      expect(result).toBe(fallbackData);
    });

    it('should throw error when fetch fails and no fallback', async () => {
      navigator.onLine = false;
      fetch.mockRejectedValue(new Error('Network error'));

      await expect(fetchWithOfflineFallback('https://api.example.com')).rejects.toThrow('Offline: No cached data available');
    });
  });

  describe('cacheForOffline', () => {
    it('should store data with timestamp and maxAge', async () => {
      const data = { activities: [] };
      const maxAge = 1800000; // 30 minutes

      await cacheForOffline('test_key', data, maxAge);

      expect(chrome.storage.local.set).toHaveBeenCalledWith({
        test_key: {
          data,
          timestamp: expect.any(Number),
          maxAge
        }
      });
    });

    it('should use default maxAge when not provided', async () => {
      const data = { activities: [] };

      await cacheForOffline('test_key', data);

      expect(chrome.storage.local.set).toHaveBeenCalledWith({
        test_key: {
          data,
          timestamp: expect.any(Number),
          maxAge: 3600000 // 1 hour default
        }
      });
    });

    it('should handle storage errors gracefully', async () => {
      chrome.storage.local.set.mockRejectedValue(new Error('Storage full'));
      const data = { activities: [] };

      await cacheForOffline('test_key', data);

      expect(console.warn).toHaveBeenCalledWith('Failed to cache data for offline use:', expect.any(Error));
    });
  });

  describe('getCachedData', () => {
    it('should return cached data when valid', async () => {
      const now = Date.now();
      const cachedData = {
        data: { activities: [] },
        timestamp: now - 1000, // 1 second ago
        maxAge: 3600000 // 1 hour
      };

      chrome.storage.local.get.mockResolvedValue({ test_key: cachedData });

      const result = await getCachedData('test_key');
      expect(result).toEqual({ activities: [] });
    });

    it('should return null when no cached data exists', async () => {
      chrome.storage.local.get.mockResolvedValue({});

      const result = await getCachedData('test_key');
      expect(result).toBeNull();
    });

    it('should return null and remove expired cache', async () => {
      const now = Date.now();
      const expiredData = {
        data: { activities: [] },
        timestamp: now - 7200000, // 2 hours ago
        maxAge: 3600000 // 1 hour max age
      };

      chrome.storage.local.get.mockResolvedValue({ test_key: expiredData });

      const result = await getCachedData('test_key');
      expect(result).toBeNull();
      expect(chrome.storage.local.remove).toHaveBeenCalledWith(['test_key']);
    });

    it('should handle storage errors gracefully', async () => {
      chrome.storage.local.get.mockRejectedValue(new Error('Storage error'));

      const result = await getCachedData('test_key');
      expect(result).toBeNull();
      expect(console.warn).toHaveBeenCalled();
    });
  });

  describe('clearExpiredCache', () => {
    it('should remove expired cache entries', async () => {
      const now = Date.now();
      const storageData = {
        activities_cache: {
          data: [],
          timestamp: now - 7200000, // 2 hours ago
          maxAge: 3600000 // 1 hour
        },
        settings_cache: {
          data: {},
          timestamp: now - 1000, // 1 second ago
          maxAge: 3600000 // 1 hour
        },
        other_data: 'not a cache'
      };

      chrome.storage.local.get.mockResolvedValue(storageData);

      await clearExpiredCache();

      expect(chrome.storage.local.remove).toHaveBeenCalledWith(['activities_cache']);
      expect(console.log).toHaveBeenCalledWith('Cleared 1 expired cache entries');
    });

    it('should handle storage errors gracefully', async () => {
      chrome.storage.local.get.mockRejectedValue(new Error('Storage error'));

      await clearExpiredCache();

      expect(console.warn).toHaveBeenCalledWith('Failed to clear expired cache:', expect.any(Error));
    });
  });

  describe('getStorageUsage', () => {
    it('should calculate storage usage correctly', async () => {
      const storageData = {
        activities: Array(100).fill({}), // Large data
        settings: { theme: 'dark' },
        other: 'data'
      };
      chrome.storage.local.get.mockResolvedValue(storageData);

      const result = await getStorageUsage();

      expect(result).toHaveProperty('totalBytes');
      expect(result).toHaveProperty('quotaBytes', 5 * 1024 * 1024);
      expect(result).toHaveProperty('usagePercent');
      expect(result).toHaveProperty('itemCount', 3);
      expect(typeof result.totalBytes).toBe('number');
      expect(typeof result.usagePercent).toBe('number');
    });

    it('should handle empty storage', async () => {
      chrome.storage.local.get.mockResolvedValue({});

      const result = await getStorageUsage();

      expect(result.totalBytes).toBe(0);
      expect(result.usagePercent).toBe(0);
      expect(result.itemCount).toBe(0);
    });

    it('should handle storage errors gracefully', async () => {
      chrome.storage.local.get.mockRejectedValue(new Error('Storage error'));

      const result = await getStorageUsage();

      expect(result.totalBytes).toBe(0);
      expect(result.usagePercent).toBe(0);
      expect(result.itemCount).toBe(0);
    });
  });

  describe('showCachedActivities', () => {
    it('should show cached indicator and return activities', () => {
      const activities = [
        { id: 1, title: 'Test activity' },
        { id: 2, title: 'Another activity' }
      ];

      const result = showCachedActivities(activities);

      const list = document.getElementById('activityList');
      expect(list.innerHTML).toContain('cached-indicator');
      expect(list.innerHTML).toContain('Showing cached data from 2 activities');
      expect(result).toEqual(activities);

      // Check that activities are marked as cached
      activities.forEach(activity => {
        expect(activity.isCached).toBe(true);
      });
    });

    it('should show empty state when no cached activities', () => {
      const result = showCachedActivities([]);

      const list = document.getElementById('activityList');
      expect(list.innerHTML).toContain('No cached data available');
      expect(result).toEqual([]);
    });

    it('should handle missing element gracefully', () => {
      const originalElement = document.getElementById('activityList');
      document.getElementById = jest.fn().mockReturnValue(null);

      const activities = [{ id: 1 }];
      expect(() => {
        showCachedActivities(activities);
      }).not.toThrow();

      document.getElementById = originalElement;
    });
  });
});

export {};