/**
 * GitHub API helper functions
 */

/**
 * Create standard GitHub API headers
 * @param {string} token - GitHub personal access token
 * @returns {Object} Headers object for fetch
 */
export function createHeaders(token) {
  return {
    'Authorization': `token ${token}`,
    'Accept': 'application/vnd.github.v3+json'
  };
}

/**
 * Handle GitHub API response errors
 * @param {Response} response - Fetch response object
 * @param {string} repo - Repository name for error context
 * @throws {Error} Descriptive error based on response status with attached response
 */
export function handleApiResponse(response, repo = '') {
  if (!response.ok) {
    let error;
    if (response.status === 401) {
      error = new Error('Invalid GitHub token');
    } else if (response.status === 403) {
      error = new Error('Rate limit exceeded');
    } else if (response.status === 404) {
      error = new Error(repo ? `Repository ${repo} not found` : 'Resource not found');
    } else {
      error = new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    // Attach response for detailed error handling
    error.response = response;
    error.repo = repo;
    throw error;
  }
}

/**
 * Map GitHub API activity item to standardized format
 * @param {Object} item - Raw API response item
 * @param {string} type - Activity type ('pr', 'issue', 'release')
 * @param {string} repo - Repository name
 * @returns {Object} Standardized activity object
 */
export function mapActivity(item, type, repo) {
  // Defensive null checks
  if (!item) {
    throw new Error('Invalid activity item: null or undefined');
  }

  if (!type || !repo) {
    throw new Error('Invalid activity mapping: type and repo are required');
  }

  // Generate unique ID, handling cases where number or id might be 0 or undefined
  let uniqueId;
  if (item.number !== undefined && item.number !== null) {
    uniqueId = item.number;
  } else if (item.id !== undefined && item.id !== null) {
    uniqueId = item.id;
  } else {
    // Fallback to timestamp-based ID if neither exists
    uniqueId = Date.now() + Math.random().toString(36).substring(7);
  }

  const baseActivity = {
    id: `${type}-${repo}-${uniqueId}`,
    type,
    repo,
    title: '',
    url: item.html_url || '',
    createdAt: '',
    author: '',
    authorAvatar: ''
  };

  try {
    switch (type) {
      case 'pr':
      case 'issue':
        return {
          ...baseActivity,
          title: item.title || 'Untitled',
          createdAt: item.created_at || new Date().toISOString(),
          author: item.user?.login || 'Unknown',
          authorAvatar: item.user?.avatar_url || '',
          number: item.number
        };

      case 'release':
        return {
          ...baseActivity,
          title: item.name || item.tag_name || 'Untitled Release',
          createdAt: item.published_at || new Date().toISOString(),
          author: item.author?.login || 'Unknown',
          authorAvatar: item.author?.avatar_url || ''
        };

      default:
        return baseActivity;
    }
  } catch (error) {
    console.error('Error mapping activity:', error, item);
    // Return base activity as fallback
    return baseActivity;
  }
}

/**
 * Filter activities based on date threshold
 * @param {Array} items - Array of activity items
 * @param {Date} since - Date to filter from
 * @param {string} dateField - Field name containing the date (default: 'created_at')
 * @returns {Array} Filtered items
 */
export function filterActivitiesByDate(items, since, dateField = 'created_at') {
  // Validate inputs
  if (!Array.isArray(items)) {
    console.warn('[filterActivitiesByDate] Expected array, received:', typeof items);
    return [];
  }

  if (!(since instanceof Date) || isNaN(since.getTime())) {
    console.warn('[filterActivitiesByDate] Invalid date provided:', since);
    return items; // Return all items if date is invalid
  }

  return items.filter(item => {
    // Validate item exists and has the date field
    if (!item || !item[dateField]) {
      return false;
    }

    // Parse and validate the date
    const itemDate = new Date(item[dateField]);
    if (isNaN(itemDate.getTime())) {
      console.warn(`[filterActivitiesByDate] Invalid date in item[${dateField}]:`, item[dateField]);
      return false;
    }

    return itemDate > since;
  });
}
