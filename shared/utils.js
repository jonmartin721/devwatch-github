/**
 * Shared utility functions used across the extension
 */

const THEME_CACHE_KEY = 'devwatch:theme-preferences';
const DEFAULT_THEME = 'system';
const DEFAULT_COLOR_THEME = 'polar';

function getThemeTargets() {
  if (typeof document === 'undefined') {
    return [];
  }

  return [document.documentElement, document.body].filter(Boolean);
}

function prefersDarkMode() {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return false;
  }

  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

function updateThemeCache(updates) {
  if (typeof localStorage === 'undefined') {
    return;
  }

  let cachedPreferences = {
    theme: DEFAULT_THEME,
    colorTheme: DEFAULT_COLOR_THEME
  };

  try {
    const rawValue = localStorage.getItem(THEME_CACHE_KEY);
    if (rawValue) {
      const parsedValue = JSON.parse(rawValue);
      if (parsedValue && typeof parsedValue === 'object') {
        cachedPreferences = {
          ...cachedPreferences,
          ...parsedValue
        };
      }
    }
  } catch {
    // Ignore invalid cache contents and overwrite with the new values below.
  }

  try {
    localStorage.setItem(THEME_CACHE_KEY, JSON.stringify({
      ...cachedPreferences,
      ...updates
    }));
  } catch {
    // Ignore localStorage write failures. Live theme application still succeeds.
  }
}

/**
 * Apply theme based on user preference
 * @param {string} theme - 'light', 'dark', or 'system'
 */
export function applyTheme(theme) {
  const normalizedTheme = theme || DEFAULT_THEME;
  const useDarkMode = normalizedTheme === 'dark' || (normalizedTheme === 'system' && prefersDarkMode());

  getThemeTargets().forEach((target) => {
    target.classList.toggle('dark-mode', useDarkMode);
  });

  if (typeof document !== 'undefined' && document.documentElement) {
    document.documentElement.style.colorScheme = useDarkMode ? 'dark' : 'light';
  }

  updateThemeCache({ theme: normalizedTheme });
}

/**
 * Apply color theme by setting data attribute on body
 * @param {string} colorTheme - Theme name: 'polar', 'graphite', 'nightfall', 'obsidian', 'sand', 'terminal-ledger'
 */
export function applyColorTheme(colorTheme) {
  const normalizedColorTheme = colorTheme || DEFAULT_COLOR_THEME;

  getThemeTargets().forEach((target) => {
    target.setAttribute('data-color-theme', normalizedColorTheme);
  });

  updateThemeCache({ colorTheme: normalizedColorTheme });
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
 * Verbose date formatter for options page
 * @param {string} dateString - ISO date string
 * @returns {string} Formatted date (e.g., "today", "5 days ago")
 */
export function formatDateVerbose(dateString) {
  return formatDate(dateString, { verbose: true });
}


