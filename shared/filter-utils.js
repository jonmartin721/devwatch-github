/**
 * Centralized filtering utilities for activities and repositories
 */


/**
 * Get currently snoozed repositories (not expired)
 * @param {Array<Object>} snoozedRepos - Array of snoozed repo objects
 * @returns {Array<string>} Array of active snoozed repository names
 */
export function getActiveSnoozedRepos(snoozedRepos = []) {
  const now = Date.now();
  return snoozedRepos
    .filter(snooze => snooze.expiresAt > now)
    .map(snooze => snooze.repo);
}

/**
 * Filter activities by repository exclusions
 * @param {Array<Object>} activities - Array of activity objects
 * @param {Set<string>} excludedRepos - Set of excluded repository names
 * @returns {Array<Object>} Filtered activities
 */
export function filterActivitiesByRepos(activities, excludedRepos) {
  if (!excludedRepos || excludedRepos.size === 0) {
    return activities;
  }
  return activities.filter(activity => !excludedRepos.has(activity.repo));
}

/**
 * Filter activities by type based on user filters
 * @param {Array<Object>} activities - Array of activity objects
 * @param {Object} filters - User filter preferences
 * @returns {Array<Object>} Filtered activities
 */
export function filterActivitiesByType(activities, filters) {
  if (!filters) return activities;

  return activities.filter(activity => {
    switch (activity.type) {
      case 'PullRequestEvent':
        return filters.pullRequests !== false;
      case 'IssuesEvent':
      case 'IssueCommentEvent':
        return filters.issues !== false;
      case 'ReleaseEvent':
        return filters.releases !== false;
      case 'PushEvent':
        return filters.pushes === true;
      default:
        return true; // Include unknown types by default
    }
  });
}

/**
 * Filter out read activities
 * @param {Array<Object>} activities - Array of activity objects
 * @param {Set<string>} readItems - Set of read activity IDs
 * @returns {Array<Object>} Filtered activities (unread only)
 */
export function filterUnreadActivities(activities, readItems) {
  if (!readItems || readItems.size === 0) {
    return activities;
  }
  return activities.filter(activity => !readItems.has(activity.id));
}

/**
 * Apply all filters to activities (repos, type, read status)
 * @param {Array<Object>} activities - Array of activity objects
 * @param {Object} options - Filtering options
 * @param {Set<string>} options.excludedRepos - Excluded repositories
 * @param {Object} options.filters - Type filters
 * @param {Set<string>} options.readItems - Read activity IDs
 * @param {boolean} options.includeRead - Whether to include read items
 * @returns {Array<Object>} Filtered activities
 */
export function applyAllFilters(activities, {
  excludedRepos = new Set(),
  filters = {},
  readItems = new Set(),
  includeRead = true
} = {}) {
  let filtered = activities;

  // Filter by excluded repositories
  filtered = filterActivitiesByRepos(filtered, excludedRepos);

  // Filter by activity type
  filtered = filterActivitiesByType(filtered, filters);

  // Filter by read status (if exclude read)
  if (!includeRead) {
    filtered = filterUnreadActivities(filtered, readItems);
  }

  return filtered;
}

/**
 * Get activity statistics grouped by repository
 * @param {Array<Object>} activities - Array of activity objects
 * @returns {Map<string, Object>} Map of repo name to stats object
 */
export function getActivityStatsByRepo(activities) {
  const stats = new Map();

  activities.forEach(activity => {
    const repo = activity.repo;
    if (!stats.has(repo)) {
      stats.set(repo, {
        total: 0,
        pullRequests: 0,
        issues: 0,
        releases: 0,
        pushes: 0,
        other: 0,
        latest: null
      });
    }

    const repoStats = stats.get(repo);
    repoStats.total++;

    // Update type-specific counts
    switch (activity.type) {
      case 'PullRequestEvent':
        repoStats.pullRequests++;
        break;
      case 'IssuesEvent':
      case 'IssueCommentEvent':
        repoStats.issues++;
        break;
      case 'ReleaseEvent':
        repoStats.releases++;
        break;
      case 'PushEvent':
        repoStats.pushes++;
        break;
      default:
        repoStats.other++;
    }

    // Update latest activity timestamp
    if (!repoStats.latest || new Date(activity.createdAt) > new Date(repoStats.latest)) {
      repoStats.latest = activity.createdAt;
    }
  });

  return stats;
}

/**
 * Sort activities by date (newest first)
 * @param {Array<Object>} activities - Array of activity objects
 * @returns {Array<Object>} Sorted activities
 */
export function sortActivitiesByDate(activities) {
  return [...activities].sort((a, b) => {
    return new Date(b.createdAt) - new Date(a.createdAt);
  });
}

/**
 * Group activities by repository
 * @param {Array<Object>} activities - Array of activity objects
 * @returns {Map<string, Array<Object>>} Map of repo name to activities
 */
export function groupActivitiesByRepo(activities) {
  const grouped = new Map();

  activities.forEach(activity => {
    const repo = activity.repo;
    if (!grouped.has(repo)) {
      grouped.set(repo, []);
    }
    grouped.get(repo).push(activity);
  });

  // Sort activities within each repo by date
  grouped.forEach(activities => {
    sortActivitiesByDate(activities);
  });

  return grouped;
}

/**
 * Filter repositories to exclude private/archived ones if user prefers
 * @param {Array<Object>} repos - Array of repository objects
 * @param {Object} preferences - User preferences
 * @returns {Array<Object>} Filtered repositories
 */
export function filterReposByPreferences(repos, preferences = {}) {
  return repos.filter(repo => {
    // Filter out private repos if user prefers public only
    if (preferences.publicOnly && repo.private) {
      return false;
    }

    // Filter out archived repos if user prefers active only
    if (preferences.activeOnly && repo.archived) {
      return false;
    }

    return true;
  });
}

/**
 * Get priority repositories (pinned + recently active)
 * @param {Array<string>} pinnedRepos - Array of pinned repository names
 * @param {Array<Object>} activities - Array of recent activities
 * @param {number} daysBack - How many days to consider for recent activity
 * @returns {Set<string>} Set of priority repository names
 */
export function getPriorityRepos(pinnedRepos = [], activities = [], daysBack = 7) {
  const priority = new Set(pinnedRepos);

  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - daysBack);

  activities.forEach(activity => {
    if (new Date(activity.createdAt) > cutoffDate) {
      priority.add(activity.repo);
    }
  });

  return priority;
}