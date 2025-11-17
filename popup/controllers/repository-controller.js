import { showError } from '../../shared/error-handler.js';
import { useState, setState } from '../../shared/state-manager.js';
import { groupByRepo } from '../views/activity-item-view.js';

/**
 * Toggles the collapsed state of a repository group
 * @param {string} repo - Repository name
 * @param {Set} collapsedRepos - Set of collapsed repository names
 * @param {Function} renderActivitiesCallback - Callback to re-render activities
 */
export async function toggleRepoCollapse(repo, collapsedRepos, renderActivitiesCallback) {
  if (collapsedRepos.has(repo)) {
    collapsedRepos.delete(repo);
  } else {
    collapsedRepos.add(repo);
  }

  // Save collapsed state
  await chrome.storage.local.set({ collapsedRepos: Array.from(collapsedRepos) });

  // Re-render
  renderActivitiesCallback();
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
    const isCurrentlyPinned = pinnedRepos.includes(repo);
    let updatedPinnedRepos;

    if (isCurrentlyPinned) {
      // Unpin the repo
      updatedPinnedRepos = pinnedRepos.filter(r => r !== repo);
    } else {
      // Pin the repo
      updatedPinnedRepos = [...pinnedRepos, repo];
    }

    // Save to storage
    await chrome.storage.sync.set({ pinnedRepos: updatedPinnedRepos });

    // Update through callback
    setPinnedReposCallback(updatedPinnedRepos);

    // Re-render activities to show updated pin state
    renderActivitiesCallback();
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
    // Get snooze duration from settings
    const settings = await chrome.storage.sync.get(['snoozeHours', 'snoozedRepos']);
    const snoozeHours = settings.snoozeHours || 1;
    const snoozedRepos = settings.snoozedRepos || [];

    // Calculate expiration time
    const expiresAt = Date.now() + (snoozeHours * 60 * 60 * 1000);

    // Check if repo is already snoozed and update, otherwise add new
    const existingIndex = snoozedRepos.findIndex(s => s.repo === repo);
    if (existingIndex >= 0) {
      snoozedRepos[existingIndex].expiresAt = expiresAt;
    } else {
      snoozedRepos.push({ repo, expiresAt });
    }

    // Save to storage
    await chrome.storage.sync.set({ snoozedRepos });

    // Reload activities to reflect the snooze
    await loadActivitiesCallback();
  } catch (error) {
    showError('errorMessage', error, null, { action: 'snooze repository', repo }, 3000);
  }
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
      const newReadItems = state.readItems.filter(item => item !== id);
      setState({ readItems: newReadItems });
    } else {
      const newReadItems = [...state.readItems, id];
      setState({ readItems: newReadItems });
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
    const newReadItems = [...state.readItems, id];
    setState({ readItems: newReadItems });
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
  setTimeout(() => {
    markAsRead(id);
    renderActivitiesCallback();
  }, 300); // Match CSS transition duration
}

/**
 * Marks all activities as read
 * @param {Function} renderActivitiesCallback - Callback to re-render activities
 */
export async function handleMarkAllRead(renderActivitiesCallback) {
  try {
    await chrome.runtime.sendMessage({ action: 'markAllAsRead' });
    const state = useState();
    const newReadItems = state.allActivities.map(a => a.id);
    setState({ readItems: newReadItems });
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
  const grouped = groupByRepo(state.allActivities);
  const allRepos = Object.keys(grouped);
  const allCollapsed = collapsedRepos.size === allRepos.length;

  if (allCollapsed) {
    // Expand all
    collapsedRepos.clear();
  } else {
    // Collapse all
    allRepos.forEach(repo => collapsedRepos.add(repo));
  }

  // Save and re-render
  await chrome.storage.local.set({ collapsedRepos: Array.from(collapsedRepos) });
  renderActivitiesCallback();
}
