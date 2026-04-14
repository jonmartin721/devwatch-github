/**
 * Shared settings schema and normalization helpers.
 */

export const CATEGORY_SETTINGS = Object.freeze([
  {
    key: 'prs',
    label: 'Pull Requests',
    optionsTrackId: 'filterPrs',
    optionsNotifyId: 'notifyPrs',
    onboardingTrackId: 'pullRequests',
    onboardingNotifyId: 'pullRequestsNotifications'
  },
  {
    key: 'issues',
    label: 'Issues',
    optionsTrackId: 'filterIssues',
    optionsNotifyId: 'notifyIssues',
    onboardingTrackId: 'issues',
    onboardingNotifyId: 'issuesNotifications'
  },
  {
    key: 'releases',
    label: 'Releases',
    optionsTrackId: 'filterReleases',
    optionsNotifyId: 'notifyReleases',
    onboardingTrackId: 'releases',
    onboardingNotifyId: 'releasesNotifications'
  }
]);

function createDefaultFilters() {
  return {
    prs: true,
    issues: true,
    releases: true
  };
}

function createDefaultNotifications() {
  return {
    prs: true,
    issues: true,
    releases: true
  };
}

export const SETTINGS_SCHEMA = Object.freeze({
  mutedRepos: { defaultValue: [] },
  snoozedRepos: { defaultValue: [] },
  pinnedRepos: { defaultValue: [] },
  filters: { defaultValue: createDefaultFilters() },
  notifications: { defaultValue: createDefaultNotifications() },
  checkInterval: { defaultValue: 15 },
  snoozeHours: { defaultValue: 1 },
  theme: { defaultValue: 'system' },
  colorTheme: { defaultValue: 'polar' },
  itemExpiryHours: { defaultValue: null },
  markReadOnSnooze: { defaultValue: false },
  allowUnlimitedRepos: { defaultValue: false }
});

export const SETTINGS_SYNC_KEYS = Object.freeze(Object.keys(SETTINGS_SCHEMA));

export function getDefaultSettings() {
  return {
    mutedRepos: [],
    snoozedRepos: [],
    pinnedRepos: [],
    filters: createDefaultFilters(),
    notifications: createDefaultNotifications(),
    checkInterval: 15,
    snoozeHours: 1,
    theme: 'system',
    colorTheme: 'polar',
    itemExpiryHours: null,
    markReadOnSnooze: false,
    allowUnlimitedRepos: false
  };
}

function normalizeCategoryValues(value, defaults) {
  const normalized = { ...defaults };

  if (!value || typeof value !== 'object') {
    return normalized;
  }

  CATEGORY_SETTINGS.forEach(category => {
    if (value[category.key] !== undefined) {
      normalized[category.key] = value[category.key] !== false;
    }
  });

  return normalized;
}

function normalizeArrayValue(value) {
  return Array.isArray(value) ? [...value] : [];
}

export function normalizeSettings(rawSettings = {}) {
  const defaults = getDefaultSettings();

  return {
    mutedRepos: normalizeArrayValue(rawSettings.mutedRepos ?? defaults.mutedRepos),
    snoozedRepos: normalizeArrayValue(rawSettings.snoozedRepos ?? defaults.snoozedRepos),
    pinnedRepos: normalizeArrayValue(rawSettings.pinnedRepos ?? defaults.pinnedRepos),
    filters: normalizeCategoryValues(rawSettings.filters, defaults.filters),
    notifications: normalizeCategoryValues(rawSettings.notifications, defaults.notifications),
    checkInterval: Number.isFinite(Number(rawSettings.checkInterval))
      ? Number(rawSettings.checkInterval)
      : defaults.checkInterval,
    snoozeHours: Number.isFinite(Number(rawSettings.snoozeHours))
      ? Number(rawSettings.snoozeHours)
      : defaults.snoozeHours,
    theme: rawSettings.theme || defaults.theme,
    colorTheme: rawSettings.colorTheme || defaults.colorTheme,
    itemExpiryHours: rawSettings.itemExpiryHours !== undefined
      ? rawSettings.itemExpiryHours
      : defaults.itemExpiryHours,
    markReadOnSnooze: rawSettings.markReadOnSnooze === true,
    allowUnlimitedRepos: rawSettings.allowUnlimitedRepos === true
  };
}

export function pickSyncSettings(rawSettings = {}) {
  const normalized = normalizeSettings(rawSettings);
  const syncSettings = {};

  SETTINGS_SYNC_KEYS.forEach(key => {
    syncSettings[key] = normalized[key];
  });

  return syncSettings;
}

export function createCategorySettings(filters = {}, notifications = {}) {
  return {
    filters: normalizeCategoryValues(filters, createDefaultFilters()),
    notifications: normalizeCategoryValues(notifications, createDefaultNotifications())
  };
}
