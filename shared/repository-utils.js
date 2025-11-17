/**
 * Repository utility functions for consistent repository data handling
 */

/**
 * Extract repository name from string or object format
 * @param {string|Object} repo - Repository as string or object with fullName
 * @returns {string} Repository name (full name in format "owner/repo")
 */
export function extractRepoName(repo) {
  return typeof repo === 'string' ? repo : repo.fullName;
}

/**
 * Extract repository owner from string or object format
 * @param {string|Object} repo - Repository as string or object with owner or fullName
 * @returns {string} Repository owner name
 */
export function extractRepoOwner(repo) {
  if (typeof repo === 'string') {
    return repo.split('/')[0];
  }
  return repo.owner || repo.fullName?.split('/')[0];
}

/**
 * Extract repository name without owner from string or object format
 * @param {string|Object} repo - Repository as string or object with name or fullName
 * @returns {string} Repository name without owner
 */
export function extractRepoShortName(repo) {
  if (typeof repo === 'string') {
    return repo.split('/')[1];
  }
  return repo.name || repo.fullName?.split('/')[1];
}

/**
 * Validate repository format (string or object)
 * @param {string|Object} repo - Repository to validate
 * @returns {boolean} True if valid format
 */
export function validateRepoFormat(repo) {
  if (typeof repo === 'string') {
    return /^[^/]+\/[^/]+$/.test(repo);
  }
  if (typeof repo === 'object' && repo !== null) {
    return !!(repo.fullName && /^[^/]+\/[^/]+$/.test(repo.fullName));
  }
  return false;
}

/**
 * Normalize repository data to consistent object format
 * @param {string|Object} repo - Repository as string or object
 * @returns {Object} Normalized repository object
 */
export function normalizeRepo(repo) {
  if (typeof repo === 'string') {
    const [owner, name] = repo.split('/');
    return {
      fullName: repo,
      owner: owner,
      name: name
    };
  }

  return {
    fullName: repo.fullName,
    owner: repo.owner || extractRepoOwner(repo),
    name: repo.name || extractRepoShortName(repo)
  };
}

/**
 * Check if two repositories refer to the same repository
 * @param {string|Object} repo1 - First repository
 * @param {string|Object} repo2 - Second repository
 * @returns {boolean} True if they refer to the same repository
 */
export function isSameRepo(repo1, repo2) {
  const name1 = extractRepoName(repo1);
  const name2 = extractRepoName(repo2);
  return name1 === name2;
}

/**
 * Filter out duplicate repositories from an array
 * @param {Array<string|Object>} repos - Array of repositories
 * @returns {Array<string|Object>} Array with unique repositories
 */
export function dedupeRepos(repos) {
  const seen = new Set();
  return repos.filter(repo => {
    const name = extractRepoName(repo);
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
 * @param {Array<string|Object>} repos - Array of repositories
 * @returns {Array<string|Object>} Sorted array
 */
export function sortReposByName(repos) {
  return [...repos].sort((a, b) => {
    const nameA = extractRepoName(a);
    const nameB = extractRepoName(b);
    return nameA.localeCompare(nameB);
  });
}