import { describe, expect, test } from '@jest/globals';

import {
  clearArchivedFeedData,
  getAllActivityIds,
  getUnreadActivityIds,
  getRepoUnreadActivityIds,
  markActivitiesAsRead,
  markActivityAsUnread,
  removeRepoFeedData,
  toggleCollapsedRepo,
  togglePinnedRepoList,
  upsertSnoozedRepo
} from '../shared/feed-mutations.js';

describe('feed-mutations', () => {
  test('toggles collapsed repos with set semantics', () => {
    const collapsed = toggleCollapsedRepo(new Set(['facebook/react']), 'vuejs/core');

    expect(collapsed).toEqual(new Set(['facebook/react', 'vuejs/core']));
    expect(toggleCollapsedRepo(collapsed, 'facebook/react')).toEqual(new Set(['vuejs/core']));
  });

  test('toggles pinned repos without duplicates', () => {
    expect(togglePinnedRepoList(['facebook/react'], 'vuejs/core')).toEqual(['facebook/react', 'vuejs/core']);
    expect(togglePinnedRepoList(['facebook/react'], 'facebook/react')).toEqual([]);
    expect(togglePinnedRepoList(null, 'solidjs/solid')).toEqual(['solidjs/solid']);
  });

  test('upserts snoozed repos in place', () => {
    const next = upsertSnoozedRepo([{ repo: 'facebook/react', expiresAt: 1 }], 'facebook/react', 2);

    expect(next).toEqual([{ repo: 'facebook/react', expiresAt: 2 }]);
    expect(upsertSnoozedRepo(next, 'vuejs/core', 3)).toEqual([
      { repo: 'facebook/react', expiresAt: 2 },
      { repo: 'vuejs/core', expiresAt: 3 }
    ]);
  });

  test('computes all activity ids and unread ids for a repository', () => {
    const activities = [
      { id: '1', repo: 'facebook/react' },
      { id: null, repo: 'facebook/react' },
      { id: '2', repo: 'facebook/react' },
      { id: '3', repo: 'vuejs/core' }
    ];

    expect(getAllActivityIds(activities)).toEqual(['1', '2', '3']);
    expect(getUnreadActivityIds(activities, ['2'])).toEqual(['1', '3']);
    expect(getRepoUnreadActivityIds(activities, ['2'], 'facebook/react')).toEqual(['1']);
  });

  test('marks activities as read and unread idempotently', () => {
    const readItems = markActivitiesAsRead(['1'], ['1', '2', null, '3']);

    expect(readItems.sort()).toEqual(['1', '2', '3']);
    expect(markActivityAsUnread(readItems, '2').sort()).toEqual(['1', '3']);
    expect(markActivityAsUnread(null, '2')).toEqual([]);
  });

  test('handles collapsed repos when the existing collection is missing or array-backed', () => {
    expect(toggleCollapsedRepo(null, 'facebook/react')).toEqual(new Set(['facebook/react']));
    expect(toggleCollapsedRepo(['facebook/react'], 'vuejs/core')).toEqual(new Set(['facebook/react', 'vuejs/core']));
  });

  test('removes repo feed data and matching read items', () => {
    const result = removeRepoFeedData({
      activities: [
        { id: '1', repo: 'facebook/react' },
        { id: '2', repo: 'vuejs/core' },
        { id: '3', repo: 'facebook/react' }
      ],
      readItems: ['1', '2', '3']
    }, 'facebook/react');

    expect(result).toEqual({
      activities: [{ id: '2', repo: 'vuejs/core' }],
      readItems: ['2']
    });
  });

  test('clears archived feed data by dropping read activities', () => {
    const result = clearArchivedFeedData({
      activities: [
        { id: '1', repo: 'facebook/react' },
        { id: '2', repo: 'vuejs/core' }
      ],
      readItems: ['1']
    });

    expect(result).toEqual({
      activities: [{ id: '2', repo: 'vuejs/core' }],
      readItems: []
    });
  });

  test('keeps malformed activities when clearing archive data', () => {
    const result = clearArchivedFeedData({
      activities: [
        { id: '1', repo: 'facebook/react' },
        { repo: 'missing/id' }
      ],
      readItems: ['1']
    });

    expect(result).toEqual({
      activities: [{ repo: 'missing/id' }],
      readItems: []
    });
  });
});
