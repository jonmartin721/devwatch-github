import { beforeEach, describe, expect, jest, test } from '@jest/globals';

const mockGetSyncItem = jest.fn();
const mockGetFilteringSettings = jest.fn();
const mockGetExcludedRepos = jest.fn();
const mockShowError = jest.fn();
const mockClearError = jest.fn();
const mockIsOffline = jest.fn();
const mockShowOfflineStatus = jest.fn();
const mockGetCachedData = jest.fn();
const mockCacheForOffline = jest.fn();
const mockShowCachedActivities = jest.fn();
const mockSetState = jest.fn();
const mockFilterVisibleActivities = jest.fn();

jest.unstable_mockModule('../shared/storage-helpers.js', () => ({
  getSyncItem: mockGetSyncItem,
  getFilteringSettings: mockGetFilteringSettings,
  getExcludedRepos: mockGetExcludedRepos
}));

jest.unstable_mockModule('../shared/error-handler.js', () => ({
  showError: mockShowError,
  clearError: mockClearError
}));

jest.unstable_mockModule('../shared/offline-manager.js', () => ({
  isOffline: mockIsOffline,
  showOfflineStatus: mockShowOfflineStatus,
  getCachedData: mockGetCachedData,
  cacheForOffline: mockCacheForOffline,
  showCachedActivities: mockShowCachedActivities
}));

jest.unstable_mockModule('../shared/state-manager.js', () => ({
  setState: mockSetState
}));

jest.unstable_mockModule('../shared/feed-policy.js', () => ({
  filterVisibleActivities: mockFilterVisibleActivities
}));

const {
  handleRefresh,
  loadActivities,
  showStoredError,
  updateLastUpdated,
  updateRateLimit
} = await import('../popup/controllers/activity-controller.js');

beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
  document.body.innerHTML = `
    <div id="activityList"></div>
    <div id="lastUpdated"></div>
    <div id="rateLimitInfo"></div>
    <div id="errorMessage"></div>
    <button id="refreshBtn"></button>
  `;

  chrome.storage.local.get.mockResolvedValue({
    activities: [],
    readItems: [],
    collapsedRepos: [],
    rateLimit: null,
    lastError: null
  });
  chrome.storage.sync.get.mockResolvedValue({
    lastCheck: '2025-01-15T10:30:00.000Z'
  });
  chrome.runtime.sendMessage.mockResolvedValue({});

  mockGetSyncItem.mockResolvedValue([]);
  mockGetFilteringSettings.mockResolvedValue({
    mutedRepos: [],
    snoozedRepos: [],
    pinnedRepos: []
  });
  mockGetExcludedRepos.mockReturnValue(new Set());
  mockIsOffline.mockReturnValue(false);
  mockSetState.mockResolvedValue();
  mockFilterVisibleActivities.mockImplementation((activities) => activities);
  mockGetCachedData.mockResolvedValue(null);
  mockCacheForOffline.mockResolvedValue();
});

