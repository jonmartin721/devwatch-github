/**
 * Chrome storage helper functions with promisified APIs
 */
import { encryptData, decryptData } from './crypto-utils.js';

/**
 * Check if running in Chrome extension context
 * @returns {boolean} True if Chrome APIs are available
 */
function isChromeExtension() {
  return typeof chrome !== 'undefined' && chrome.storage !== undefined;
}

/**
 * Get an item from chrome.storage.sync with Promise API
 * @param {string} key - Storage key
 * @param {*} defaultValue - Default value if key doesn't exist
 * @returns {Promise<*>} Stored value or default
 */
export function getSyncItem(key, defaultValue = null) {
  if (!isChromeExtension()) {
    return Promise.resolve(defaultValue);
  }
  return new Promise((resolve) => {
    chrome.storage.sync.get([key], (result) => {
      resolve(result[key] !== undefined ? result[key] : defaultValue);
    });
  });
}

/**
 * Get an item from chrome.storage.local with Promise API
 * @param {string} key - Storage key
 * @param {*} defaultValue - Default value if key doesn't exist
 * @returns {Promise<*>} Stored value or default
 */
export function getLocalItem(key, defaultValue = null) {
  if (!isChromeExtension()) {
    return Promise.resolve(defaultValue);
  }
  return new Promise((resolve, reject) => {
    chrome.storage.local.get([key], (result) => {
      if (chrome.runtime && chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
      } else {
        resolve(result[key] !== undefined ? result[key] : defaultValue);
      }
    });
  });
}

/**
 * Get multiple items from chrome.storage.sync with Promise API
 * @param {Array<string>} keys - Array of storage keys
 * @returns {Promise<Object>} Object with all keys and values
 */
export function getSyncItems(keys) {
  if (!isChromeExtension()) {
    return Promise.resolve({});
  }
  return new Promise((resolve, reject) => {
    chrome.storage.sync.get(keys, (result) => {
      if (chrome.runtime && chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
      } else {
        resolve(result);
      }
    });
  });
}

/**
 * Get multiple items from chrome.storage.local with Promise API
 * @param {Array<string>} keys - Array of storage keys
 * @returns {Promise<Object>} Object with all keys and values
 */
export function getLocalItems(keys) {
  if (!isChromeExtension()) {
    return Promise.resolve({});
  }
  return new Promise((resolve, reject) => {
    chrome.storage.local.get(keys, (result) => {
      if (chrome.runtime && chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
      } else {
        resolve(result);
      }
    });
  });
}

/**
 * Set an item in chrome.storage.sync with Promise API
 * Includes quota checking and error handling
 * @param {string} key - Storage key
 * @param {*} value - Value to store
 * @returns {Promise<void>}
 * @throws {Error} If storage quota exceeded or write fails
 */
export function setSyncItem(key, value) {
  if (!isChromeExtension()) {
    return Promise.resolve();
  }
  return new Promise((resolve, reject) => {
    chrome.storage.sync.set({ [key]: value }, () => {
      if (chrome.runtime && chrome.runtime.lastError) {
        const error = chrome.runtime.lastError;
        if (error.message && error.message.includes('QUOTA_EXCEEDED')) {
          reject(new Error('Sync storage quota exceeded. Too much data to sync.'));
        } else {
          reject(new Error(`Storage write failed: ${error.message}`));
        }
      } else {
        resolve();
      }
    });
  });
}

/**
 * Set an item in chrome.storage.local with Promise API
 * Includes quota checking and error handling
 * @param {string} key - Storage key
 * @param {*} value - Value to store
 * @returns {Promise<void>}
 * @throws {Error} If storage quota exceeded or write fails
 */
export function setLocalItem(key, value) {
  if (!isChromeExtension()) {
    return Promise.resolve();
  }
  return new Promise((resolve, reject) => {
    chrome.storage.local.set({ [key]: value }, () => {
      if (chrome.runtime && chrome.runtime.lastError) {
        const error = chrome.runtime.lastError;
        if (error.message && error.message.includes('QUOTA_EXCEEDED')) {
          reject(new Error('Storage quota exceeded. Please clear old data.'));
        } else {
          reject(new Error(`Storage write failed: ${error.message}`));
        }
      } else {
        resolve();
      }
    });
  });
}

/**
 * Calculate the set of excluded repositories (muted + snoozed)
 * @param {Array<string>} mutedRepos - Array of muted repository names
 * @param {Array<Object>} snoozedRepos - Array of snoozed repo objects with 'repo' and 'expiresAt'
 * @returns {Set<string>} Set of excluded repository names
 */
export function getExcludedRepos(mutedRepos = [], snoozedRepos = []) {
  const now = Date.now();
  const activeSnoozedRepos = snoozedRepos
    .filter(s => s.expiresAt > now)
    .map(s => s.repo);

  return new Set([
    ...(mutedRepos || []),
    ...activeSnoozedRepos
  ]);
}

/**
 * Get GitHub token
 * Tries session storage first (decrypted cache), then local storage (encrypted)
 * @returns {Promise<string|null>} Token or null
 */
export async function getToken() {
  // 1. Try session storage first (fast path, decrypted)
  if (isChromeExtension() && chrome.storage.session) {
    const session = await new Promise(resolve => {
      chrome.storage.session.get(['githubToken'], result => resolve(result.githubToken));
    });
    if (session) return session;
  }

  // 2. Try local storage (encrypted)
  const encrypted = await getLocalItem('encryptedGithubToken');
  if (!encrypted) {
    return null;
  }

  // 3. Decrypt and cache in session storage
  const token = await decryptData(encrypted);
  if (token && isChromeExtension() && chrome.storage.session) {
    await new Promise(resolve => {
      chrome.storage.session.set({ githubToken: token }, resolve);
    });
  }

  return token;
}

