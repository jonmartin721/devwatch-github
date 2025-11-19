/**
 * Repository validation utilities
 * Simplified validation that focuses on core functionality
 */

import { API_CONFIG, VALIDATION_PATTERNS, ERROR_MESSAGES } from './config.js';
import { createHeaders } from './github-api.js';

/**
 * Validate repository format (owner/repo)
 * @param {string} repo - Repository string to validate
 * @returns {boolean} True if format is valid
 */
export function isValidRepoFormat(repo) {
  return VALIDATION_PATTERNS.REPOSITORY_NAME.test(repo);
}

/**
 * Basic repository validation - checks if repository exists and is accessible
 *
 * This simplified version focuses on the core validation requirement:
 * 1. Verify the repository exists
 * 2. Check accessibility
 * 3. Return basic metadata needed for display
 *
 * @param {string} repo - Repository identifier in format "owner/repo"
 * @param {string} [token] - Optional GitHub token for authentication
 * @returns {Promise<Object>} Validation result
 * @property {boolean} valid - Whether repository is valid
 * @property {Object|null} metadata - Basic repository metadata if valid
 * @property {string} error - Error message if invalid
 */
export async function validateRepository(repo, token = null) {
  // Quick format validation first
  if (!isValidRepoFormat(repo)) {
    return {
      valid: false,
      error: 'Invalid repository format. Use "owner/repo" format.'
    };
  }

  try {
    const headers = token ? createHeaders(token) : {
      'Accept': 'application/vnd.github.v3+json'
    };

    const response = await fetch(`${API_CONFIG.GITHUB_API_BASE}/repos/${repo}`, { headers });

    if (response.ok) {
      const data = await response.json();

      // Return only essential metadata needed for the UI
      return {
        valid: true,
        metadata: {
          fullName: data.full_name,
          name: data.name,
          description: data.description || 'No description provided',
          language: data.language || 'Unknown',
          stars: data.stargazers_count,
          forks: data.forks_count || 0,
          updatedAt: data.updated_at,
          private: data.private,
          archived: data.archived
        }
      };
    }

    // Handle specific error cases
    switch (response.status) {
      case 404:
        return {
          valid: false,
          error: `Repository "${repo}" not found or access denied.`
        };
      case 403: {
        const rateLimitRemaining = response.headers.get('X-RateLimit-Remaining');
        if (rateLimitRemaining === '0') {
          return {
            valid: false,
            error: 'GitHub rate limit exceeded. Please try again later.'
          };
        }
        return {
          valid: false,
          error: `Access denied to repository "${repo}". Check permissions.`
        };
      }
      case 401:
        return {
          valid: false,
          error: 'Authentication failed. Check your GitHub token.'
        };
      default:
        return {
          valid: false,
          error: `GitHub API error (${response.status}): ${response.statusText}`
        };
    }
  } catch (error) {
    if (error.name === 'TypeError' && error.message.includes('fetch')) {
      return {
        valid: false,
        error: ERROR_MESSAGES.NETWORK_ERROR
      };
    }

    return {
      valid: false,
      error: ERROR_MESSAGES.UNKNOWN_ERROR
    };
  }
}

/**
 * Enhanced repository validation with additional metadata (optional)
 * This can be used when more detailed information is needed
 *
 * @param {string} repo - Repository identifier in format "owner/repo"
 * @param {string} [token] - Optional GitHub token for authentication
 * @returns {Promise<Object>} Enhanced validation result with additional metadata
 */
export async function validateRepositoryEnhanced(repo, token = null) {
  const basicValidation = await validateRepository(repo, token);

  if (!basicValidation.valid) {
    return basicValidation;
  }

  try {
    const headers = token ? createHeaders(token) : {
      'Accept': 'application/vnd.github.v3+json'
    };

    // Fetch additional metadata in parallel
    const [releasesResponse, contributorsResponse] = await Promise.allSettled([
      fetch(`${API_CONFIG.GITHUB_API_BASE}/repos/${repo}/releases/latest`, { headers }),
      fetch(`${API_CONFIG.GITHUB_API_BASE}/repos/${repo}/contributors`, { headers })
    ]);

    let latestRelease = null;
    let contributorCount = 0;

    // Process releases
    if (releasesResponse.status === 'fulfilled' && releasesResponse.value.ok) {
      const releaseData = await releasesResponse.value.json();
      latestRelease = {
        tagName: releaseData.tag_name,
        publishedAt: releaseData.published_at
      };
    }

    // Process contributors
    if (contributorsResponse.status === 'fulfilled' && contributorsResponse.value.ok) {
      const contributors = await contributorsResponse.value.json();
      contributorCount = Array.isArray(contributors) ? contributors.length : 0;
    }

    return {
      valid: true,
      metadata: {
        ...basicValidation.metadata,
        latestRelease,
        contributorCount,
        addedAt: new Date().toISOString()
      }
    };
  } catch (error) {
    // If enhanced validation fails, return basic validation result
    return basicValidation;
  }
}

/**
 * Batch validate multiple repositories
 * @param {Array<string>} repos - Array of repository strings
 * @param {string} [token] - Optional GitHub token for authentication
 * @param {Function} [progressCallback] - Optional progress callback
 * @returns {Promise<Array>} Array of validation results
 */
export async function validateRepositories(repos, token = null, progressCallback = null) {
  const results = [];

  for (let i = 0; i < repos.length; i++) {
    const repo = repos[i];
    const result = await validateRepository(repo, token);
    results.push({ repo, ...result });

    if (progressCallback) {
      progressCallback(i + 1, repos.length, repo, result);
    }

    // Add small delay to avoid rate limiting
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  return results;
}

/**
 * Quick validation for repository search/autocomplete
 * Only validates format, doesn't make API calls
 * @param {string} repo - Repository string to validate
 * @returns {Object} Quick validation result
 */
export function quickValidateRepo(repo) {
  if (!repo || typeof repo !== 'string') {
    return {
      valid: false,
      error: 'Repository name is required'
    };
  }

  const trimmedRepo = repo.trim();
  if (trimmedRepo !== repo) {
    return {
      valid: false,
      error: 'Repository name cannot have leading/trailing spaces'
    };
  }

  if (!isValidRepoFormat(trimmedRepo)) {
    return {
      valid: false,
      error: 'Invalid format. Use "owner/repo" format (e.g., "microsoft/vscode")'
    };
  }

  return {
    valid: true,
    normalized: trimmedRepo
  };
}