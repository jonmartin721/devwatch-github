/**
 * Centralized state management for GitHub DevWatch extension
 * Provides consistent state handling across popup, options, and background scripts
 */

import { getActivityData, getSettings, setWatchedRepos, getExcludedRepos } from './storage-helpers.js';
import { STORAGE_DEFAULTS } from './storage-helpers.js';
import { STORAGE_CONFIG } from './config.js';
import { prepareActivitiesForStorage, filterVisibleActivities, countUnreadActivities } from './feed-policy.js';

/**
 * Centralized state manager with reactive updates
 */
class StateManager {
  constructor() {
    this.state = {
      // UI State
      currentFilter: 'all',
      searchQuery: '',
      showArchive: false,

      // Activity State
      allActivities: [],
      readItems: [],

      // Settings State
      watchedRepos: [],
      mutedRepos: [],
      snoozedRepos: [],
      pinnedRepos: [...STORAGE_DEFAULTS.pinnedRepos],
      collapsedRepos: new Set(STORAGE_DEFAULTS.collapsedRepos),
      filters: { ...STORAGE_DEFAULTS.filters },
      notifications: { ...STORAGE_DEFAULTS.notifications },
      checkInterval: STORAGE_DEFAULTS.checkInterval,
      snoozeHours: STORAGE_DEFAULTS.snoozeHours,
      theme: STORAGE_DEFAULTS.theme,
      colorTheme: STORAGE_DEFAULTS.colorTheme,
      itemExpiryHours: STORAGE_DEFAULTS.itemExpiryHours,
      markReadOnSnooze: STORAGE_DEFAULTS.markReadOnSnooze,
      allowUnlimitedRepos: STORAGE_DEFAULTS.allowUnlimitedRepos,

      // Loading/Error State
      isLoading: false,
      error: null
    };

    this.subscribers = new Map();
    this.initialized = false;
    this.initializationLock = null; // Promise-based lock
  }

  /**
   * Initialize state manager with data from storage
   * Uses a promise-based lock to prevent concurrent initialization
   * @returns {Promise<void>}
   */
  async initialize() {
    // If already initialized, return immediately
    if (this.initialized) return;

    // If initialization is in progress, wait for it to complete
    if (this.initializationLock) {
      await this.initializationLock;
      return;
    }

    // Create initialization lock
    this.initializationLock = (async () => {
      try {
        // Double-check initialized flag in case another context just finished
        if (this.initialized) {
          return;
        }

        // Load settings from storage
        const settings = await getSettings();
        const activityData = await getActivityData();

        // Update state with loaded data
        this.state = {
          ...this.state,
          watchedRepos: settings.watchedRepos,
          mutedRepos: settings.mutedRepos || STORAGE_DEFAULTS.mutedRepos,
          snoozedRepos: settings.snoozedRepos || STORAGE_DEFAULTS.snoozedRepos,
          pinnedRepos: settings.pinnedRepos || STORAGE_DEFAULTS.pinnedRepos,
          collapsedRepos: new Set(activityData.collapsedRepos || STORAGE_DEFAULTS.collapsedRepos),
          filters: { ...STORAGE_DEFAULTS.filters, ...settings.filters },
          notifications: { ...STORAGE_DEFAULTS.notifications, ...settings.notifications },
          checkInterval: settings.checkInterval || STORAGE_DEFAULTS.checkInterval,
          snoozeHours: settings.snoozeHours || STORAGE_DEFAULTS.snoozeHours,
          theme: settings.theme || STORAGE_DEFAULTS.theme,
          colorTheme: settings.colorTheme || STORAGE_DEFAULTS.colorTheme,
          itemExpiryHours: settings.itemExpiryHours !== undefined ? settings.itemExpiryHours : STORAGE_DEFAULTS.itemExpiryHours,
          markReadOnSnooze: settings.markReadOnSnooze === true,
          allowUnlimitedRepos: settings.allowUnlimitedRepos === true,
          allActivities: activityData.activities || STORAGE_DEFAULTS.activities,
          readItems: activityData.readItems || STORAGE_DEFAULTS.readItems
        };

        this.initialized = true;
      } catch (error) {
        console.error('[StateManager] Failed to initialize state:', error);
        throw error;
      } finally {
        // Release the lock
        this.initializationLock = null;
      }
    })();

    // Wait for initialization to complete
    await this.initializationLock;
  }