/**
 * Set GitHub token
 * Encrypts before storing in local storage, caches decrypted in session storage
 * @param {string} token - GitHub token to store
 * @returns {Promise<void>}
 */
export async function setToken(token) {
  if (!token) {
    await clearToken();
    return;
  }

  // 1. Cache in session storage (decrypted)
  if (isChromeExtension() && chrome.storage.session) {
    await new Promise(resolve => {
      chrome.storage.session.set({ githubToken: token }, resolve);
    });
  }

  // 2. Encrypt and store in local storage
  const encrypted = await encryptData(token);
  await setLocalItem('encryptedGithubToken', encrypted);
}

/**
 * Clear GitHub token from all storage
 * @returns {Promise<void>}
 */
export async function clearToken() {
  if (isChromeExtension() && chrome.storage.session) {
    await new Promise(resolve => {
      chrome.storage.session.remove(['githubToken'], resolve);
    });
  }
  await setLocalItem('encryptedGithubToken', null);
}

// Storage configuration objects for batch operations
export const STORAGE_KEYS = {
  SETTINGS: [
    'watchedRepos',
    'lastCheck',
    'filters',
    'notifications',
    'mutedRepos',
    'snoozedRepos',
    'checkInterval',
    'theme',
    'itemExpiryHours'
  ],
  ACTIVITY: [
    'activities',
    'lastCheck',
    'readItems'
  ],
  FILTERING: [
    'mutedRepos',
    'snoozedRepos',
    'pinnedRepos'
  ],
  USER_PREFERENCES: [
    'filters',
    'notifications',
    'checkInterval',
    'theme'
  ]
};

// Default values for storage items
export const STORAGE_DEFAULTS = {
  watchedRepos: [],
  lastCheck: 0,
  filters: {
    pullRequests: true,
    issues: true,
    releases: true,
    pushes: false
  },
  notifications: {
    enabled: true,
    sound: false
  },
  mutedRepos: [],
  snoozedRepos: [],
  checkInterval: 15,
  theme: 'system',
  activities: [],
  readItems: [],
  pinnedRepos: [],
  itemExpiryHours: null // null means disabled, otherwise number of hours
};

/**
 * Get settings with typed return and defaults
 * @returns {Promise<Object>} Settings object with all properties
 */
export async function getSettings() {
  const result = await getSyncItems(STORAGE_KEYS.SETTINGS);

  // Apply defaults for missing properties
  return {
    watchedRepos: result.watchedRepos || STORAGE_DEFAULTS.watchedRepos,
    lastCheck: result.lastCheck || STORAGE_DEFAULTS.lastCheck,
    filters: { ...STORAGE_DEFAULTS.filters, ...result.filters },
    notifications: { ...STORAGE_DEFAULTS.notifications, ...result.notifications },
    mutedRepos: result.mutedRepos || STORAGE_DEFAULTS.mutedRepos,
    snoozedRepos: result.snoozedRepos || STORAGE_DEFAULTS.snoozedRepos,
    checkInterval: result.checkInterval || STORAGE_DEFAULTS.checkInterval,
    theme: result.theme || STORAGE_DEFAULTS.theme,
    itemExpiryHours: result.itemExpiryHours !== undefined ? result.itemExpiryHours : STORAGE_DEFAULTS.itemExpiryHours
  };
}

/**
 * Get filtering settings with defaults
 * @returns {Promise<Object>} Filtering settings
 */
export async function getFilteringSettings() {
  const result = await getSyncItems(STORAGE_KEYS.FILTERING);

  return {
    mutedRepos: result.mutedRepos || STORAGE_DEFAULTS.mutedRepos,
    snoozedRepos: result.snoozedRepos || STORAGE_DEFAULTS.snoozedRepos,
    pinnedRepos: result.pinnedRepos || STORAGE_DEFAULTS.pinnedRepos
  };
}

/**
 * Get user preferences with defaults
 * @returns {Promise<Object>} User preferences
 */
export async function getUserPreferences() {
  const result = await getSyncItems(STORAGE_KEYS.USER_PREFERENCES);

  return {
    filters: { ...STORAGE_DEFAULTS.filters, ...result.filters },
    notifications: { ...STORAGE_DEFAULTS.notifications, ...result.notifications },
    checkInterval: result.checkInterval || STORAGE_DEFAULTS.checkInterval,
    theme: result.theme || STORAGE_DEFAULTS.theme
  };
}

/**
 * Get activity data with defaults
 * @returns {Promise<Object>} Activity data
 */
export async function getActivityData() {
  const result = await getLocalItems(STORAGE_KEYS.ACTIVITY);

  return {
    activities: result.activities || STORAGE_DEFAULTS.activities,
    lastCheck: result.lastCheck || STORAGE_DEFAULTS.lastCheck,
    readItems: result.readItems || STORAGE_DEFAULTS.readItems
  };
}

/**
 * Batch update multiple settings
 * @param {Object} updates - Settings to update
 * @returns {Promise<void>}
 */
export async function updateSettings(updates) {
  await setSyncItem('watchedRepos', updates.watchedRepos);
  await setSyncItem('lastCheck', updates.lastCheck);
  await setSyncItem('filters', updates.filters);
  await setSyncItem('notifications', updates.notifications);
  await setSyncItem('mutedRepos', updates.mutedRepos);
  await setSyncItem('snoozedRepos', updates.snoozedRepos);
  await setSyncItem('checkInterval', updates.checkInterval);
  await setSyncItem('theme', updates.theme);
}
