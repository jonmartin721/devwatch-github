import { STORAGE_CONFIG } from './config.js';

/**
 * Merge and trim activities for storage while preserving incoming order.
 * @param {Array<Object>} existingActivities
 * @param {Array<Object>} newActivities
 * @param {Object} options
 * @param {Set<string>} options.excludedRepos
 * @param {number} options.maxStored
 * @returns {Array<Object>}
 */
export function prepareActivitiesForStorage(
  existingActivities = [],
  newActivities = [],
  {
    excludedRepos = new Set(),
    maxStored = STORAGE_CONFIG.MAX_ACTIVITIES_STORED
  } = {}
) {
  const normalizedExisting = Array.isArray(existingActivities) ? existingActivities : [];
  const normalizedIncoming = Array.isArray(newActivities) ? newActivities : [];
  const seenIds = new Set(normalizedExisting.map(activity => activity.id));

  const uniqueIncoming = normalizedIncoming.filter(activity => {
    if (!activity?.id || seenIds.has(activity.id)) {
      return false;
    }

    seenIds.add(activity.id);
    return true;
  });

  return [...uniqueIncoming, ...normalizedExisting]
    .filter(activity => activity?.repo ? !excludedRepos.has(activity.repo) : true)
    .slice(0, maxStored);
}

/**
 * Apply the shared activity visibility rules used across popup and badge counts.
 * @param {Array<Object>} activities
 * @param {Object} options
 * @param {Set<string>} options.excludedRepos
 * @param {number|null} options.itemExpiryHours
 * @param {string} options.currentFilter
 * @param {string} options.searchQuery
 * @param {boolean} options.showArchive
 * @param {Array<string>} options.readItems
 * @returns {Array<Object>}
 */
export function filterVisibleActivities(
  activities = [],
  {
    excludedRepos = new Set(),
    itemExpiryHours = null,
    currentFilter = 'all',
    searchQuery = '',
    showArchive = false,
    readItems = []
  } = {}
) {
  const readSet = new Set(Array.isArray(readItems) ? readItems : []);
  let filtered = Array.isArray(activities) ? [...activities] : [];

  if (excludedRepos.size > 0) {
    filtered = filtered.filter(activity => !excludedRepos.has(activity.repo));
  }

  if (itemExpiryHours !== null && itemExpiryHours > 0) {
    const expiryThreshold = Date.now() - (itemExpiryHours * 60 * 60 * 1000);
    filtered = filtered.filter(activity => {
      const activityTime = new Date(activity.createdAt).getTime();
      return Number.isFinite(activityTime) && activityTime >= expiryThreshold;
    });
  }

  if (currentFilter !== 'all') {
    filtered = filtered.filter(activity => activity.type === currentFilter);
  }

  filtered = filtered.filter(activity => showArchive ? readSet.has(activity.id) : !readSet.has(activity.id));

  if (searchQuery) {
    const normalizedQuery = searchQuery.toLowerCase();
    filtered = filtered.filter(activity => {
      const title = activity.title?.toLowerCase() || '';
      const description = activity.description?.toLowerCase() || '';
      const repo = activity.repo?.toLowerCase() || '';

      return title.includes(normalizedQuery) ||
        description.includes(normalizedQuery) ||
        repo.includes(normalizedQuery);
    });
  }

  return filtered;
}

/**
 * Count unread activities after applying the shared visibility rules.
 * @param {Array<Object>} activities
 * @param {Object} options
 * @returns {number}
 */
export function countUnreadActivities(activities = [], options = {}) {
  return filterVisibleActivities(activities, {
    ...options,
    currentFilter: 'all',
    searchQuery: '',
    showArchive: false
  }).length;
}
