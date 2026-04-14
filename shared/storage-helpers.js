/**
 * Chrome storage helper functions with promisified APIs
 */

import {
  SETTINGS_SYNC_KEYS,
  getDefaultSettings,
  normalizeSettings,
  pickSyncSettings
} from './settings-schema.js';
import { normalizeWatchedRepos } from './repo-service.js';

const AUTH_SESSION_CACHE_KEY = 'githubAuthSession';
const LEGACY_AUTH_STORAGE_KEYS = ['encryptedGithubAuthSession', 'encryptionKey'];
const WATCHED_REPOS_STORAGE_KEY = 'watchedRepos';
let legacyAuthStorageChecked = false;

/**
 * Check if running in Chrome extension context
 * @returns {boolean} True if Chrome APIs are available
 */
function isChromeExtension() {
  return typeof chrome !== 'undefined' && chrome.storage !== undefined;
}

function clearLegacyAuthStorage(force = false) {
  if (!isChromeExtension()) {
    return Promise.resolve();
  }

  if (legacyAuthStorageChecked && !force) {
    return Promise.resolve();
  }

  if (!chrome.storage.local?.remove) {
    legacyAuthStorageChecked = true;
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    chrome.storage.local.remove(LEGACY_AUTH_STORAGE_KEYS, () => {
      legacyAuthStorageChecked = true;
      resolve();
    });
  });
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

function clearLegacySyncWatchedRepos() {
  if (!isChromeExtension()) {
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    chrome.storage.sync.remove([WATCHED_REPOS_STORAGE_KEY], () => {
      resolve();
    });
  });
}

/**
 * Get watched repositories from local storage, with a sync-storage fallback for legacy installs.
 * @returns {Promise<Array>} Watched repository records
 */
export async function getWatchedRepos() {
  const localRepos = await getLocalItem(WATCHED_REPOS_STORAGE_KEY, null);
  if (Array.isArray(localRepos)) {
    return normalizeWatchedRepos(localRepos);
  }

  const legacyRepos = await getSyncItem(WATCHED_REPOS_STORAGE_KEY, STORAGE_DEFAULTS.watchedRepos);

  if (Array.isArray(legacyRepos) && legacyRepos.length > 0) {
    const normalizedLegacyRepos = normalizeWatchedRepos(legacyRepos);
    await setLocalItem(WATCHED_REPOS_STORAGE_KEY, normalizedLegacyRepos);
    await clearLegacySyncWatchedRepos();
    return normalizedLegacyRepos;
  }

  return STORAGE_DEFAULTS.watchedRepos;
}

/**
 * Persist watched repositories in local storage so larger repo lists do not hit sync item quotas.
 * @param {Array} watchedRepos - Repository records to store
 * @returns {Promise<void>}
 */