  /**
   * Get current state or specific state property
   * @param {string} [key] - Optional key to get specific property
   * @returns {*} State value or entire state object
   */
  getState(key) {
    if (!this.initialized) {
      return key ? undefined : {};
    }
    return key ? this.state[key] : { ...this.state };
  }

  /**
   * Update state and persist to storage if needed
   * @param {Object|Function} updates - State updates or updater function
   * @param {Object} options - Update options
   * @param {boolean} options.persist - Whether to persist to storage
   * @param {boolean} options.notify - Whether to notify subscribers
   * @returns {Promise<void>}
   */
  async setState(updates, options = {}) {
    const { persist = true, notify = true } = options;

    if (!this.initialized) {
      return;
    }

    const previousState = { ...this.state };

    // Apply updates
    if (typeof updates === 'function') {
      this.state = updates(this.state);
    } else {
      this.state = { ...this.state, ...updates };
    }

    // Persist to storage if needed
    if (persist) {
      await this.persistState(updates);
    }

    // Notify subscribers of changes
    if (notify) {
      this.notifySubscribers(previousState, this.state);
    }
  }

  /**
   * Subscribe to state changes
   * @param {Function} callback - Callback function called on state changes
   * @param {Array<string>} [keys] - Optional array of keys to watch
   * @returns {Function} Unsubscribe function
   */
  subscribe(callback, keys = null) {
    const id = Symbol('subscriber');
    this.subscribers.set(id, { callback, keys });

    return () => {
      this.subscribers.delete(id);
    };
  }

  /**
   * Notify all subscribers of state changes
   * @param {Object} previousState - Previous state
   * @param {Object} currentState - Current state
   */
  notifySubscribers(previousState, currentState) {
    for (const [, { callback, keys }] of this.subscribers) {
      try {
        // Check if any watched keys changed
        const hasChanges = !keys || keys.some(key => previousState[key] !== currentState[key]);

        if (hasChanges) {
          callback(currentState, previousState);
        }
      } catch (error) {
        console.error('[StateManager] Error in subscriber callback:', error);
      }
    }
  }

  /**
   * Persist state changes to Chrome storage
   * @param {Object} updates - Updates to persist
   * @returns {Promise<void>}
   */
  async persistState(updates) {
    const updatesObj = typeof updates === 'function' ? updates(this.state) : updates;
    const persistPromises = [];

    // Persist settings that go to sync storage
    if ('watchedRepos' in updatesObj) {
      persistPromises.push(setWatchedRepos(updatesObj.watchedRepos));
    }

    const syncKeys = [
      'mutedRepos',
      'snoozedRepos',
      'filters',
      'notifications',
      'checkInterval',
      'snoozeHours',
      'theme',
      'colorTheme',
      'itemExpiryHours',
      'markReadOnSnooze',
      'allowUnlimitedRepos'
    ];
    const syncUpdates = {};

    syncKeys.forEach(key => {
      if (key in updatesObj) {
        syncUpdates[key] = updatesObj[key];
      }
    });

    if ('pinnedRepos' in updatesObj) {
      syncUpdates.pinnedRepos = updatesObj.pinnedRepos;
    }

    // Batch all sync updates into a single write operation to avoid quota issues
    if (Object.keys(syncUpdates).length > 0) {
      if (typeof chrome !== 'undefined' && chrome.storage) {
        persistPromises.push(
          new Promise((resolve, reject) => {
            chrome.storage.sync.set(syncUpdates, () => {
              if (chrome.runtime && chrome.runtime.lastError) {
                reject(new Error(chrome.runtime.lastError.message));
              } else {
                resolve();
              }
            });
          })
        );
      }
    }

    // Persist activity data that goes to local storage
    const localKeys = ['allActivities', 'readItems'];
    const localUpdates = {};

    localKeys.forEach(key => {
      if (key in updatesObj) {
        localUpdates[key === 'allActivities' ? 'activities' : key] = updatesObj[key];
      }
    });

    if ('collapsedRepos' in updatesObj) {
      const collapsedRepos = updatesObj.collapsedRepos;
      localUpdates.collapsedRepos = Array.from(collapsedRepos instanceof Set ? collapsedRepos : collapsedRepos || []);
    }

    // Batch all local updates into a single write operation to avoid quota issues
    if (Object.keys(localUpdates).length > 0) {
      if (typeof chrome !== 'undefined' && chrome.storage) {
        persistPromises.push(
          new Promise((resolve, reject) => {
            chrome.storage.local.set(localUpdates, () => {
              if (chrome.runtime && chrome.runtime.lastError) {
                reject(new Error(chrome.runtime.lastError.message));
              } else {
                resolve();
              }
            });
          })
        );
      }
    }

    await Promise.all(persistPromises);
  }

