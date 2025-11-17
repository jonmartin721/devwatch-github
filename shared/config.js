/**
 * Centralized configuration for GitHub DevWatch extension
 * Extracts hardcoded values to improve maintainability
 */

// API Configuration
export const API_CONFIG = {
  GITHUB_API_BASE: 'https://api.github.com',
  GITHUB_WEB_BASE: 'https://github.com',
  RATE_LIMIT_HEADERS: {
    REMAINING: 'X-RateLimit-Remaining',
    LIMIT: 'X-RateLimit-Limit',
    RESET: 'X-RateLimit-Reset'
  },
  DEFAULT_PAGE_SIZE: 30,
  MAX_REPOS_PER_REQUEST: 100
};

// Rate Limiting Configuration
export const RATE_LIMIT_CONFIG = {
  DEFAULT_CHECK_INTERVAL: 15, // minutes
  MIN_CHECK_INTERVAL: 5, // minutes
  MAX_CHECK_INTERVAL: 1440, // 24 hours
  RATE_LIMIT_BUFFER: 100, // keep buffer for safety
  WARNING_THRESHOLD: 100 // remaining requests before warning
};

// Storage Configuration
export const STORAGE_CONFIG = {
  MAX_WATCHED_REPOS: 50,
  MAX_ACTIVITIES_STORED: 100,
  MAX_STORAGE_SIZE: 1024 * 1024, // 1MB
  CLEANUP_DAYS: 30, // days to keep old data
  STORAGE_QUOTA_CHECK_INTERVAL: 10000 // 10 seconds
};

// UI Configuration
export const UI_CONFIG = {
  DEBOUNCE_DELAY: 300, // milliseconds
  ANIMATION_DURATION: 200, // milliseconds
  NOTIFICATION_DURATION: 5000, // milliseconds
  MAX_VISIBLE_ACTIVITIES: 50,
  SCROLL_THRESHOLD: 100, // pixels
  FONT_SIZE_RANGE: {
    MIN: 10,
    MAX: 20,
    DEFAULT: 14
  }
};

// Notification Configuration
export const NOTIFICATION_CONFIG = {
  DEFAULT_ENABLED: true,
  DEFAULT_SOUND: false,
  MAX_NOTIFICATIONS: 5,
  GROUP_BY_REPO: true,
  REQUIRE_INTERACTION: false,
  BADGE_MAX_COUNT: 99
};

// Cache Configuration
export const CACHE_CONFIG = {
  CACHE_DURATION: 5 * 60 * 1000, // 5 minutes
  MAX_CACHE_SIZE: 50, // items
  CLEANUP_INTERVAL: 10 * 60 * 1000 // 10 minutes
};

// Feature Flags
export const FEATURES = {
  ENABLE_PUSH_EVENTS: false,
  ENABLE_STATS_TRACKING: true,
  ENABLE_OFFLINE_MODE: true,
  ENABLE_ACTIVITY_CACHING: true,
  ENABLE_ADVANCED_FILTERING: true
};

// Error Messages
export const ERROR_MESSAGES = {
  NETWORK_ERROR: 'Network connection error. Please check your internet connection.',
  AUTH_FAILED: 'Authentication failed. Please check your GitHub token.',
  RATE_LIMITED: 'Rate limit exceeded. Please wait before making more requests.',
  NOT_FOUND: 'Repository not found or access denied.',
  FORBIDDEN: 'Access denied. Please check your permissions.',
  SERVER_ERROR: 'GitHub API is experiencing issues. Please try again later.',
  INVALID_TOKEN: 'Invalid GitHub token format.',
  CORS_ERROR: 'CORS error. Please check your browser settings.',
  STORAGE_ERROR: 'Storage error. Please check your browser settings.',
  VALIDATION_ERROR: 'Invalid input. Please check your repository format.',
  UNKNOWN_ERROR: 'An unexpected error occurred.'
};

// Validation Patterns
export const VALIDATION_PATTERNS = {
  REPOSITORY_NAME: /^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+$/,
  GITHUB_TOKEN: /^ghp_[a-zA-Z0-9]{36}$/,
  USERNAME: /^[a-zA-Z0-9]([a-zA-Z0-9-]{0,38})[a-zA-Z0-9]$/,
  URL: /^https?:\/\/.+/,
  EMAIL: /^[^\s@]+@[^\s@]+\.[^\s@]+$/
};

// Default Values
export const DEFAULTS = {
  CHECK_INTERVAL: 15, // minutes
  THEME: 'system',
  FONT_SIZE: 14,
  NOTIFICATIONS_ENABLED: true,
  NOTIFICATIONS_SOUND: false,
  FILTERS: {
    pullRequests: true,
    issues: true,
    releases: true,
    pushes: false
  },
  WATCHED_REPOS: [],
  MUTED_REPOS: [],
  SNOOZED_REPOS: [],
  READ_ITEMS: [],
  PINNED_REPOS: []
};

// Development Configuration
export const DEV_CONFIG = {
  ENABLE_DEBUG_LOGGING: false,
  ENABLE_PERFORMANCE_MONITORING: false,
  MOCK_API_CALLS: false,
  LOG_LEVEL: 'info' // 'debug', 'info', 'warn', 'error'
};

// Export all configurations as a single object for easy access
export const CONFIG = {
  API: API_CONFIG,
  RATE_LIMIT: RATE_LIMIT_CONFIG,
  STORAGE: STORAGE_CONFIG,
  UI: UI_CONFIG,
  NOTIFICATIONS: NOTIFICATION_CONFIG,
  CACHE: CACHE_CONFIG,
  FEATURES,
  ERROR_MESSAGES,
  VALIDATION_PATTERNS,
  DEFAULTS,
  DEV: DEV_CONFIG
};