export async function setWatchedRepos(watchedRepos = []) {
  const normalizedRepos = normalizeWatchedRepos(watchedRepos);
  await setLocalItem(WATCHED_REPOS_STORAGE_KEY, normalizedRepos);
  await clearLegacySyncWatchedRepos();
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
 * Get the stored GitHub auth session
 * Auth sessions are kept in session storage only so they do not persist to disk.
 * Legacy encrypted local storage is cleared opportunistically on access.
 * @returns {Promise<Object|null>} Auth session or null
 */
export async function getAuthSession() {
  if (isChromeExtension() && chrome.storage.session) {
    const cachedSession = await new Promise(resolve => {
      chrome.storage.session.get([AUTH_SESSION_CACHE_KEY], result => resolve(result[AUTH_SESSION_CACHE_KEY]));
    });

    if (cachedSession && typeof cachedSession === 'object') {
      await clearLegacyAuthStorage();
      return cachedSession;
    }
  }

  await clearLegacyAuthStorage();
  return null;
}

/**
 * Persist a GitHub auth session
 * @param {Object|null} session - Auth session to store
 * @returns {Promise<void>}
 */
export async function setAuthSession(session) {
  if (!session || typeof session !== 'object' || !session.accessToken) {
    await clearAuthSession();
    return;
  }

  if (!isChromeExtension() || !chrome.storage.session) {
    throw new Error('Session storage is unavailable for GitHub sign-in.');
  }

  await new Promise(resolve => {
    chrome.storage.session.set({ [AUTH_SESSION_CACHE_KEY]: session }, resolve);
  });
  await clearLegacyAuthStorage(true);
}

/**
 * Clear the stored GitHub auth session
 * @returns {Promise<void>}
 */
export async function clearAuthSession() {
  if (isChromeExtension() && chrome.storage.session) {
    await new Promise(resolve => {
      chrome.storage.session.remove([AUTH_SESSION_CACHE_KEY], resolve);
    });
  }

  await clearLegacyAuthStorage(true);
}

/**
 * Get the access token used for GitHub API requests
 * Prefers the OAuth auth session when present.
 * @returns {Promise<string|null>} Access token or null
 */
export async function getAccessToken() {
  const authSession = await getAuthSession();
  if (authSession?.accessToken) {
    return authSession.accessToken;
  }

  return null;
}

// Storage configuration objects for batch operations
export const STORAGE_KEYS = {
  SETTINGS: [
    'watchedRepos',
    'lastCheck',
    ...SETTINGS_SYNC_KEYS
  ],
  ACTIVITY: [
    'activities',
    'lastCheck',
    'readItems',
    'collapsedRepos'
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
    'theme',
    'colorTheme'
  ]
};

// Default values for storage items
export const STORAGE_DEFAULTS = {
  watchedRepos: [],
  lastCheck: 0,
  ...getDefaultSettings(),
  activities: [],
  readItems: [],
  collapsedRepos: [],
  itemExpiryHours: null // null means disabled, otherwise number of hours
};

/**
 * Get settings with typed return and defaults
 * @returns {Promise<Object>} Settings object with all properties
 */
export async function getSettings() {
  const result = await getSyncItems(STORAGE_KEYS.SETTINGS);
  const watchedRepos = await getWatchedRepos();
  const normalizedSettings = normalizeSettings(result);

  return {
    watchedRepos,
    lastCheck: result.lastCheck || STORAGE_DEFAULTS.lastCheck,
    ...normalizedSettings
  };
}

/**
 * Get filtering settings with defaults
 * @returns {Promise<Object>} Filtering settings
 */
export async function getFilteringSettings() {
  const result = await getSyncItems(STORAGE_KEYS.FILTERING);
  const normalized = normalizeSettings(result);

  return {
    mutedRepos: normalized.mutedRepos,
    snoozedRepos: normalized.snoozedRepos,
    pinnedRepos: normalized.pinnedRepos
  };
}

/**
 * Get user preferences with defaults
 * @returns {Promise<Object>} User preferences
 */
export async function getUserPreferences() {
  const result = await getSyncItems(STORAGE_KEYS.USER_PREFERENCES);
  const normalized = normalizeSettings(result);

  return {
    filters: normalized.filters,
    notifications: normalized.notifications,
    checkInterval: normalized.checkInterval,
    theme: normalized.theme,
    colorTheme: normalized.colorTheme
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
    readItems: result.readItems || STORAGE_DEFAULTS.readItems,
    collapsedRepos: result.collapsedRepos || STORAGE_DEFAULTS.collapsedRepos
  };
}

/**
 * Batch update multiple settings
 * @param {Object} updates - Settings to update
 * @returns {Promise<void>}
 */
export async function updateSettings(updates) {
  if ('watchedRepos' in updates) {
    await setWatchedRepos(updates.watchedRepos);
  }

  if ('lastCheck' in updates) {
    await setSyncItem('lastCheck', updates.lastCheck);
  }

  const syncSettings = pickSyncSettings(updates);
  const syncKeys = Object.keys(syncSettings);

  for (const key of syncKeys) {
    await setSyncItem(key, syncSettings[key]);
  }
}
