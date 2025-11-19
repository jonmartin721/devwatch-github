/**
 * Offline handling utilities
 * Manages offline detection and cached data display
 */

/**
 * Checks if the browser is offline
 * @returns {boolean} True if offline
 */
export function isOffline() {
  return !navigator.onLine;
}

/**
 * Gets a user-friendly offline message
 * @returns {string} Offline status message
 */
export function getOfflineMessage() {
  return isOffline()
    ? 'You are currently offline. Showing cached data.'
    : 'Your connection was restored. Loading fresh data...';
}

/**
 * Shows offline status in the UI
 * @param {string} elementId - ID of element to show offline status in
 * @param {boolean} isOffline - Whether currently offline
 */
export function showOfflineStatus(elementId, offline = isOffline()) {
  const element = document.getElementById(elementId);
  if (!element) return;

  if (offline) {
    element.innerHTML = `
      <div class="offline-status">
        <div class="offline-icon">📡</div>
        <div class="offline-content">
          <strong>Offline Mode</strong>
          <p>Showing cached data. New activities will sync when you're back online.</p>
        </div>
      </div>
    `;
    element.style.display = 'block';
    element.className = 'offline-message';
  } else {
    element.innerHTML = '';
    element.style.display = 'none';
    element.className = '';
  }
}

/**
 * Adds offline event listeners
 * @param {Function} onOnline - Callback when going online
 * @param {Function} onOffline - Callback when going offline
 */
export function setupOfflineListeners(onOnline, onOffline) {
  window.addEventListener('online', () => {
    if (onOnline) onOnline();
  });

  window.addEventListener('offline', () => {
    if (onOffline) onOffline();
  });
}

/**
 * Enhances a fetch call with offline handling
 * @param {string} url - URL to fetch
 * @param {Object} options - Fetch options
 * @param {Object} fallbackData - Fallback data to use if offline
 * @returns {Promise} Fetch result or fallback data
 */
export async function fetchWithOfflineFallback(url, options = {}, fallbackData = null) {
  if (isOffline()) {
    if (fallbackData) {
      return fallbackData;
    }
    throw new Error('Offline: No cached data available');
  }

  try {
    const response = await fetch(url, options);
    return response;
  } catch (error) {
    if (isOffline() && fallbackData) {
      return fallbackData;
    }
    throw error;
  }
}

/**
 * Caches data for offline use
 * @param {string} key - Storage key
 * @param {*} data - Data to cache
 * @param {number} maxAge - Maximum age in milliseconds (default: 1 hour)
 */
export async function cacheForOffline(key, data, maxAge = 3600000) {
  try {
    const cacheData = {
      data,
      timestamp: Date.now(),
      maxAge
    };
    await chrome.storage.local.set({ [key]: cacheData });
  } catch (error) {
    console.warn('Failed to cache data for offline use:', error);
  }
}

/**
 * Gets cached data if it's still valid
 * @param {string} key - Storage key
 * @returns {Promise<*>} Cached data or null
 */
export async function getCachedData(key) {
  try {
    const result = await chrome.storage.local.get([key]);
    const cached = result[key];

    if (!cached) {
      return null;
    }

    const now = Date.now();
    const age = now - cached.timestamp;

    if (age > cached.maxAge) {
      // Cache expired, remove it
      await chrome.storage.local.remove([key]);
      return null;
    }

    return cached.data;
  } catch (error) {
    console.warn('Failed to get cached data:', error);
    return null;
  }
}

/**
 * Shows cached activities when offline
 * @param {Array} activities - Cached activities to display
 * @param {Array} readItems - Cached read items
 */
export function showCachedActivities(activities) {
  const list = document.getElementById('activityList');
  if (!list) return;

  if (!activities || activities.length === 0) {
    list.innerHTML = `
      <div class="empty-state">
        <div class="offline-empty">
          <div class="offline-icon">📡</div>
          <p>No cached data available</p>
          <small>Check your connection and try again</small>
        </div>
      </div>
    `;
    return;
  }

  // Show cached data indicator
  const cachedInfo = document.createElement('div');
  cachedInfo.className = 'cached-indicator';
  cachedInfo.innerHTML = `
    <span class="cached-icon">💾</span>
    <span>Showing cached data from ${activities.length} activities</span>
  `;

  // Insert cached indicator at the top
  list.insertBefore(cachedInfo, list.firstChild);

  // Mark activities as cached
  activities.forEach(activity => {
    activity.isCached = true;
  });

  // Continue with normal rendering
  return activities;
}

/**
 * Clears expired cache entries
 */
export async function clearExpiredCache() {
  try {
    const result = await chrome.storage.local.get();
    const keysToRemove = [];

    Object.entries(result).forEach(([key, value]) => {
      if (key.endsWith('_cache') && value.timestamp) {
        const age = Date.now() - value.timestamp;
        if (age > value.maxAge) {
          keysToRemove.push(key);
        }
      }
    });

    if (keysToRemove.length > 0) {
      await chrome.storage.local.remove(keysToRemove);
      console.log(`Cleared ${keysToRemove.length} expired cache entries`);
    }
  } catch (error) {
    console.warn('Failed to clear expired cache:', error);
  }
}

/**
 * Gets storage usage information
 * @returns {Promise<Object>} Storage usage stats
 */
export async function getStorageUsage() {
  try {
    const result = await chrome.storage.local.get();
    const totalBytes = JSON.stringify(result).length;

    // Chrome extension storage quota is typically 5MB
    const quotaBytes = 5 * 1024 * 1024;
    const usagePercent = (totalBytes / quotaBytes) * 100;

    return {
      totalBytes,
      quotaBytes,
      usagePercent: Math.round(usagePercent * 100) / 100,
      itemCount: Object.keys(result).length
    };
  } catch (_error) {
    return {
      totalBytes: 0,
      quotaBytes: 5 * 1024 * 1024,
      usagePercent: 0,
      itemCount: 0
    };
  }
}