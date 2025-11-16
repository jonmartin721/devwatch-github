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
 * Apply font size based on user preference
 * @param {string} fontSize - 'small', 'medium', 'large', or 'xlarge'
 */
export function applyFontSize(fontSize) {
  const root = document.documentElement;

  // Remove any existing font size class
  root.classList.remove('font-size-small', 'font-size-medium', 'font-size-large', 'font-size-xlarge');

  // Add the new font size class
  root.classList.add(`font-size-${fontSize}`);

  // Set CSS variables for the font sizes
  const fontSizes = {
    small: {
      base: '13px',
      small: '11px',
      smaller: '10px',
      large: '15px',
      larger: '17px'
    },
    medium: {
      base: '15px',
      small: '13px',
      smaller: '12px',
      large: '17px',
      larger: '19px'
    },
    large: {
      base: '17px',
      small: '15px',
      smaller: '14px',
      large: '19px',
      larger: '21px'
    },
    xlarge: {
      base: '19px',
      small: '17px',
      smaller: '16px',
      large: '21px',
      larger: '23px'
    }
  };

  const sizes = fontSizes[fontSize] || fontSizes.medium;
  root.style.setProperty('--font-size-base', sizes.base);
  root.style.setProperty('--font-size-small', sizes.small);
  root.style.setProperty('--font-size-smaller', sizes.smaller);
  root.style.setProperty('--font-size-large', sizes.large);
  root.style.setProperty('--font-size-larger', sizes.larger);
}

/**
 * Format a date string into a human-readable relative time
 * @param {string} dateString - ISO date string
 * @returns {string} Formatted date (e.g., "5m ago", "2d ago")
 */
export function formatDate(dateString) {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now - date;
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 60) {
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

