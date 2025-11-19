import { jest, describe, test, beforeEach, expect } from '@jest/globals';

// Mock dependencies
jest.unstable_mockModule('../shared/state-manager.js', () => ({
  useState: jest.fn(() => ({ readItems: [] }))
}));

jest.unstable_mockModule('../shared/utils.js', () => ({
  formatDate: jest.fn((date) => date)
}));

jest.unstable_mockModule('../shared/sanitize.js', () => ({
  escapeHtml: jest.fn((str) => str),
  sanitizeImageUrl: jest.fn((url) => url)
}));

jest.unstable_mockModule('../shared/icons.js', () => ({
  CHECK_ICON: '<svg>check</svg>',
  createSvg: jest.fn(() => '<svg>icon</svg>')
}));

// Import functions to test
const { groupByTime, groupByRepo } = await import('../popup/views/activity-item-view.js');

describe('activity-item-view', () => {
  describe('groupByTime', () => {
    test('groups activities into today bucket', () => {
      const now = new Date();
      const todayActivity = {
        id: 'today-1',
        createdAt: new Date(now.getFullYear(), now.getMonth(), now.getDate(), 10, 0).toISOString()
      };

      const groups = groupByTime([todayActivity]);

      expect(groups.today).toHaveLength(1);
      expect(groups.today[0]).toEqual(todayActivity);
      expect(groups.yesterday).toHaveLength(0);
      expect(groups.thisWeek).toHaveLength(0);
      expect(groups.older).toHaveLength(0);
    });

    test('groups activities into yesterday bucket', () => {
      const now = new Date();
      const yesterdayActivity = {
        id: 'yesterday-1',
        createdAt: new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 10, 0).toISOString()
      };

      const groups = groupByTime([yesterdayActivity]);

      expect(groups.yesterday).toHaveLength(1);
      expect(groups.yesterday[0]).toEqual(yesterdayActivity);
      expect(groups.today).toHaveLength(0);
      expect(groups.thisWeek).toHaveLength(0);
      expect(groups.older).toHaveLength(0);
    });

    test('groups activities into this week bucket', () => {
      const now = new Date();
      const threeDaysAgo = {
        id: 'week-1',
        createdAt: new Date(now.getFullYear(), now.getMonth(), now.getDate() - 3, 10, 0).toISOString()
      };

      const groups = groupByTime([threeDaysAgo]);

      expect(groups.thisWeek).toHaveLength(1);
      expect(groups.thisWeek[0]).toEqual(threeDaysAgo);
      expect(groups.today).toHaveLength(0);
      expect(groups.yesterday).toHaveLength(0);
      expect(groups.older).toHaveLength(0);
    });

    test('groups activities into older bucket', () => {
      const now = new Date();
      const twoWeeksAgo = {
        id: 'old-1',
        createdAt: new Date(now.getFullYear(), now.getMonth(), now.getDate() - 14, 10, 0).toISOString()
      };

      const groups = groupByTime([twoWeeksAgo]);

      expect(groups.older).toHaveLength(1);
      expect(groups.older[0]).toEqual(twoWeeksAgo);
      expect(groups.today).toHaveLength(0);
      expect(groups.yesterday).toHaveLength(0);
      expect(groups.thisWeek).toHaveLength(0);
    });

    test('handles activities across all time buckets', () => {
      const now = new Date();
      const activities = [
        {
          id: 'today-1',
          createdAt: new Date(now.getFullYear(), now.getMonth(), now.getDate(), 10, 0).toISOString()
        },
        {
          id: 'yesterday-1',
          createdAt: new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 10, 0).toISOString()
        },
        {
          id: 'week-1',
          createdAt: new Date(now.getFullYear(), now.getMonth(), now.getDate() - 5, 10, 0).toISOString()
        },
        {
          id: 'old-1',
          createdAt: new Date(now.getFullYear(), now.getMonth(), now.getDate() - 30, 10, 0).toISOString()
        }
      ];

      const groups = groupByTime(activities);

      expect(groups.today).toHaveLength(1);
      expect(groups.yesterday).toHaveLength(1);
      expect(groups.thisWeek).toHaveLength(1);
      expect(groups.older).toHaveLength(1);
    });

    test('handles empty activities array', () => {
      const groups = groupByTime([]);

      expect(groups.today).toHaveLength(0);
      expect(groups.yesterday).toHaveLength(0);
      expect(groups.thisWeek).toHaveLength(0);
      expect(groups.older).toHaveLength(0);
    });

    test('handles activity exactly at midnight (today boundary)', () => {
      const now = new Date();
      const todayMidnight = {
        id: 'boundary-1',
        createdAt: new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0).toISOString()
      };

      const groups = groupByTime([todayMidnight]);

      expect(groups.today).toHaveLength(1);
      expect(groups.yesterday).toHaveLength(0);
    });

    test('handles activity exactly at yesterday midnight boundary', () => {
      const now = new Date();
      const yesterdayMidnight = {
        id: 'boundary-2',
        createdAt: new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 0, 0, 0).toISOString()
      };

      const groups = groupByTime([yesterdayMidnight]);

      expect(groups.yesterday).toHaveLength(1);
      expect(groups.today).toHaveLength(0);
    });

    test('handles activity exactly at week boundary', () => {
      const now = new Date();
      const weekBoundary = {
        id: 'boundary-3',
        createdAt: new Date(now.getFullYear(), now.getMonth(), now.getDate() - 7, 0, 0, 0).toISOString()
      };

      const groups = groupByTime([weekBoundary]);

      expect(groups.thisWeek).toHaveLength(1);
      expect(groups.older).toHaveLength(0);
    });

    test('handles multiple activities in same bucket', () => {
      const now = new Date();
      const todayActivities = [
        {
          id: 'today-1',
          createdAt: new Date(now.getFullYear(), now.getMonth(), now.getDate(), 8, 0).toISOString()
        },
        {
          id: 'today-2',
          createdAt: new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12, 0).toISOString()
        },
        {
          id: 'today-3',
          createdAt: new Date(now.getFullYear(), now.getMonth(), now.getDate(), 18, 0).toISOString()
        }
      ];

      const groups = groupByTime(todayActivities);

      expect(groups.today).toHaveLength(3);
      expect(groups.today.map(a => a.id)).toEqual(['today-1', 'today-2', 'today-3']);
    });
  });

  describe('groupByRepo', () => {
    test('groups activities by repository', () => {
      const activities = [
        { id: '1', repo: 'facebook/react', createdAt: '2025-01-10T10:00:00Z' },
        { id: '2', repo: 'vuejs/vue', createdAt: '2025-01-10T11:00:00Z' },
        { id: '3', repo: 'facebook/react', createdAt: '2025-01-10T12:00:00Z' }
      ];

      const groups = groupByRepo(activities);

      expect(Object.keys(groups)).toHaveLength(2);
      expect(groups['facebook/react']).toHaveLength(2);
      expect(groups['vuejs/vue']).toHaveLength(1);
    });

    test('sorts activities within each repo by newest first', () => {
      const activities = [
        { id: '1', repo: 'test/repo', createdAt: '2025-01-10T10:00:00Z' },
        { id: '2', repo: 'test/repo', createdAt: '2025-01-10T12:00:00Z' },
        { id: '3', repo: 'test/repo', createdAt: '2025-01-10T11:00:00Z' }
      ];

      const groups = groupByRepo(activities);

      expect(groups['test/repo'].map(a => a.id)).toEqual(['2', '3', '1']);
    });

    test('places pinned repos first', () => {
      const activities = [
        { id: '1', repo: 'unpinned/repo1', createdAt: '2025-01-10T15:00:00Z' },
        { id: '2', repo: 'pinned/repo', createdAt: '2025-01-10T10:00:00Z' },
        { id: '3', repo: 'unpinned/repo2', createdAt: '2025-01-10T14:00:00Z' }
      ];

      const groups = groupByRepo(activities, ['pinned/repo']);

      const repoOrder = Object.keys(groups);
      expect(repoOrder[0]).toBe('pinned/repo');
    });

    test('sorts unpinned repos by most recent activity', () => {
      const activities = [
        { id: '1', repo: 'old/repo', createdAt: '2025-01-10T10:00:00Z' },
        { id: '2', repo: 'new/repo', createdAt: '2025-01-10T15:00:00Z' },
        { id: '3', repo: 'mid/repo', createdAt: '2025-01-10T12:00:00Z' }
      ];

      const groups = groupByRepo(activities);

      const repoOrder = Object.keys(groups);
      expect(repoOrder).toEqual(['new/repo', 'mid/repo', 'old/repo']);
    });

    test('maintains pinned order, then sorts by recency', () => {
      const activities = [
        { id: '1', repo: 'unpinned/recent', createdAt: '2025-01-10T15:00:00Z' },
        { id: '2', repo: 'pinned/old', createdAt: '2025-01-10T08:00:00Z' },
        { id: '3', repo: 'pinned/recent', createdAt: '2025-01-10T14:00:00Z' },
        { id: '4', repo: 'unpinned/old', createdAt: '2025-01-10T09:00:00Z' }
      ];

      const groups = groupByRepo(activities, ['pinned/old', 'pinned/recent']);

      const repoOrder = Object.keys(groups);
      // Pinned repos first (sorted by recency among pinned)
      expect(repoOrder[0]).toBe('pinned/recent');
      expect(repoOrder[1]).toBe('pinned/old');
      // Unpinned repos last (sorted by recency)
      expect(repoOrder[2]).toBe('unpinned/recent');
      expect(repoOrder[3]).toBe('unpinned/old');
    });

    test('handles empty activities array', () => {
      const groups = groupByRepo([]);

      expect(Object.keys(groups)).toHaveLength(0);
    });

    test('handles single repository', () => {
      const activities = [
        { id: '1', repo: 'solo/repo', createdAt: '2025-01-10T10:00:00Z' },
        { id: '2', repo: 'solo/repo', createdAt: '2025-01-10T11:00:00Z' }
      ];

      const groups = groupByRepo(activities);

      expect(Object.keys(groups)).toHaveLength(1);
      expect(groups['solo/repo']).toHaveLength(2);
    });

    test('handles empty pinnedRepos array', () => {
      const activities = [
        { id: '1', repo: 'repo1', createdAt: '2025-01-10T15:00:00Z' },
        { id: '2', repo: 'repo2', createdAt: '2025-01-10T10:00:00Z' }
      ];

      const groups = groupByRepo(activities, []);

      // Should sort by recency without pinning
      const repoOrder = Object.keys(groups);
      expect(repoOrder).toEqual(['repo1', 'repo2']);
    });

    test('handles undefined pinnedRepos', () => {
      const activities = [
        { id: '1', repo: 'repo1', createdAt: '2025-01-10T15:00:00Z' },
        { id: '2', repo: 'repo2', createdAt: '2025-01-10T10:00:00Z' }
      ];

      const groups = groupByRepo(activities);

      // Should work with default empty array
      const repoOrder = Object.keys(groups);
      expect(repoOrder).toEqual(['repo1', 'repo2']);
    });

    test('handles pinned repo that has no activities', () => {
      const activities = [
        { id: '1', repo: 'active/repo', createdAt: '2025-01-10T10:00:00Z' }
      ];

      const groups = groupByRepo(activities, ['nonexistent/repo']);

      // Should only contain repos that have activities
      expect(Object.keys(groups)).toEqual(['active/repo']);
    });

    test('preserves activity data while grouping', () => {
      const activities = [
        {
          id: 'pr-1',
          repo: 'test/repo',
          title: 'Test PR',
          type: 'pr',
          createdAt: '2025-01-10T10:00:00Z'
        }
      ];

      const groups = groupByRepo(activities);

      expect(groups['test/repo'][0]).toEqual(activities[0]);
    });
  });
});
