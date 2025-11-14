/**
 * Chrome storage helper functions with promisified APIs
 */

/**
 * Get an item from chrome.storage.sync with Promise API
 * @param {string} key - Storage key
 * @param {*} defaultValue - Default value if key doesn't exist
 * @returns {Promise<*>} Stored value or default
 */
export function getSyncItem(key, defaultValue = null) {
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
  return new Promise((resolve) => {
    chrome.storage.local.get([key], (result) => {
      resolve(result[key] !== undefined ? result[key] : defaultValue);
    });
  });
}

/**
 * Get multiple items from chrome.storage.sync with Promise API
 * @param {Array<string>} keys - Array of storage keys
 * @returns {Promise<Object>} Object with all keys and values
 */
export function getSyncItems(keys) {
  return new Promise((resolve) => {
    chrome.storage.sync.get(keys, (result) => {
      resolve(result);
    });
  });
}

/**
 * Get multiple items from chrome.storage.local with Promise API
 * @param {Array<string>} keys - Array of storage keys
 * @returns {Promise<Object>} Object with all keys and values
 */
export function getLocalItems(keys) {
  return new Promise((resolve) => {
    chrome.storage.local.get(keys, (result) => {
      resolve(result);
    });
  });
}

/**
 * Set an item in chrome.storage.sync with Promise API
 * @param {string} key - Storage key
 * @param {*} value - Value to store
 * @returns {Promise<void>}
 */
export function setSyncItem(key, value) {
  return new Promise((resolve) => {
    chrome.storage.sync.set({ [key]: value }, resolve);
  });
}

/**
 * Set an item in chrome.storage.local with Promise API
 * @param {string} key - Storage key
 * @param {*} value - Value to store
 * @returns {Promise<void>}
 */
export function setLocalItem(key, value) {
  return new Promise((resolve) => {
    chrome.storage.local.set({ [key]: value }, resolve);
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
 * Get GitHub token from local storage (with migration from sync storage)
 * For security, tokens are stored in local storage (not synced across devices)
 * @returns {Promise<string|null>} Token or null
 */
export async function getToken() {
  // First check local storage
  const localToken = await getLocalItem('githubToken');
  if (localToken) {
    return localToken;
  }

  // Migration: Check sync storage for existing tokens
  const syncToken = await getSyncItem('githubToken');
  if (syncToken) {
    // Migrate to local storage
    await setLocalItem('githubToken', syncToken);
    // Clear from sync storage for security
    await setSyncItem('githubToken', '');
    return syncToken;
  }

  return null;
}

/**
 * Set GitHub token in local storage
 * For security, tokens are stored in local storage (not synced across devices)
 * @param {string} token - GitHub token to store
 * @returns {Promise<void>}
 */
export async function setToken(token) {
  await setLocalItem('githubToken', token);
  // Ensure no token in sync storage
  await setSyncItem('githubToken', '');
}

/**
 * Clear GitHub token from both local and sync storage
 * @returns {Promise<void>}
 */
export async function clearToken() {
  await setLocalItem('githubToken', '');
  await setSyncItem('githubToken', '');
}
