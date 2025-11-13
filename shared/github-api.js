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
 * @throws {Error} Descriptive error based on response status
 */
export function handleApiResponse(response, repo = '') {
  if (!response.ok) {
    if (response.status === 401) {
      throw new Error('Invalid GitHub token');
    } else if (response.status === 403) {
      throw new Error('Rate limit exceeded');
    } else if (response.status === 404) {
      throw new Error(repo ? `Repository ${repo} not found` : 'Resource not found');
    } else {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
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
  const baseActivity = {
    id: `${type}-${repo}-${item.number || item.id}`,
    type,
    repo,
    title: '',
    url: item.html_url,
    createdAt: '',
    author: '',
    authorAvatar: ''
  };

  switch (type) {
    case 'pr':
    case 'issue':
      return {
        ...baseActivity,
        title: item.title,
        createdAt: item.created_at,
        author: item.user.login,
        authorAvatar: item.user.avatar_url,
        number: item.number
      };

    case 'release':
      return {
        ...baseActivity,
        title: item.name || item.tag_name,
        createdAt: item.published_at,
        author: item.author.login,
        authorAvatar: item.author.avatar_url
      };

    default:
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
  return items.filter(item => new Date(item[dateField]) > since);
}
