/**
 * Security utilities for URL validation and safe tab opening
 * Prevents opening malicious URLs (javascript:, data:, etc.)
 */

/**
 * Validates that a URL is safe to open and points to GitHub
 * @param {string} url - URL to validate
 * @returns {boolean} - True if URL is safe to open
 */
export function isValidGitHubUrl(url) {
  if (!url || typeof url !== 'string') {
    return false;
  }

  try {
    const parsed = new URL(url);

    // Only allow HTTPS protocol (prevents javascript:, data:, file:, etc.)
    if (parsed.protocol !== 'https:') {
      return false;
    }

    // Only allow github.com and its subdomains
    const allowedDomains = ['github.com', 'raw.githubusercontent.com', 'gist.github.com'];
    const isAllowedDomain = allowedDomains.some(domain =>
      parsed.hostname === domain || parsed.hostname.endsWith('.' + domain)
    );

    if (!isAllowedDomain) {
      return false;
    }

    return true;
  } catch {
    // Invalid URL format
    return false;
  }
}

/**
 * Safely opens a URL in a new tab only if it's a valid GitHub URL
 * @param {string} url - URL to open
 * @returns {Promise<boolean>} - True if URL was opened, false if rejected
 */
export async function safelyOpenUrl(url) {
  if (!isValidGitHubUrl(url)) {
    console.warn('Blocked attempt to open non-GitHub URL:', url);
    return false;
  }

  try {
    await chrome.tabs.create({ url });
    return true;
  } catch (error) {
    console.error('Failed to open URL:', error);
    return false;
  }
}

/**
 * Validates that a URL is safe to use in API calls
 * @param {string} url - URL to validate
 * @param {string[]} allowedDomains - List of allowed domains
 * @returns {boolean} - True if URL is safe for API calls
 */
export function isValidApiUrl(url, allowedDomains = ['api.github.com', 'registry.npmjs.org']) {
  if (!url || typeof url !== 'string') {
    return false;
  }

  try {
    const parsed = new URL(url);

    // Only allow HTTPS
    if (parsed.protocol !== 'https:') {
      return false;
    }

    // Check if domain is allowed
    const isAllowed = allowedDomains.some(domain =>
      parsed.hostname === domain || parsed.hostname.endsWith('.' + domain)
    );

    return isAllowed;
  } catch {
    return false;
  }
}