  /**
   * Reset state to defaults
   * @param {Array<string>} [keys] - Optional keys to reset (if not provided, resets all)
   * @returns {Promise<void>}
   */
  async reset(keys = null) {
    const updates = {};

    if (keys) {
      // Reset specific keys
      keys.forEach(key => {
        if (key in STORAGE_DEFAULTS) {
          updates[key] = key === 'collapsedRepos'
            ? new Set(STORAGE_DEFAULTS.collapsedRepos)
            : STORAGE_DEFAULTS[key];
        }
      });
    } else {
      // Reset all to defaults
      Object.assign(updates, STORAGE_DEFAULTS);
      updates.collapsedRepos = new Set(STORAGE_DEFAULTS.collapsedRepos);
    }

    await this.setState(updates);
  }

  /**
   * Add activity to the state
   * @param {Array<Object>} activities - Activities to add
   * @returns {Promise<void>}
   */
  async addActivities(activities) {
    const currentActivities = this.getState('allActivities');
    const excludedRepos = getExcludedRepos(this.getState('mutedRepos'), this.getState('snoozedRepos'));
    const trimmedActivities = prepareActivitiesForStorage(currentActivities, activities, {
      excludedRepos,
      maxStored: STORAGE_CONFIG.MAX_ACTIVITIES_STORED
    });

    await this.setState({ allActivities: trimmedActivities });
  }

  /**
   * Mark activities as read
   * @param {Array<string>} activityIds - Activity IDs to mark as read
   * @returns {Promise<void>}
   */
  async markAsRead(activityIds) {
    const readItems = new Set(this.getState('readItems'));
    activityIds.forEach(id => readItems.add(id));

    await this.setState({ readItems: Array.from(readItems) });
  }

  /**
   * Add repository to watched list
   * @param {string} repo - Repository to add
   * @returns {Promise<void>}
   */
  async addWatchedRepo(repo) {
    const watchedRepos = [...this.getState('watchedRepos')];
    if (!watchedRepos.includes(repo)) {
      watchedRepos.push(repo);
      await this.setState({ watchedRepos });
    }
  }

  /**
   * Remove repository from watched list
   * @param {string} repo - Repository to remove
   * @returns {Promise<void>}
   */
  async removeWatchedRepo(repo) {
    const watchedRepos = this.getState('watchedRepos').filter(r => r !== repo);
    await this.setState({ watchedRepos });
  }

  /**
   * Get filtered activities based on current filters
   * @returns {Array<Object>} Filtered activities
   */
  getFilteredActivities() {
    const {
      allActivities,
      currentFilter,
      searchQuery,
      showArchive,
      readItems,
      mutedRepos,
      snoozedRepos,
      itemExpiryHours
    } = this.state;

    const excludedRepos = getExcludedRepos(mutedRepos, snoozedRepos);

    return filterVisibleActivities(allActivities, {
      excludedRepos,
      itemExpiryHours,
      currentFilter,
      searchQuery,
      showArchive,
      readItems
    });
  }

  /**
   * Get state statistics
   * @returns {Object} State statistics
   */
  getStats() {
    const { allActivities, readItems, watchedRepos, mutedRepos, snoozedRepos, itemExpiryHours } = this.state;
    const excludedRepos = getExcludedRepos(mutedRepos, snoozedRepos);

    return {
      totalActivities: allActivities.length,
      readActivities: readItems.length,
      unreadActivities: countUnreadActivities(allActivities, {
        excludedRepos,
        itemExpiryHours,
        readItems
      }),
      watchedRepositories: watchedRepos.length,
      lastActivity: allActivities[0]?.createdAt || null
    };
  }
}

// Create singleton instance
export const stateManager = new StateManager();

// Export convenience functions for common operations
export const useState = () => stateManager.getState();
export const setState = (updates, options) => stateManager.setState(updates, options);
export const subscribe = (callback, keys) => stateManager.subscribe(callback, keys);
export const addActivities = (activities) => stateManager.addActivities(activities);
export const markAsRead = (activityIds) => stateManager.markAsRead(activityIds);
export const addWatchedRepo = (repo) => stateManager.addWatchedRepo(repo);
export const removeWatchedRepo = (repo) => stateManager.removeWatchedRepo(repo);
export const getFilteredActivities = () => stateManager.getFilteredActivities();
export const getStats = () => stateManager.getStats();
