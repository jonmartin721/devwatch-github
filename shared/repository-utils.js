/**
 * Repository utility functions for consistent repository data handling
 */

/**
 * Extract repository name from object format
 * @param {Object} repo - Repository object with fullName
 * @returns {string} Repository name (full name in format "owner/repo")
 */
export function extractRepoName(repo) {
  if (!repo) {
    console.warn('[extractRepoName] Invalid repo: null or undefined');
    return '';
  }

  if (typeof repo === 'object' && repo.fullName) {
    return repo.fullName;
  }

  console.warn('[extractRepoName] Invalid repo format:', repo);
  return '';
}

/**
 * Extract repository owner from object format
 * @param {Object} repo - Repository object with owner or fullName
 * @returns {string} Repository owner name
 */
export function extractRepoOwner(repo) {
  return repo.owner || repo.fullName?.split('/')[0] || '';
}

/**
 * Extract repository name without owner from object format
 * @param {Object} repo - Repository object with name or fullName
 * @returns {string} Repository name without owner
 */
export function extractRepoShortName(repo) {
  return repo.name || repo.fullName?.split('/')[1] || '';
}

/**
 * Validate repository object format
 * @param {Object} repo - Repository object to validate
 * @returns {boolean} True if valid format
 */
export function validateRepoFormat(repo) {
  if (typeof repo === 'object' && repo !== null) {
    return !!(repo.fullName && /^[^/]+\/[^/]+$/.test(repo.fullName));
  }
  return false;
}

/**
 * Normalize repository data to ensure all required fields
 * @param {Object} repo - Repository object
 * @returns {Object} Normalized repository object
 */
export function normalizeRepo(repo) {
  return {
    fullName: repo.fullName,
    owner: repo.owner || extractRepoOwner(repo),
    name: repo.name || extractRepoShortName(repo)
  };
}

/**
 * Check if two repositories refer to the same repository
 * @param {Object} repo1 - First repository object
 * @param {Object} repo2 - Second repository object
 * @returns {boolean} True if they refer to the same repository
 */
export function isSameRepo(repo1, repo2) {
  const name1 = extractRepoName(repo1);
  const name2 = extractRepoName(repo2);
  return name1 === name2;
}

/**
 * Filter out duplicate repositories from an array
 * @param {Array<Object>} repos - Array of repository objects
 * @returns {Array<Object>} Array with unique repositories
 */
export function dedupeRepos(repos) {
  // Validate input is an array
  if (!Array.isArray(repos)) {
    console.warn('[dedupeRepos] Expected array, received:', typeof repos);
    return [];
  }

  const seen = new Set();
  return repos.filter(repo => {
    const name = extractRepoName(repo);

    // Skip invalid repos (extractRepoName returns empty string for invalid)
    if (!name) {
      return false;
    }

    if (seen.has(name)) {
      return false;
    }
    seen.add(name);
    return true;
  });
}

/**
 * Filter activities by excluded repositories
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
 * Sort repositories by name
 * @param {Array<Object>} repos - Array of repository objects
 * @returns {Array<Object>} Sorted array
 */
export function sortReposByName(repos) {
  return [...repos].sort((a, b) => {
    const nameA = extractRepoName(a);
    const nameB = extractRepoName(b);
    return nameA.localeCompare(nameB);
  });
}