/**
 * Shared feed presentation helpers used by popup rendering.
 */

import { formatDate } from './utils.js';

export function getActivityTypeLabel(type) {
  const labels = {
    pr: 'Pull Request',
    issue: 'Issue',
    release: 'Release',
    PullRequestEvent: 'Pull Request',
    IssuesEvent: 'Issue',
    ReleaseEvent: 'Release',
    PushEvent: 'Push',
    IssueCommentEvent: 'Comment'
  };

  return labels[type] || type;
}

export function getActivityTypeBadgeLabel(type) {
  const labels = {
    pr: 'PR',
    issue: 'Issue',
    release: 'Release',
    PullRequestEvent: 'PR',
    IssuesEvent: 'Issue',
    ReleaseEvent: 'Release',
    PushEvent: 'Push',
    IssueCommentEvent: 'Comment'
  };

  return labels[type] || type;
}

export function formatRelativeTime(timestamp) {
  const date = new Date(timestamp);

  if (Number.isNaN(date.getTime())) {
    return '';
  }

  const diffMs = Date.now() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 1) {
    return 'just now';
  }

  if (diffMins < 60) {
    return `${diffMins}m ago`;
  }

  if (diffHours < 24) {
    return `${diffHours}h ago`;
  }

  if (diffDays < 7) {
    return `${diffDays}d ago`;
  }

  return formatDate(timestamp);
}

export function groupByTime(activities = []) {
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterdayStart = new Date(todayStart.getTime() - 24 * 60 * 60 * 1000);
  const weekStart = new Date(todayStart.getTime() - 7 * 24 * 60 * 60 * 1000);

  const groups = {
    today: [],
    yesterday: [],
    thisWeek: [],
    older: []
  };

  activities.forEach(activity => {
    const date = new Date(activity.createdAt);

    if (date >= todayStart) {
      groups.today.push(activity);
    } else if (date >= yesterdayStart) {
      groups.yesterday.push(activity);
    } else if (date >= weekStart) {
      groups.thisWeek.push(activity);
    } else {
      groups.older.push(activity);
    }
  });

  return groups;
}

export function getSortedRepoGroups(activities = [], pinnedRepos = []) {
  const grouped = new Map();

  activities.forEach(activity => {
    if (!grouped.has(activity.repo)) {
      grouped.set(activity.repo, []);
    }

    grouped.get(activity.repo).push(activity);
  });

  return [...grouped.entries()]
    .map(([repo, repoActivities]) => [
      repo,
      [...repoActivities].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    ])
    .sort(([repoA, activitiesA], [repoB, activitiesB]) => {
      const repoAIsPinned = pinnedRepos.includes(repoA);
      const repoBIsPinned = pinnedRepos.includes(repoB);

      if (repoAIsPinned && !repoBIsPinned) {
        return -1;
      }

      if (!repoAIsPinned && repoBIsPinned) {
        return 1;
      }

      const latestA = new Date(activitiesA[0]?.createdAt || 0);
      const latestB = new Date(activitiesB[0]?.createdAt || 0);
      return latestB - latestA;
    });
}

export function groupByRepo(activities = [], pinnedRepos = []) {
  return Object.fromEntries(getSortedRepoGroups(activities, pinnedRepos));
}
