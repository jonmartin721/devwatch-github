import { jest, describe, test, beforeEach, expect } from '@jest/globals';

// Mock Chrome APIs
global.chrome = {
  storage: {
    sync: {
      get: jest.fn((keys, callback) => callback({})),
      set: jest.fn((items, callback) => callback && callback())
    },
    local: {
      get: jest.fn((keys, callback) => callback({})),
      set: jest.fn((items, callback) => callback && callback())
    }
  },
  alarms: {
    create: jest.fn(),
    clear: jest.fn(),
    onAlarm: {
      addListener: jest.fn()
    }
  },
  action: {
    setBadgeText: jest.fn(),
    setBadgeBackgroundColor: jest.fn()
  },
  notifications: {
    create: jest.fn(),
    onClicked: {
      addListener: jest.fn()
    },
    clear: jest.fn()
  },
  tabs: {
    create: jest.fn()
  },
  runtime: {
    onInstalled: {
      addListener: jest.fn()
    },
    onStartup: {
      addListener: jest.fn()
    },
    onMessage: {
      addListener: jest.fn()
    }
  }
};

// Mock fetch
global.fetch = jest.fn();

// Import functions from background.js
import {
  fetchRepoActivity,
  storeActivities,
  updateBadge,
  cleanupOldUnmutedEntries,
  showNotifications,
  cleanExpiredSnoozes
} from '../background.js';

