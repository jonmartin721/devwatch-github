/**
 * HTML sanitization utilities to prevent XSS attacks
 * All user-generated content from external sources (GitHub API, NPM, etc.)
 * should be sanitized before being inserted into the DOM.
 */

/**
 * Escapes HTML special characters to prevent XSS
 * @param {string} unsafe - Unsafe string that may contain HTML/JavaScript
 * @returns {string} - Safely escaped string
 */
export function escapeHtml(unsafe) {
  if (typeof unsafe !== 'string') {
    return '';
  }

  return unsafe
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Validates and sanitizes a URL for use in src attributes (e.g., images)
 * Only allows HTTPS URLs from trusted domains
 * @param {string} url - URL to validate
 * @param {string[]} allowedDomains - List of allowed domains (e.g., ['githubusercontent.com', 'github.com'])
 * @returns {string} - Sanitized URL or empty string if invalid
 */
export function sanitizeImageUrl(url, allowedDomains = ['githubusercontent.com', 'github.com', 'avatars.githubusercontent.com']) {
  if (!url || typeof url !== 'string') {
    return '';
  }

  try {
    const parsed = new URL(url);

    // Only allow HTTPS protocol
    if (parsed.protocol !== 'https:') {
      return '';
    }

    // Check if domain is in allowed list
    const isAllowed = allowedDomains.some(domain =>
      parsed.hostname === domain || parsed.hostname.endsWith('.' + domain)
    );

    if (!isAllowed) {
      return '';
    }

    return parsed.href;
  } catch {
    // Invalid URL
    return '';
  }
}

/**
 * Sanitizes an object's properties for safe HTML insertion
 * @param {Object} obj - Object with properties to sanitize
 * @param {string[]} fields - Array of field names to sanitize
 * @returns {Object} - New object with sanitized fields
 */
export function sanitizeObject(obj, fields) {
  const sanitized = { ...obj };

  for (const field of fields) {
    if (field in sanitized) {
      sanitized[field] = escapeHtml(sanitized[field]);
    }
  }

  return sanitized;
}

/**
 * Sanitizes activity data from GitHub API
 * @param {Object} activity - Activity object
 * @returns {Object} - Sanitized activity object
 */
export function sanitizeActivity(activity) {
  return {
    ...activity,
    title: escapeHtml(activity.title),
    author: escapeHtml(activity.author),
    repo: escapeHtml(activity.repo),
    authorAvatar: sanitizeImageUrl(activity.authorAvatar),
    // Keep original URL for validation in click handler
    url: activity.url
  };
}

/**
 * Sanitizes repository data from GitHub API
 * @param {Object} repo - Repository object
 * @returns {Object} - Sanitized repository object
 */
export function sanitizeRepository(repo) {
  return {
    ...repo,
    fullName: escapeHtml(repo.fullName || ''),
    owner: escapeHtml(repo.owner || ''),
    name: escapeHtml(repo.name || ''),
    description: escapeHtml(repo.description || ''),
    language: escapeHtml(repo.language || ''),
    // Keep original URL for validation
    url: repo.url
  };
}
