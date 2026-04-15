import { showError } from '../../shared/error-handler.js';
import { stateManager, useState, setState } from '../../shared/state-manager.js';
import { groupByRepo } from '../../shared/feed-presentation.js';
import {
  clearArchivedFeedData,
  getAllActivityIds,
  getRepoUnreadActivityIds,
  markActivitiesAsRead,
  markActivityAsUnread,
  toggleCollapsedRepo,
  togglePinnedRepoList
} from '../../shared/feed-mutations.js';

/**
 * Toggles the collapsed state of a repository group
 * @param {string} repo - Repository name
 * @param {Set} collapsedRepos - Set of collapsed repository names
 * @param {Function} renderActivitiesCallback - Callback to re-render activities
 */
export async function toggleRepoCollapse(repo, collapsedRepos, renderActivitiesCallback) {
  const updatedCollapsedRepos = toggleCollapsedRepo(collapsedRepos, repo);
  await setState({ collapsedRepos: updatedCollapsedRepos });

  renderActivitiesCallback?.();
}

/**
 * Toggles the pinned state of a repository
 * @param {string} repo - Repository name
 * @param {Array} pinnedRepos - Array of pinned repository names
 * @param {Function} setPinnedReposCallback - Callback to update pinned repos
 * @param {Function} renderActivitiesCallback - Callback to re-render activities
 */
export async function togglePinRepo(repo, pinnedRepos, setPinnedReposCallback, renderActivitiesCallback) {
  try {
    const updatedPinnedRepos = togglePinnedRepoList(pinnedRepos, repo);
    await setState({ pinnedRepos: updatedPinnedRepos });
    setPinnedReposCallback?.(updatedPinnedRepos);
    renderActivitiesCallback?.();
  } catch (error) {
    showError('errorMessage', error, null, { action: 'toggle pin repository', repo }, 3000);
  }
}

/**
 * Snoozes a repository for a configured duration
 * @param {string} repo - Repository name
 * @param {Function} loadActivitiesCallback - Callback to reload activities
 */
export async function snoozeRepo(repo, loadActivitiesCallback) {
  try {
    await chrome.runtime.sendMessage({ action: 'snoozeRepo', repo });
    await loadActivitiesCallback();
  } catch (error) {
    showError('errorMessage', error, null, { action: 'snooze repository', repo }, 3000);
  }
}

/**
 * Snoozes a repository with animation effect
 * @param {string} repo - Repository name
 * @param {HTMLElement} repoHeaderElement - The repository header DOM element
 * @param {HTMLElement} repoActivitiesElement - The repository activities DOM element
 * @param {Function} loadActivitiesCallback - Callback to reload activities after animation
 */
export function snoozeRepoWithAnimation(repo, repoHeaderElement, repoActivitiesElement, loadActivitiesCallback) {
  // Add removing animation class to both elements
  repoHeaderElement.classList.add('removing');
  repoActivitiesElement.classList.add('removing');

  // Wait for animation to complete, then snooze the repo
  setTimeout(async () => {
    try {
      await snoozeRepo(repo, loadActivitiesCallback);
    } catch (error) {
      console.error('[snoozeRepoWithAnimation] Error:', error);
      // Reload activities anyway to remove animation classes
      await loadActivitiesCallback();
    }
  }, 300); // Match CSS transition duration
}

/**
 * Toggles read/unread state of an activity
 * @param {string} id - Activity ID
 * @param {Function} renderActivitiesCallback - Callback to re-render activities
 */
export async function toggleReadState(id, renderActivitiesCallback) {
  const state = useState();
  const isRead = state.readItems.includes(id);
  const action = isRead ? 'markAsUnread' : 'markAsRead';

  try {
    await chrome.runtime.sendMessage({ action, id });
    if (isRead) {
      await setState({ readItems: markActivityAsUnread(state.readItems, id) });
    } else {
      await setState({ readItems: markActivitiesAsRead(state.readItems, [id]) });
    }
    renderActivitiesCallback();
  } catch (error) {
    showError('errorMessage', error, null, { action: 'toggle read state' }, 3000);
  }
}

/**
 * Marks an activity as read
 * @param {string} id - Activity ID
 */