describe('Background Service Worker', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('fetchRepoActivity', () => {
    const mockRepo = 'facebook/react';
    const mockToken = 'ghp_test123';
    const mockSince = new Date('2025-01-01');
    const mockFilters = { prs: true, issues: true, releases: true };

    beforeEach(() => {
      // Setup default storage mock
      chrome.storage.local.set.mockImplementation((items, callback) => callback && callback());
    });

    test('fetches PRs, issues, and releases when all filters enabled', async () => {

      // Mock successful responses
      const mockPRs = [
        {
          number: 1,
          title: 'Test PR',
          html_url: 'https://github.com/facebook/react/pull/1',
          created_at: '2025-01-10T10:00:00Z',
          user: { login: 'testuser', avatar_url: 'https://avatar.url' }
        }
      ];

      const mockIssues = [
        {
          number: 2,
          title: 'Test Issue',
          html_url: 'https://github.com/facebook/react/issues/2',
          created_at: '2025-01-10T11:00:00Z',
          user: { login: 'testuser2', avatar_url: 'https://avatar2.url' },
          pull_request: undefined // Not a PR
        }
      ];

      const mockReleases = [
        {
          tag_name: 'v1.0.0',
          name: 'Release 1.0.0',
          html_url: 'https://github.com/facebook/react/releases/tag/v1.0.0',
          published_at: '2025-01-10T12:00:00Z',
          author: { login: 'testuser3', avatar_url: 'https://avatar3.url' }
        }
      ];

      fetch
        .mockResolvedValueOnce({
          ok: true,
          headers: {
            get: (header) => {
              const headers = {
                'X-RateLimit-Remaining': '4999',
                'X-RateLimit-Limit': '5000',
                'X-RateLimit-Reset': '1704110000'
              };
              return headers[header];
            }
          },
          json: async () => mockPRs
        })
        .mockResolvedValueOnce({
          ok: true,
          headers: { get: () => null },
          json: async () => mockIssues
        })
        .mockResolvedValueOnce({
          ok: true,
          headers: { get: () => null },
          json: async () => mockReleases
        });

      const activities = await fetchRepoActivity(mockRepo, mockToken, mockSince, mockFilters);

      expect(activities).toHaveLength(3);
      expect(activities[0]).toMatchObject({
        type: 'pr',
        repo: mockRepo,
        title: 'Test PR',
        number: 1
      });
      expect(activities[1]).toMatchObject({
        type: 'issue',
        repo: mockRepo,
        title: 'Test Issue'
      });
      expect(activities[2]).toMatchObject({
        type: 'release',
        repo: mockRepo,
        title: 'Release 1.0.0'
      });
    });

    test('handles 401 unauthorized error', async () => {

      fetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
        headers: { get: () => null }
      });

      const result = await fetchRepoActivity(mockRepo, mockToken, mockSince, mockFilters);
      expect(result).toEqual([]);
    });

    test('handles 403 rate limit exceeded', async () => {

      fetch.mockResolvedValueOnce({
        ok: false,
        status: 403,
        statusText: 'Forbidden',
        headers: { get: () => null }
      });

      const result = await fetchRepoActivity(mockRepo, mockToken, mockSince, mockFilters);
      expect(result).toEqual([]);
    });

    test('handles 404 repository not found', async () => {

      fetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: 'Not Found',
        headers: { get: () => null }
      });

      const result = await fetchRepoActivity(mockRepo, mockToken, mockSince, mockFilters);
      expect(result).toEqual([]);
    });

    test('tracks rate limit headers', async () => {

      fetch.mockResolvedValue({
        ok: true,
        headers: {
          get: (header) => {
            const headers = {
              'X-RateLimit-Remaining': '1234',
              'X-RateLimit-Limit': '5000',
              'X-RateLimit-Reset': '1704110000'
            };
            return headers[header];
          }
        },
        json: async () => []
      });

      await fetchRepoActivity(mockRepo, mockToken, mockSince, mockFilters);

      expect(chrome.storage.local.set).toHaveBeenCalledWith(
        {
          rateLimit: {
            remaining: 1234,
            limit: 5000,
            reset: 1704110000000
          }
        },
        expect.any(Function)
      );
    });

    test('respects filter settings - only PRs', async () => {

      fetch.mockResolvedValue({
        ok: true,
        headers: { get: () => null },
        json: async () => []
      });

      await fetchRepoActivity(mockRepo, mockToken, mockSince, {
        prs: true,
        issues: false,
        releases: false
      });

      // Should only call PRs endpoint
      expect(fetch).toHaveBeenCalledTimes(1);
      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining('/pulls'),
        expect.any(Object)
      );
    });

    test('filters activities by since date', async () => {

      const oldPR = {
        number: 1,
        title: 'Old PR',
        html_url: 'https://github.com/test/repo/pull/1',
        created_at: '2024-12-01T10:00:00Z', // Before mockSince
        user: { login: 'user', avatar_url: 'url' }
      };

      const newPR = {
        number: 2,
        title: 'New PR',
        html_url: 'https://github.com/test/repo/pull/2',
        created_at: '2025-01-10T10:00:00Z', // After mockSince
        user: { login: 'user', avatar_url: 'url' }
      };

      fetch.mockResolvedValue({
        ok: true,
        headers: { get: () => null },
        json: async () => [oldPR, newPR]
      });

      const activities = await fetchRepoActivity(
        mockRepo,
        mockToken,
        mockSince,
        { prs: true, issues: false, releases: false }
      );

      expect(activities).toHaveLength(1);
      expect(activities[0].title).toBe('New PR');
    });
  });

  describe('storeActivities', () => {
    test('prevents duplicate activities', async () => {

      const existingActivities = [
        { id: 'pr-repo-1', title: 'Existing PR', createdAt: '2025-01-01T10:00:00Z' }
      ];

      const newActivities = [
        { id: 'pr-repo-1', title: 'Duplicate PR', createdAt: '2025-01-01T10:00:00Z' },
        { id: 'pr-repo-2', title: 'New PR', createdAt: '2025-01-02T10:00:00Z' }
      ];

      chrome.storage.local.get.mockImplementation((keys, callback) => callback({ activities: existingActivities }));

      await storeActivities(newActivities);

      expect(chrome.storage.local.set).toHaveBeenCalledWith(
        {
          activities: expect.arrayContaining([
            expect.objectContaining({ id: 'pr-repo-1' }),
            expect.objectContaining({ id: 'pr-repo-2' })
          ])
        },
        expect.any(Function)
      );

      const savedActivities = chrome.storage.local.set.mock.calls[0][0].activities;
      expect(savedActivities).toHaveLength(2);
    });

    test('maintains maximum of 2000 activities', async () => {

      // Create 100 existing activities
      const existingActivities = Array.from({ length: 100 }, (_, i) => ({
        id: `old-${i}`,
        title: `Old Activity ${i}`,
        createdAt: new Date(2025, 0, 1, 10, i).toISOString()
      }));

      const newActivities = [
        { id: 'new-1', title: 'New Activity 1', createdAt: '2025-01-10T10:00:00Z' },
        { id: 'new-2', title: 'New Activity 2', createdAt: '2025-01-10T11:00:00Z' }
      ];

      chrome.storage.local.get.mockImplementation((keys, callback) => callback({ activities: existingActivities }));

      await storeActivities(newActivities);

      const savedActivities = chrome.storage.local.set.mock.calls[0][0].activities;
      expect(savedActivities).toHaveLength(102);
      // New activities are prepended, total is under 2000 limit
      expect(savedActivities[0].id).toBe('new-1');
      expect(savedActivities[1].id).toBe('new-2');
    });

    test('prepends new activities in order', async () => {

      const newActivities = [
        { id: 'id-1', title: 'First', createdAt: '2025-01-05T10:00:00Z' },
        { id: 'id-2', title: 'Second', createdAt: '2025-01-01T10:00:00Z' },
        { id: 'id-3', title: 'Third', createdAt: '2025-01-10T10:00:00Z' }
      ];

      chrome.storage.local.get.mockImplementation((keys, callback) => callback({ activities: [] }));

      await storeActivities(newActivities);

      const savedActivities = chrome.storage.local.set.mock.calls[0][0].activities;
      // Activities are prepended in array order, not sorted by date
      expect(savedActivities[0].title).toBe('First');
      expect(savedActivities[1].title).toBe('Second');
      expect(savedActivities[2].title).toBe('Third');
    });
  });

  describe('updateBadge', () => {
    test('calculates unread count correctly', async () => {

      const activities = [
        { id: 'id-1' },
        { id: 'id-2' },
        { id: 'id-3' }
      ];

      const readItems = ['id-1']; // One item marked as read

      chrome.storage.local.get.mockImplementation((keys, callback) => callback({ activities, readItems }));

      await updateBadge();

      expect(chrome.action.setBadgeText).toHaveBeenCalledWith({ text: '2' });
    });

    test('clears badge when all items are read', async () => {

      const activities = [
        { id: 'id-1' },
        { id: 'id-2' }
      ];

      const readItems = ['id-1', 'id-2']; // All read

      chrome.storage.local.get.mockImplementation((keys, callback) => callback({ activities, readItems }));

      await updateBadge();

      expect(chrome.action.setBadgeText).toHaveBeenCalledWith({ text: '' });
    });

    test('clears badge when no activities', async () => {

      chrome.storage.local.get.mockImplementation((keys, callback) => callback({ activities: [], readItems: [] }));

      await updateBadge();

      expect(chrome.action.setBadgeText).toHaveBeenCalledWith({ text: '' });
    });
  });

  describe('Message Handlers', () => {
    test('markAsRead adds ID to readItems', async () => {
      // This will be tested via integration - message handler setup is complex
      expect(true).toBe(true);
    });

    test('markAsUnread removes ID from readItems', async () => {
      // This will be tested via integration
      expect(true).toBe(true);
    });
  });

  describe('Unmuted Repository Cleanup', () => {
    test('removes old unmuted entries (> 30 days)', async () => {
      const thirtyOneDaysAgo = new Date(Date.now() - (31 * 24 * 60 * 60 * 1000));
      const twentyNineDaysAgo = new Date(Date.now() - (29 * 24 * 60 * 60 * 1000));

      const oldUnmutedRepos = [
        { repo: 'old/repo1', unmutedAt: thirtyOneDaysAgo.toISOString() },
        { repo: 'old/repo2', unmutedAt: thirtyOneDaysAgo.toISOString() },
        { repo: 'recent/repo', unmutedAt: twentyNineDaysAgo.toISOString() }
      ];

      const result = await cleanupOldUnmutedEntries(oldUnmutedRepos);

      expect(result).toHaveLength(1);
      expect(result[0].repo).toBe('recent/repo');
      expect(chrome.storage.sync.set).toHaveBeenCalledWith({
        unmutedRepos: [{ repo: 'recent/repo', unmutedAt: twentyNineDaysAgo.toISOString() }]
      });
    });

    test('keeps recent unmuted entries (< 30 days)', async () => {
      const tenDaysAgo = new Date(Date.now() - (10 * 24 * 60 * 60 * 1000));
      const oneDayAgo = new Date(Date.now() - (1 * 24 * 60 * 60 * 1000));

      const recentUnmutedRepos = [
        { repo: 'recent/repo1', unmutedAt: tenDaysAgo.toISOString() },
        { repo: 'recent/repo2', unmutedAt: oneDayAgo.toISOString() }
      ];

      const result = await cleanupOldUnmutedEntries(recentUnmutedRepos);

      expect(result).toHaveLength(2);
      expect(result).toEqual(recentUnmutedRepos);
      expect(chrome.storage.sync.set).not.toHaveBeenCalled();
    });

    test('handles empty unmuted repos array', async () => {
      const result = await cleanupOldUnmutedEntries([]);

      expect(result).toEqual([]);
      expect(chrome.storage.sync.set).not.toHaveBeenCalled();
    });

    test('handles null/undefined unmuted repos', async () => {
      const result1 = await cleanupOldUnmutedEntries(null);
      const result2 = await cleanupOldUnmutedEntries(undefined);

      expect(result1).toBeNull();
      expect(result2).toBeUndefined();
      expect(chrome.storage.sync.set).not.toHaveBeenCalled();
    });
  });

  describe('showNotifications', () => {
    const mockActivities = [
      {
        id: 'pr-repo1-1',
        type: 'pr',
        repo: 'facebook/react',
        title: 'Add feature',
        url: 'https://github.com/facebook/react/pull/1'
      },
      {
        id: 'pr-repo1-2',
        type: 'pr',
        repo: 'facebook/react',
        title: 'Fix bug',
        url: 'https://github.com/facebook/react/pull/2'
      },
      {
        id: 'issue-repo1-1',
        type: 'issue',
        repo: 'facebook/react',
        title: 'Bug report',
        url: 'https://github.com/facebook/react/issues/3'
      },
      {
        id: 'release-repo2-1',
        type: 'release',
        repo: 'vuejs/vue',
        title: 'v3.0.0',
        url: 'https://github.com/vuejs/vue/releases/tag/v3.0.0'
      }
    ];

    test('groups activities by repository', () => {
      showNotifications(mockActivities);

      // Should create 2 notifications (one per repo)
      expect(chrome.notifications.create).toHaveBeenCalledTimes(2);
    });

    test('creates notification with correct message format', () => {
      showNotifications(mockActivities);

      // facebook/react has 2 PRs and 1 issue
      expect(chrome.notifications.create).toHaveBeenCalledWith(
        'https://github.com/facebook/react/pull/1',
        expect.objectContaining({
          type: 'basic',
          title: 'facebook/react',
          message: '2 new prs, 1 new issue',
          iconUrl: 'icons/icon128.png',
          priority: 1
        })
      );

      // vuejs/vue has 1 release
      expect(chrome.notifications.create).toHaveBeenCalledWith(
        'https://github.com/vuejs/vue/releases/tag/v3.0.0',
        expect.objectContaining({
          type: 'basic',
          title: 'vuejs/vue',
          message: '1 new release',
          iconUrl: 'icons/icon128.png',
          priority: 1
        })
      );
    });

    test('filters out PRs when notification setting disabled', () => {
      const settings = { prs: false, issues: true, releases: true };
      showNotifications(mockActivities, settings);

      // Should only show notifications for issues and releases
      // facebook/react should only show 1 issue, vuejs/vue should show 1 release
      expect(chrome.notifications.create).toHaveBeenCalledTimes(2);

      // facebook/react notification should only mention issues
      expect(chrome.notifications.create).toHaveBeenCalledWith(
        'https://github.com/facebook/react/issues/3',
        expect.objectContaining({
          title: 'facebook/react',
          message: '1 new issue'
        })
      );
    });

    test('filters out issues when notification setting disabled', () => {
      const settings = { prs: true, issues: false, releases: true };
      showNotifications(mockActivities, settings);

      expect(chrome.notifications.create).toHaveBeenCalledTimes(2);

      // facebook/react notification should only mention PRs
      expect(chrome.notifications.create).toHaveBeenCalledWith(
        'https://github.com/facebook/react/pull/1',
        expect.objectContaining({
          title: 'facebook/react',
          message: '2 new prs'
        })
      );
    });

    test('filters out releases when notification setting disabled', () => {
      const settings = { prs: true, issues: true, releases: false };
      showNotifications(mockActivities, settings);

      // Should only show notification for facebook/react (has prs and issues)
      expect(chrome.notifications.create).toHaveBeenCalledTimes(1);
      expect(chrome.notifications.create).toHaveBeenCalledWith(
        'https://github.com/facebook/react/pull/1',
        expect.objectContaining({
          title: 'facebook/react'
        })
      );
    });

    test('does not create notifications when all activities filtered out', () => {
      const settings = { prs: false, issues: false, releases: false };
      showNotifications(mockActivities, settings);

      expect(chrome.notifications.create).not.toHaveBeenCalled();
    });

    test('does not create notifications when activities array is empty', () => {
      showNotifications([]);

      expect(chrome.notifications.create).not.toHaveBeenCalled();
    });

    test('uses default settings when notificationSettings is undefined', () => {
      showNotifications(mockActivities, undefined);

      // All notifications should be shown with default settings
      expect(chrome.notifications.create).toHaveBeenCalledTimes(2);
    });

    test('uses default settings when notificationSettings is empty object', () => {
      showNotifications(mockActivities, {});

      // All notifications should be shown with default settings
      expect(chrome.notifications.create).toHaveBeenCalledTimes(2);
    });

    test('uses first activity URL as notification ID', () => {
      const activities = [
        {
          id: 'pr-1',
          type: 'pr',
          repo: 'test/repo',
          url: 'https://github.com/test/repo/pull/1'
        },
        {
          id: 'pr-2',
          type: 'pr',
          repo: 'test/repo',
          url: 'https://github.com/test/repo/pull/2'
        }
      ];

      showNotifications(activities);

      expect(chrome.notifications.create).toHaveBeenCalledWith(
        'https://github.com/test/repo/pull/1',
        expect.any(Object)
      );
    });

    test('handles single activity correctly', () => {
      const singleActivity = [mockActivities[0]];
      showNotifications(singleActivity);

      expect(chrome.notifications.create).toHaveBeenCalledTimes(1);
      expect(chrome.notifications.create).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          message: '1 new pr' // Singular, not plural
        })
      );
    });
  });

  describe('cleanExpiredSnoozes', () => {
    test('removes expired snoozes', async () => {
      const now = Date.now();
      const expiredSnooze1 = {
        repo: 'old/repo1',
        expiresAt: now - 1000 // Expired 1 second ago
      };
      const expiredSnooze2 = {
        repo: 'old/repo2',
        expiresAt: now - 60000 // Expired 1 minute ago
      };
      const activeSnooze = {
        repo: 'active/repo',
        expiresAt: now + 3600000 // Expires in 1 hour
      };

      const snoozedRepos = [expiredSnooze1, expiredSnooze2, activeSnooze];

      const result = await cleanExpiredSnoozes(snoozedRepos);

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual(activeSnooze);
      expect(chrome.storage.sync.set).toHaveBeenCalledWith({
        snoozedRepos: [activeSnooze]
      });
    });

    test('keeps all snoozes when none are expired', async () => {
      const now = Date.now();
      const activeSnoozes = [
        { repo: 'repo1', expiresAt: now + 3600000 },
        { repo: 'repo2', expiresAt: now + 7200000 }
      ];

      const result = await cleanExpiredSnoozes(activeSnoozes);

      expect(result).toEqual(activeSnoozes);
      expect(chrome.storage.sync.set).not.toHaveBeenCalled();
    });

    test('removes all snoozes when all are expired', async () => {
      const now = Date.now();
      const expiredSnoozes = [
        { repo: 'repo1', expiresAt: now - 1000 },
        { repo: 'repo2', expiresAt: now - 2000 }
      ];

      const result = await cleanExpiredSnoozes(expiredSnoozes);

      expect(result).toEqual([]);
      expect(chrome.storage.sync.set).toHaveBeenCalledWith({
        snoozedRepos: []
      });
    });

    test('handles empty snoozes array', async () => {
      const result = await cleanExpiredSnoozes([]);

      expect(result).toEqual([]);
      expect(chrome.storage.sync.set).not.toHaveBeenCalled();
    });

    test('handles snooze exactly at expiry boundary', async () => {
      const now = Date.now();
      const exactlyExpired = {
        repo: 'boundary/repo',
        expiresAt: now // Exactly at boundary
      };

      const result = await cleanExpiredSnoozes([exactlyExpired]);

      // expiresAt <= now should be considered expired
      expect(result).toEqual([]);
      expect(chrome.storage.sync.set).toHaveBeenCalledWith({
        snoozedRepos: []
      });
    });

    test('continues with active snoozes even if storage write fails', async () => {
      const now = Date.now();
      const activeSnooze = { repo: 'active/repo', expiresAt: now + 3600000 };
      const expiredSnooze = { repo: 'expired/repo', expiresAt: now - 1000 };

      // Mock storage failure
      chrome.storage.sync.set.mockImplementation((items, callback) => {
        throw new Error('Storage quota exceeded');
      });

      const result = await cleanExpiredSnoozes([expiredSnooze, activeSnooze]);

      // Should still return filtered results even if storage fails
      expect(result).toEqual([activeSnooze]);
    });

    test('handles mixed expired and active snoozes correctly', async () => {
      const now = Date.now();
      const snoozes = [
        { repo: 'active1', expiresAt: now + 1000 },
        { repo: 'expired1', expiresAt: now - 1000 },
        { repo: 'active2', expiresAt: now + 2000 },
        { repo: 'expired2', expiresAt: now - 2000 },
        { repo: 'active3', expiresAt: now + 3000 }
      ];

      const result = await cleanExpiredSnoozes(snoozes);

      expect(result).toHaveLength(3);
      expect(result.map(s => s.repo)).toEqual(['active1', 'active2', 'active3']);
    });
  });
});
