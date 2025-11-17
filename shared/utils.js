/**
 * Shared utility functions used across the extension
 */

/**
 * Apply theme based on user preference
 * @param {string} theme - 'light', 'dark', or 'system'
 */
export function applyTheme(theme) {
  console.log('🌙 applyTheme called with:', theme);
  console.log('🌙 Body classes before:', document.body.className);

  if (theme === 'system') {
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    document.body.classList.toggle('dark-mode', prefersDark);
    console.log('🌙 System preference dark:', prefersDark);
  } else if (theme === 'dark') {
    document.body.classList.add('dark-mode');
    console.log('🌙 Adding dark-mode class');
  } else {
    document.body.classList.remove('dark-mode');
    console.log('🌙 Removing dark-mode class');
  }

  console.log('🌙 Body classes after:', document.body.className);
  console.log('🌙 Has dark-mode class:', document.body.classList.contains('dark-mode'));
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

/**
 * Show a status message with auto-hide
 * @param {string} elementId - ID of the message element
 * @param {string} text - Message text
 * @param {string} type - Message type ('success' or 'error')
 * @param {number} duration - Duration in ms (default: 3000)
 */
export function showStatusMessage(elementId, text, type = 'success', duration = 3000) {
  const message = document.getElementById(elementId);
  if (!message) return;

  message.textContent = text;
  message.className = `status-message ${type} show`;

  setTimeout(() => {
    message.classList.remove('show');
  }, duration);
}

/**
 * Extract repository name from string or object format
 * @param {string|Object} repo - Repository as string or object with fullName
 * @returns {string} Repository name
 */
export function extractRepoName(repo) {
  return typeof repo === 'string' ? repo : repo.fullName;
}

/**
 * Toggle visibility between two elements
 * @param {HTMLElement} showElement - Element to show
 * @param {HTMLElement} hideElement - Element to hide
 */
export function toggleElementVisibility(showElement, hideElement) {
  if (showElement) showElement.style.display = 'block';
  if (hideElement) hideElement.style.display = 'none';
}

