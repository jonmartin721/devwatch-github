/**
 * Shared feed mutation helpers used by popup, options, and background.
 */

export function toggleCollapsedRepo(collapsedRepos, repo) {
  const updated = new Set(collapsedRepos instanceof Set ? collapsedRepos : collapsedRepos || []);

  if (updated.has(repo)) {
    updated.delete(repo);
  } else {
    updated.add(repo);
  }

  return updated;
}

export function togglePinnedRepoList(pinnedRepos = [], repo) {
  const normalized = Array.isArray(pinnedRepos) ? [...pinnedRepos] : [];

  if (normalized.includes(repo)) {
    return normalized.filter(item => item !== repo);
  }

  return [...normalized, repo];
}

export function upsertSnoozedRepo(snoozedRepos = [], repo, expiresAt) {
  const normalized = Array.isArray(snoozedRepos)
    ? snoozedRepos.map(item => ({ ...item }))
    : [];
  const existingIndex = normalized.findIndex(item => item.repo === repo);

  if (existingIndex >= 0) {
    normalized[existingIndex].expiresAt = expiresAt;
    return normalized;
  }

  return [...normalized, { repo, expiresAt }];
}

export function getAllActivityIds(activities = []) {
  return activities
    .map(activity => activity?.id)
    .filter(Boolean);
}

export function getUnreadActivityIds(activities = [], readItems = []) {
  const readSet = new Set(Array.isArray(readItems) ? readItems : []);

  return activities
    .filter(activity => activity?.id && !readSet.has(activity.id))
    .map(activity => activity.id);
}

export function getRepoUnreadActivityIds(activities = [], readItems = [], repo) {
  const readSet = new Set(Array.isArray(readItems) ? readItems : []);

  return activities
    .filter(activity => activity?.repo === repo && activity?.id && !readSet.has(activity.id))
    .map(activity => activity.id);
}

export function markActivitiesAsRead(readItems = [], activityIds = []) {
  const updated = new Set(Array.isArray(readItems) ? readItems : []);

  activityIds.forEach(id => {
    if (id) {
      updated.add(id);
    }
  });

  return [...updated];
}

export function markActivityAsUnread(readItems = [], activityId) {
  return (Array.isArray(readItems) ? readItems : []).filter(id => id !== activityId);
}

export function removeRepoFeedData({ activities = [], readItems = [] }, repo) {
  const updatedActivities = (Array.isArray(activities) ? activities : [])
    .filter(activity => activity?.repo !== repo);
  const removedActivityIds = new Set(
    (Array.isArray(activities) ? activities : [])
      .filter(activity => activity?.repo === repo && activity?.id)
      .map(activity => activity.id)
  );

  return {
    activities: updatedActivities,
    readItems: (Array.isArray(readItems) ? readItems : [])
      .filter(id => !removedActivityIds.has(id))
  };
}

export function clearArchivedFeedData({ activities = [], readItems = [] }) {
  const archivedIds = new Set(Array.isArray(readItems) ? readItems : []);

  return {
    activities: (Array.isArray(activities) ? activities : [])
      .filter(activity => activity?.id ? !archivedIds.has(activity.id) : true),
    readItems: []
  };
}
