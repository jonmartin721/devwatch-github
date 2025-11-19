import { stateManager, useState, setState } from '../../shared/state-manager.js';
import { CHEVRON_DOWN_ICON, SNOOZE_ICON, CHECK_ICON, getPinIcon, createSvg } from '../../shared/icons.js';
import { showError } from '../../shared/error-handler.js';
import { safelyOpenUrl } from '../../shared/security.js';
import { renderActivityItem, groupByRepo } from './activity-item-view.js';

/**
 * Renders the filtered activity list using ActivityListRenderer for efficient DOM updates
 * This is the main rendering function that delegates to optimized or legacy renderer
 * @param {Object} activityRenderer - The ActivityListRenderer instance (can be null)
 * @param {Set} collapsedRepos - Set of collapsed repository names
 * @param {Array} pinnedRepos - Array of pinned repository names
 * @param {Function} markAsRead - Callback for marking item as read
 * @param {Function} markAsReadWithAnimation - Callback for marking item as read with animation
 * @param {Function} handleMarkAllRead - Callback for marking all as read
 * @param {Function} handleCollapseAll - Callback for collapsing/expanding all repos
 * @param {Function} toggleRepoCollapse - Callback for toggling repo collapse state
 * @param {Function} togglePinRepo - Callback for toggling repo pin state
 * @param {Function} snoozeRepo - Callback for snoozing a repo
 * @param {Function} markRepoAsRead - Callback for marking all items in a repo as read
 */
export function renderActivities(
  activityRenderer,
  collapsedRepos,
  pinnedRepos,
  markAsRead,
  markAsReadWithAnimation,
  handleMarkAllRead,
  handleCollapseAll,
  toggleRepoCollapse,
  togglePinRepo,
  snoozeRepo,
  markRepoAsRead
) {
  const list = document.getElementById('activityList');
  const state = useState();
  const filtered = stateManager.getFilteredActivities();

  if (filtered.length === 0) {
    let emptyMessage = 'No recent activity';
    let fullMessage = '';

    if (state.showArchive) {
      // Archive-specific empty state
      emptyMessage = 'Archive is empty';
      fullMessage = 'Items you mark as read will appear here. They\'re kept for easy reference and automatically cleaned up based on your Feed Management settings.';
    } else if (state.searchQuery) {
      // Search-specific empty state
      emptyMessage = 'No matching activity';
      const optionsText = `<a href="#" id="optionsLink" class="options-link">options</a>`;
      fullMessage = `Go to ${optionsText} to watch more repositories.`;
    } else {
      // Regular empty state
      emptyMessage = 'No new activity';
      const optionsText = `<a href="#" id="optionsLink" class="options-link">options</a>`;
      fullMessage = `Go to ${optionsText} to watch more repositories.`;
    }

    list.innerHTML = `
      <div class="empty-state">
        <p>${emptyMessage}</p>
        <small>${fullMessage}</small>
      </div>
    `;

    // Clear the renderer's cache since we manually updated the DOM
    // This prevents the renderer from thinking it doesn't need to re-render
    // when we later have items to show
    if (activityRenderer) {
      activityRenderer.lastRenderedData = null;
    }

    // Add click listener for options link (only present in non-archive states)
    if (!state.showArchive) {
      const optionsLink = document.getElementById('optionsLink');
      if (optionsLink) {
        optionsLink.addEventListener('click', async (e) => {
          e.preventDefault();

          // Open options page with hash and query parameter
          const optionsUrl = chrome.runtime.getURL('options/options.html#repositories?showAdd=true');
          await chrome.tabs.create({ url: optionsUrl });
        });
      }
    }
    return;
  }

  // Use optimized renderer
  if (activityRenderer) {
    const unreadCount = filtered.filter(a => !state.readItems.includes(a.id)).length;
    const repoCount = new Set(filtered.map(a => a.repo)).size;
    const allCollapsed = repoCount > 0 && collapsedRepos.size === repoCount;

    // Render with optimized renderer (returns true if HTML was updated)
    activityRenderer.render(filtered, {
      groupByRepo: true,
      maxItems: 50,
      collapsedRepos,
      pinnedRepos,
      readItems: state.readItems
    });

    // Add header with action buttons (only if there's something to show)
    const showCollapseAll = repoCount > 1;
    const showMarkAllRead = unreadCount > 0 && !state.showArchive;
    const showUnreadCount = unreadCount > 0 && !state.showArchive;
    const showClearArchive = state.showArchive && filtered.length > 0;
    const archivedCount = state.showArchive ? filtered.length : 0;
    const shouldShowHeader = showCollapseAll || showMarkAllRead || showUnreadCount || showClearArchive;

    const existingHeader = list.querySelector('.list-header');

    if (shouldShowHeader) {
      const header = `
        <div class="list-header">
          <span>${showUnreadCount ? `${unreadCount} unread` : showClearArchive ? `${archivedCount} archived` : ''}</span>
          <div class="header-actions">
            ${showCollapseAll ? `<button id="collapseAllBtn" class="text-btn">${allCollapsed ? 'Expand all' : 'Collapse all'}</button>` : ''}
            ${showMarkAllRead ? `<button id="markAllReadBtn" class="text-btn">Mark all as read</button>` : ''}
            ${showClearArchive ? `<button id="clearArchiveBtn" class="text-btn">Clear archive</button>` : ''}
          </div>
        </div>
      `;

      if (existingHeader) {
        existingHeader.outerHTML = header;
      } else {
        list.insertAdjacentHTML('afterbegin', header);
      }
    } else if (existingHeader) {
      // Remove header if it exists but shouldn't be shown
      existingHeader.remove();
    }

    // Always attach event listeners using event delegation
    // Event delegation works regardless of whether DOM was re-rendered
    // and prevents duplicate listeners by replacing existing ones
    attachEventListeners(
      list,
      markAsRead,
      markAsReadWithAnimation,
      handleMarkAllRead,
      handleCollapseAll,
      toggleRepoCollapse,
      togglePinRepo,
      snoozeRepo,
      markRepoAsRead
    );

    return;
  }
}

