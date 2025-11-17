/**
 * Shared utility functions used across the extension
 */

/**
 * Apply theme based on user preference
 * @param {string} theme - 'light', 'dark', or 'system'
 */
export function applyTheme(theme) {
  if (theme === 'system') {
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    document.body.classList.toggle('dark-mode', prefersDark);
  } else if (theme === 'dark') {
    document.body.classList.add('dark-mode');
  } else {
    document.body.classList.remove('dark-mode');
  }
}


/**
 * Format a date string into a human-readable relative time
 * @param {string} dateString - ISO date string
 * @param {Object} options - Formatting options
 * @param {boolean} options.compact - Use compact format (e.g., "5m ago" vs "5 minutes ago")
 * @param {boolean} options.verbose - Use verbose format (e.g., "today", "yesterday")
 * @param {boolean} options.includeMinutes - Include minutes in output
 * @returns {string} Formatted date
 */
export function formatDate(dateString, options = {}) {
  const {
    verbose = false,
    includeMinutes = true
  } = options;

  const date = new Date(dateString);
  const now = new Date();
  const diffMs = Math.abs(now - date);
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  // Verbose mode (for options page)
  if (verbose) {
    if (diffDays === 0) return 'today';
    if (diffDays === 1) return 'yesterday';
    if (diffDays < 7) return `${diffDays} days ago`;
    if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;
    if (diffDays < 365) return `${Math.floor(diffDays / 30)} months ago`;
    return `${Math.floor(diffDays / 365)} years ago`;
  }

  // Compact mode (for popup - default behavior)
  if (includeMinutes && diffMins < 60) {
    return `${diffMins}m ago`;
  } else if (diffHours < 24) {
    return `${diffHours}h ago`;
  } else if (diffDays < 7) {
    return `${diffDays}d ago`;
  } else {
    return date.toLocaleDateString();
  }
}

/**
 * Legacy compact date formatter (backward compatibility)
 * @param {string} dateString - ISO date string
 * @returns {string} Formatted date (e.g., "5m ago", "2d ago")
 */
export function formatDateCompact(dateString) {
  return formatDate(dateString, { compact: true, includeMinutes: true });
}

/**
 * Verbose date formatter for options page
 * @param {string} dateString - ISO date string
 * @returns {string} Formatted date (e.g., "today", "5 days ago")
 */
export function formatDateVerbose(dateString) {
  return formatDate(dateString, { verbose: true });
}