describe('popup activity controller coverage', () => {
  test('loads cached activities while offline', async () => {
    const cachedActivities = [{ id: '1', repo: 'facebook/react' }];
    const filteredActivities = [{ id: 'visible', repo: 'facebook/react' }];
    const renderActivities = jest.fn();

    mockIsOffline.mockReturnValue(true);
    mockGetCachedData
      .mockResolvedValueOnce(cachedActivities)
      .mockResolvedValueOnce(['1']);
    mockFilterVisibleActivities.mockReturnValue(filteredActivities);
    mockGetFilteringSettings.mockResolvedValue({
      mutedRepos: ['muted/repo'],
      snoozedRepos: [{ repo: 'snoozed/repo', expiresAt: Date.now() + 1000 }],
      pinnedRepos: ['facebook/react']
    });

    await loadActivities(renderActivities);

    expect(mockShowOfflineStatus).toHaveBeenCalledWith('errorMessage', true);
    expect(mockSetState).toHaveBeenCalledWith({
      allActivities: filteredActivities,
      readItems: ['1'],
      pinnedRepos: ['facebook/react'],
      collapsedRepos: new Set()
    }, { persist: false });
    expect(mockShowCachedActivities).toHaveBeenCalledWith(filteredActivities);
    expect(renderActivities).toHaveBeenCalled();
  });

  test('shows an offline empty state when no cached activities exist', async () => {
    const renderActivities = jest.fn();
    mockIsOffline.mockReturnValue(true);
    mockGetCachedData
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null);

    await loadActivities(renderActivities);

    expect(document.getElementById('activityList').textContent).toContain('No cached data available');
    expect(renderActivities).not.toHaveBeenCalled();
  });

  test('surfaces cached data loading failures', async () => {
    const renderActivities = jest.fn();
    const error = new Error('cache unavailable');
    mockIsOffline.mockReturnValue(true);
    mockGetCachedData.mockRejectedValue(error);

    await loadActivities(renderActivities);

    expect(document.getElementById('activityList').textContent).toContain('Unable to load cached data');
    expect(mockShowError).toHaveBeenCalledWith(
      'errorMessage',
      error,
      null,
      { action: 'load cached activities' },
      0
    );
  });

  test('loads and caches filtered activities while online', async () => {
    const renderActivities = jest.fn();
    const filteredActivities = [{ id: '2', repo: 'vuejs/core' }];
    const lastError = {
      message: 'GitHub rate limit warning',
      repo: 'vuejs/core',
      timestamp: Date.now()
    };
    const futureReset = Date.now() + 5 * 60000;

    chrome.storage.local.get.mockResolvedValue({
      activities: [{ id: '1', repo: 'muted/repo' }, { id: '2', repo: 'vuejs/core' }],
      readItems: ['2'],
      rateLimit: {
        remaining: 500,
        limit: 5000,
        reset: futureReset
      },
      lastError,
      collapsedRepos: ['vuejs/core']
    });
    mockGetFilteringSettings.mockResolvedValue({
      mutedRepos: ['muted/repo'],
      snoozedRepos: [],
      pinnedRepos: ['vuejs/core']
    });
    mockGetSyncItem.mockResolvedValue(['vuejs/core']);
    mockFilterVisibleActivities.mockReturnValue(filteredActivities);

    await loadActivities(renderActivities);

    expect(mockShowOfflineStatus).toHaveBeenCalledWith('errorMessage', false);
    expect(mockClearError).toHaveBeenCalledWith('errorMessage');
    expect(mockSetState).toHaveBeenCalledWith({
      allActivities: filteredActivities,
      readItems: ['2'],
      pinnedRepos: ['vuejs/core'],
      collapsedRepos: new Set(['vuejs/core'])
    });
    expect(mockCacheForOffline).toHaveBeenCalledWith('activities_cache', filteredActivities, 3600000);
    expect(mockCacheForOffline).toHaveBeenCalledWith('readItems_cache', ['2'], 3600000);
    expect(renderActivities).toHaveBeenCalled();
    expect(document.getElementById('rateLimitInfo').textContent).toContain('500/5000');
    expect(document.getElementById('rateLimitInfo').textContent).toContain('resets in');
    expect(document.getElementById('lastUpdated').textContent).toMatch(/Updated \d{1,2}:\d{2}/);
    expect(mockShowError).toHaveBeenCalledWith(
      'errorMessage',
      expect.any(Error),
      null,
      { repo: 'vuejs/core' },
      10000
    );
  });

  test('skips replacing the loading UI when skipLoadingIndicator is enabled', async () => {
    const renderActivities = jest.fn();
    document.getElementById('activityList').innerHTML = '<div>Existing feed</div>';

    await loadActivities(renderActivities, { skipLoadingIndicator: true });

    expect(document.getElementById('activityList').innerHTML).toBe('<div>Existing feed</div>');
    expect(renderActivities).toHaveBeenCalled();
  });

  test('handles refresh failures and restores the button state', async () => {
    const loadCallback = jest.fn();
    const error = new Error('refresh failed');
    chrome.runtime.sendMessage.mockRejectedValue(error);

    await handleRefresh(loadCallback);

    expect(mockClearError).toHaveBeenCalledWith('errorMessage');
    expect(mockShowError).toHaveBeenCalledWith(
      'errorMessage',
      error,
      null,
      { action: 'refresh activities' },
      5000
    );
    expect(loadCallback).not.toHaveBeenCalled();
    expect(document.getElementById('refreshBtn').disabled).toBe(false);
    expect(document.getElementById('refreshBtn').classList.contains('spinning')).toBe(false);
    expect(document.getElementById('refreshBtn').classList.contains('refresh-complete')).toBe(true);

    await jest.advanceTimersByTimeAsync(400);
    expect(document.getElementById('refreshBtn').classList.contains('refresh-complete')).toBe(false);
  });

  test('passes skipLoadingIndicator when refresh succeeds', async () => {
    const loadCallback = jest.fn().mockResolvedValue();

    await handleRefresh(loadCallback);

    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({ action: 'checkNow' });
    expect(loadCallback).toHaveBeenCalledWith({ skipLoadingIndicator: true });
  });

  test('shows Never updated when no lastCheck exists', async () => {
    chrome.storage.sync.get.mockResolvedValue({ lastCheck: null });

    await updateLastUpdated();

    expect(document.getElementById('lastUpdated').textContent).toBe('Never updated');
  });

  test('clears stale stored errors instead of showing them', () => {
    showStoredError({
      message: 'stale',
      timestamp: Date.now() - 61000
    });

    expect(mockClearError).toHaveBeenCalledWith('errorMessage');
    expect(mockShowError).not.toHaveBeenCalled();
  });

  test('hides the rate limit footer when the budget is healthy', () => {
    updateRateLimit({ remaining: 2000, limit: 5000 });

    expect(document.getElementById('rateLimitInfo').classList.contains('hidden')).toBe(true);
  });
});
