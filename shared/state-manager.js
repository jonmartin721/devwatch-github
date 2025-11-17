/**
 * Centralized state management for GitHub DevWatch extension
 * Provides consistent state handling across popup, options, and background scripts
 */

import { getSyncItems, getLocalItems, setSyncItem, setLocalItem } from './storage-helpers.js';
import { STORAGE_KEYS, STORAGE_DEFAULTS } from './storage-helpers.js';

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
      filters: { ...STORAGE_DEFAULTS.filters },
      notifications: { ...STORAGE_DEFAULTS.notifications },
      checkInterval: STORAGE_DEFAULTS.checkInterval,
      theme: STORAGE_DEFAULTS.theme,

      // Loading/Error State
      isLoading: false,
      error: null
    };

    this.subscribers = new Map();
    this.initialized = false;
  }

  /**
   * Initialize state manager with data from storage
   * @returns {Promise<void>}
   */
  async initialize() {
    if (this.initialized) return;

    try {
      // Load settings from storage
      const settings = await getSyncItems(STORAGE_KEYS.SETTINGS);
      const activityData = await getLocalItems(STORAGE_KEYS.ACTIVITY);

      // Update state with loaded data
      this.state = {
        ...this.state,
        watchedRepos: settings.watchedRepos || STORAGE_DEFAULTS.watchedRepos,
        mutedRepos: settings.mutedRepos || STORAGE_DEFAULTS.mutedRepos,
        snoozedRepos: settings.snoozedRepos || STORAGE_DEFAULTS.snoozedRepos,
        filters: { ...STORAGE_DEFAULTS.filters, ...settings.filters },
        notifications: { ...STORAGE_DEFAULTS.notifications, ...settings.notifications },
        checkInterval: settings.checkInterval || STORAGE_DEFAULTS.checkInterval,
        theme: settings.theme || STORAGE_DEFAULTS.theme,
        allActivities: activityData.activities || STORAGE_DEFAULTS.activities,
        readItems: activityData.readItems || STORAGE_DEFAULTS.readItems
      };

      this.initialized = true;
      console.log('[StateManager] State initialized from storage');
    } catch (error) {
      console.error('[StateManager] Failed to initialize state:', error);
      throw error;
    }
  }

  /**
   * Get current state or specific state property
   * @param {string} [key] - Optional key to get specific property
   * @returns {*} State value or entire state object
   */
  getState(key) {
    if (!this.initialized) {
      console.warn('[StateManager] getState called before initialization');
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
      console.warn('[StateManager] setState called before initialization');
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
    const syncKeys = ['watchedRepos', 'mutedRepos', 'snoozedRepos', 'filters', 'notifications', 'checkInterval', 'theme'];
    const syncUpdates = {};

    syncKeys.forEach(key => {
      if (key in updatesObj) {
        syncUpdates[key] = updatesObj[key];
      }
    });

    if (Object.keys(syncUpdates).length > 0) {
      for (const [key, value] of Object.entries(syncUpdates)) {
        persistPromises.push(setSyncItem(key, value));
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

    if (Object.keys(localUpdates).length > 0) {
      for (const [key, value] of Object.entries(localUpdates)) {
        persistPromises.push(setLocalItem(key, value));
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
          updates[key] = STORAGE_DEFAULTS[key];
        }
      });
    } else {
      // Reset all to defaults
      Object.assign(updates, STORAGE_DEFAULTS);
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
    const newActivities = [...activities, ...currentActivities];

    // Keep only the most recent activities
    const maxActivities = 100;
    const trimmedActivities = newActivities.slice(0, maxActivities);

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
      readItems
    } = this.state;

    let filtered = allActivities;

    // Filter by type
    if (currentFilter !== 'all') {
      filtered = filtered.filter(activity => activity.type === currentFilter);
    }

    // Filter by read status
    if (!showArchive) {
      const readSet = new Set(readItems);
      filtered = filtered.filter(activity => !readSet.has(activity.id));
    }

    // Filter by search query
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(activity =>
        activity.title.toLowerCase().includes(query) ||
        activity.description?.toLowerCase().includes(query) ||
        activity.repo.toLowerCase().includes(query)
      );
    }

    return filtered;
  }

  /**
   * Get state statistics
   * @returns {Object} State statistics
   */
  getStats() {
    const { allActivities, readItems, watchedRepos } = this.state;
    const readSet = new Set(readItems);

    return {
      totalActivities: allActivities.length,
      readActivities: readItems.length,
      unreadActivities: allActivities.filter(a => !readSet.has(a.id)).length,
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