export async function markAsRead(id) {
  const state = useState();
  if (state.readItems.includes(id)) return;

  try {
    await chrome.runtime.sendMessage({ action: 'markAsRead', id });
    await setState({ readItems: markActivitiesAsRead(state.readItems, [id]) });
  } catch (error) {
    showError('errorMessage', error, null, { action: 'mark as read' }, 3000);
  }
}

/**
 * Marks an activity as read with animation effect
 * @param {string} id - Activity ID
 * @param {HTMLElement} itemElement - The activity item DOM element
 * @param {Function} renderActivitiesCallback - Callback to re-render after animation
 */
export function markAsReadWithAnimation(id, itemElement, renderActivitiesCallback) {
  // Add removing animation class
  itemElement.classList.add('removing');

  // Wait for animation to complete, then mark as read
  setTimeout(async () => {
    try {
      await markAsRead(id);
      renderActivitiesCallback();
    } catch (error) {
      console.error('[markAsReadWithAnimation] Error:', error);
      // Re-render anyway to remove animation class
      renderActivitiesCallback();
    }
  }, 300); // Match CSS transition duration
}

/**
 * Marks all activities as read
 * @param {Function} renderActivitiesCallback - Callback to re-render activities
 */
export async function handleMarkAllRead(renderActivitiesCallback) {
  try {
    const state = useState();
    const visibleActivityIds = getAllActivityIds(stateManager.getFilteredActivities());
    await chrome.runtime.sendMessage({ action: 'markActivitiesAsRead', ids: visibleActivityIds });
    await setState({ readItems: markActivitiesAsRead(state.readItems, visibleActivityIds) });
    renderActivitiesCallback();
  } catch (error) {
    showError('errorMessage', error, null, { action: 'mark all as read' }, 3000);
  }
}

/**
 * Collapses or expands all repository groups
 * @param {Set} collapsedRepos - Set of collapsed repository names
 * @param {Function} renderActivitiesCallback - Callback to re-render activities
 */
export async function handleCollapseAll(collapsedRepos, renderActivitiesCallback) {
  const state = useState();
  const grouped = groupByRepo(state.allActivities, state.pinnedRepos);
  const allRepos = Object.keys(grouped);
  const updatedCollapsedRepos = new Set(collapsedRepos);
  const allCollapsed = updatedCollapsedRepos.size === allRepos.length;

  if (allCollapsed) {
    // Expand all
    updatedCollapsedRepos.clear();
  } else {
    // Collapse all
    allRepos.forEach(repo => updatedCollapsedRepos.add(repo));
  }

  await setState({ collapsedRepos: updatedCollapsedRepos });
  renderActivitiesCallback?.();
}

/**
 * Marks all unread activities in a repository as read
 * @param {string} repo - Repository name
 * @param {Function} renderActivitiesCallback - Callback to re-render activities
 */
export async function markRepoAsRead(repo, renderActivitiesCallback) {
  try {
    const state = useState();
    const unreadItems = getRepoUnreadActivityIds(state.allActivities, state.readItems, repo);

    if (unreadItems.length === 0) {
      return; // Nothing to mark as read
    }

    await chrome.runtime.sendMessage({ action: 'markRepoAsRead', repo });
    await setState({ readItems: markActivitiesAsRead(state.readItems, unreadItems) });
    renderActivitiesCallback();
  } catch (error) {
    console.error('[markRepoAsRead] Error:', error);
    showError('errorMessage', error, null, { action: 'mark repo as read' }, 3000);
  }
}

/**
 * Clears archived items from storage and local UI state.
 * @param {Function} renderActivitiesCallback - Callback to re-render activities
 */
export async function clearArchive(renderActivitiesCallback) {
  try {
    await chrome.runtime.sendMessage({ action: 'clearArchive' });
    const state = useState();
    const clearedState = clearArchivedFeedData({
      activities: state.allActivities,
      readItems: state.readItems
    });
    await setState({
      allActivities: clearedState.activities,
      readItems: clearedState.readItems
    });
    renderActivitiesCallback?.();
  } catch (error) {
    showError('errorMessage', error, null, { action: 'clear archive' }, 3000);
  }
}
