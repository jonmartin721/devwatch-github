import { describe, test, expect } from '@jest/globals';

import {
  prepareActivitiesForStorage,
  filterVisibleActivities,
  countUnreadActivities
} from '../shared/feed-policy.js';

describe('feed-policy', () => {
  describe('prepareActivitiesForStorage', () => {
    test('dedupes incoming activities, prepends new items, and trims to the max size', () => {
      const existing = [
        { id: 'existing-1', repo: 'owner/repo', createdAt: '2025-01-01T00:00:00Z' },
        { id: 'existing-2', repo: 'owner/repo', createdAt: '2025-01-01T01:00:00Z' }
      ];
      const incoming = [
        { id: 'incoming-1', repo: 'owner/repo', createdAt: '2025-01-02T00:00:00Z' },
        { id: 'existing-1', repo: 'owner/repo', createdAt: '2025-01-02T01:00:00Z' },
        { id: 'incoming-2', repo: 'owner/repo', createdAt: '2025-01-02T02:00:00Z' }
      ];

      const result = prepareActivitiesForStorage(existing, incoming, { maxStored: 3 });

      expect(result.map(activity => activity.id)).toEqual(['incoming-1', 'incoming-2', 'existing-1']);
    });

    test('filters excluded repositories before storing', () => {
      const result = prepareActivitiesForStorage([], [
        { id: 'muted-1', repo: 'muted/repo' },
        { id: 'visible-1', repo: 'active/repo' }
      ], {
        excludedRepos: new Set(['muted/repo'])
      });

      expect(result).toHaveLength(1);
      expect(result[0].repo).toBe('active/repo');
    });
  });

  describe('filterVisibleActivities', () => {
    const now = Date.now();
    const activities = [
      {
        id: 'unread-pr',
        repo: 'visible/repo',
        type: 'pr',
        title: 'Unread PR',
        description: 'Fresh activity',
        createdAt: new Date(now - 60 * 1000).toISOString()
      },
      {
        id: 'read-issue',
        repo: 'visible/repo',
        type: 'issue',
        title: 'Read issue',
        description: 'Needs archive coverage',
        createdAt: new Date(now - 2 * 60 * 1000).toISOString()
      },
      {
        id: 'old-release',
        repo: 'visible/repo',
        type: 'release',
        title: 'Old release',
        description: 'Should expire',
        createdAt: new Date(now - 5 * 60 * 60 * 1000).toISOString()
      },
      {
        id: 'muted-pr',
        repo: 'muted/repo',
        type: 'pr',
        title: 'Muted PR',
        description: 'Should be hidden',
        createdAt: new Date(now - 60 * 1000).toISOString()
      }
    ];

    test('applies excluded repo, expiry, read/archive, type, and search filters together', () => {
      const result = filterVisibleActivities(activities, {
        excludedRepos: new Set(['muted/repo']),
        itemExpiryHours: 2,
        currentFilter: 'pr',
        searchQuery: 'unread',
        showArchive: false,
        readItems: ['read-issue']
      });

      expect(result.map(activity => activity.id)).toEqual(['unread-pr']);
    });

    test('shows only read items in archive mode', () => {
      const result = filterVisibleActivities(activities, {
        showArchive: true,
        readItems: ['read-issue']
      });

      expect(result.map(activity => activity.id)).toEqual(['read-issue']);
    });
  });

  describe('countUnreadActivities', () => {
    test('counts only visible unread items', () => {
      const now = Date.now();
      const activities = [
        { id: 'visible-unread', repo: 'visible/repo', createdAt: new Date(now - 1000).toISOString() },
        { id: 'visible-read', repo: 'visible/repo', createdAt: new Date(now - 2000).toISOString() },
        { id: 'muted-unread', repo: 'muted/repo', createdAt: new Date(now - 3000).toISOString() },
        { id: 'expired-unread', repo: 'visible/repo', createdAt: new Date(now - 5 * 60 * 60 * 1000).toISOString() }
      ];

      const result = countUnreadActivities(activities, {
        excludedRepos: new Set(['muted/repo']),
        itemExpiryHours: 2,
        readItems: ['visible-read']
      });

      expect(result).toBe(1);
    });
  });
});