/**
 * Attaches event listeners to rendered activity list using event delegation
 * This ensures listeners work even when DOM optimizer skips re-rendering
 * @param {HTMLElement} list - The activity list container
 * @param {Function} markAsRead - Callback for marking item as read
 * @param {Function} markAsReadWithAnimation - Callback for marking item as read with animation
 * @param {Function} handleMarkAllRead - Callback for marking all as read
 * @param {Function} handleCollapseAll - Callback for collapsing/expanding all repos
 * @param {Function} toggleRepoCollapse - Callback for toggling repo collapse state
 * @param {Function} togglePinRepo - Callback for toggling repo pin state
 * @param {Function} snoozeRepo - Callback for snoozing a repo
 * @param {Function} markRepoAsRead - Callback for marking all items in a repo as read
 */
function attachEventListeners(
  list,
  markAsRead,
  markAsReadWithAnimation,
  handleMarkAllRead,
  handleCollapseAll,
  toggleRepoCollapse,
  togglePinRepo,
  snoozeRepo,
  markRepoAsRead
) {
  // Header action button listeners (using document.getElementById for buttons outside list)
  const markAllBtn = document.getElementById('markAllReadBtn');
  const collapseBtn = document.getElementById('collapseAllBtn');
  const clearArchiveBtn = document.getElementById('clearArchiveBtn');

  // Remove existing listeners to prevent duplicates
  markAllBtn?.replaceWith(markAllBtn.cloneNode(true));
  collapseBtn?.replaceWith(collapseBtn.cloneNode(true));
  clearArchiveBtn?.replaceWith(clearArchiveBtn.cloneNode(true));

  // Re-add listeners to fresh elements
  document.getElementById('markAllReadBtn')?.addEventListener('click', handleMarkAllRead);
  document.getElementById('collapseAllBtn')?.addEventListener('click', handleCollapseAll);
  document.getElementById('clearArchiveBtn')?.addEventListener('click', async () => {
    // Clear all archived items by removing them from readItems
    const { setState } = await import('../../shared/state-manager.js');
    await setState({ readItems: [] });
  });

  // Remove existing event delegation listener if present
  const existingListener = list._delegationListener;
  if (existingListener) {
    list.removeEventListener('click', existingListener);
  }

  // Create unified event delegation handler
  const delegationHandler = (e) => {
    // Handle repo group header clicks (for expand/collapse)
    const repoHeader = e.target.closest('.repo-group-header');
    if (repoHeader) {
      // Only trigger if NOT clicking on buttons or specific spans
      if (!e.target.closest('.repo-snooze-btn') &&
          !e.target.closest('.repo-pin-btn') &&
          !e.target.closest('.repo-collapse-btn') &&
          !e.target.closest('.repo-mark-read-btn') &&
          !e.target.classList.contains('repo-unread-count') &&
          !e.target.classList.contains('repo-count')) {
        const repo = repoHeader.dataset.repo;
        if (repo) {
          toggleRepoCollapse(repo);
        }
        return;
      }
      // Don't return here - let it fall through to button-specific handlers
    }

    // Handle collapse button clicks
    const collapseBtn = e.target.closest('.repo-collapse-btn');
    if (collapseBtn) {
      e.stopPropagation();
      const repo = collapseBtn.dataset.repo;
      if (repo) {
        toggleRepoCollapse(repo);
      }
      return;
    }

    // Handle pin button clicks
    const pinBtn = e.target.closest('.repo-pin-btn');
    if (pinBtn) {
      e.stopPropagation();
      const repo = pinBtn.dataset.repo;
      if (repo) {
        togglePinRepo(repo);
      }
      return;
    }

    // Handle snooze button clicks
    const snoozeBtn = e.target.closest('.repo-snooze-btn');
    if (snoozeBtn) {
      e.stopPropagation();
      const repo = snoozeBtn.dataset.repo;
      if (repo) {
        snoozeRepo(repo);
      }
      return;
    }

    // Handle mark repo as read button clicks
    const markRepoReadBtn = e.target.closest('.repo-mark-read-btn');
    if (markRepoReadBtn) {
      e.stopPropagation();
      const repo = markRepoReadBtn.dataset.repo;
      if (repo) {
        markRepoAsRead(repo);
      }
      return;
    }

    // Handle activity item clicks
    const activityItem = e.target.closest('.activity-item');
    if (activityItem) {
      // Handle action button clicks (mark as read)
      const actionBtn = e.target.closest('.action-btn');
      if (actionBtn) {
        e.stopPropagation();
        const action = actionBtn.dataset.action;
        const id = activityItem.dataset.id;

        if (action === 'mark-read') {
          markAsReadWithAnimation(id, activityItem);
        }
        return;
      }

      // Handle content clicks (open activity)
      const content = e.target.closest('.activity-content');
      if (content) {
        const url = activityItem.dataset.url;

        // Validate URL before opening to prevent javascript: and data: URLs
        safelyOpenUrl(url).then(opened => {
          if (!opened) {
            showError('errorMessage', new Error('Invalid URL detected'), null, { action: 'open link' }, 3000);
          }
        });
      }
      return;
    }

    // Handle options link in empty state
    if (e.target.closest('#optionsLink')) {
      e.preventDefault();
      chrome.tabs.create({ url: chrome.runtime.getURL('options/options.html#repositories?showAdd=true') });
    }
  };

  // Add the delegation listener to the list container
  list.addEventListener('click', delegationHandler);

  // Store reference to prevent duplicate listeners
  list._delegationListener = delegationHandler;

  // Add keyboard support for activity items (role="button")
  const keydownHandler = (e) => {
    if (e.target.classList.contains('activity-item') &&
        (e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault();
      const url = e.target.dataset.url;

      safelyOpenUrl(url).then(opened => {
        if (!opened) {
          showError('errorMessage', new Error('Invalid URL detected'), null, { action: 'open link' }, 3000);
        }
      });
    }
  };

  // Remove existing keyboard listener if present
  const existingKeydownListener = list._keydownListener;
  if (existingKeydownListener) {
    list.removeEventListener('keydown', existingKeydownListener);
  }

  // Add keyboard event delegation
  list.addEventListener('keydown', keydownHandler);
  list._keydownListener = keydownHandler;
}
