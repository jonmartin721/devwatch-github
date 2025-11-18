import { stateManager, useState, setState } from '../../shared/state-manager.js';
import { CHEVRON_DOWN_ICON, SNOOZE_ICON, getPinIcon, createSvg } from '../../shared/icons.js';
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
  snoozeRepo
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
      snoozeRepo
    );

    return;
  }

  // Fallback to legacy rendering if renderer not available
  legacyRenderActivities(
    filtered,
    state,
    collapsedRepos,
    pinnedRepos,
    markAsRead,
    markAsReadWithAnimation,
    handleMarkAllRead,
    handleCollapseAll,
    toggleRepoCollapse,
    togglePinRepo,
    snoozeRepo
  );
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
 */
function attachEventListeners(
  list,
  markAsRead,
  markAsReadWithAnimation,
  handleMarkAllRead,
  handleCollapseAll,
  toggleRepoCollapse,
  togglePinRepo,
  snoozeRepo
) {
  console.log('Attaching event listeners with delegation');

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
      // Don't trigger if clicking on buttons, spans with specific classes, or SVG inside buttons
      if (e.target.closest('.repo-snooze-btn') ||
          e.target.closest('.repo-pin-btn') ||
          e.target.closest('.repo-collapse-btn') ||
          e.target.classList.contains('repo-unread-count') ||
          e.target.classList.contains('repo-count')) {
        return;
      }

      const repo = repoHeader.dataset.repo;
      if (repo) {
        console.log('Header click for repo:', repo);
        toggleRepoCollapse(repo);
      }
      return;
    }

    // Handle collapse button clicks
    const collapseBtn = e.target.closest('.repo-collapse-btn');
    if (collapseBtn) {
      e.stopPropagation();
      const repo = collapseBtn.dataset.repo;
      if (repo) {
        console.log('Collapse button click for repo:', repo);
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
        console.log('Pin button click for repo:', repo);
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
        console.log('Snooze button click for repo:', repo);
        snoozeRepo(repo);
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
          console.log('Mark as read click for item:', id);
          markAsReadWithAnimation(id, activityItem);
        }
        return;
      }

      // Handle content clicks (open activity)
      const content = e.target.closest('.activity-content');
      if (content) {
        const url = activityItem.dataset.url;
        console.log('Content click for URL:', url);

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
      console.log('Keyboard activation for URL:', url);

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

  console.log('Event delegation listeners attached successfully');
}

/**
 * Legacy rendering function as fallback when optimized renderer is not available
 * Generates full HTML for the activity list with all event handlers
 */
function legacyRenderActivities(
  filtered,
  state,
  collapsedRepos,
  pinnedRepos,
  markAsRead,
  markAsReadWithAnimation,
  handleMarkAllRead,
  handleCollapseAll,
  toggleRepoCollapse,
  togglePinRepo,
  snoozeRepo
) {
  const list = document.getElementById('activityList');

  const unreadCount = filtered.filter(a => !state.readItems.includes(a.id)).length;
  const repoCount = new Set(filtered.map(a => a.repo)).size;
  const allCollapsed = repoCount > 0 && collapsedRepos.size === repoCount;

  // Only render header if there's something to show
  const showCollapseAll = repoCount > 1;
  const showMarkAllRead = unreadCount > 0 && !state.showArchive;
  const showUnreadCount = unreadCount > 0 && !state.showArchive;
  const showClearArchive = state.showArchive && filtered.length > 0;
  const archivedCount = state.showArchive ? filtered.length : 0;
  const shouldShowHeader = showCollapseAll || showMarkAllRead || showUnreadCount || showClearArchive;

  let htmlContent = '';

  if (shouldShowHeader) {
    htmlContent += `
      <div class="list-header">
        <span>${showUnreadCount ? `${unreadCount} unread` : showClearArchive ? `${archivedCount} archived` : ''}</span>
        <div class="header-actions">
          ${showCollapseAll ? `<button id="collapseAllBtn" class="text-btn">${allCollapsed ? 'Expand all' : 'Collapse all'}</button>` : ''}
          ${showMarkAllRead ? `<button id="markAllReadBtn" class="text-btn">Mark all as read</button>` : ''}
          ${showClearArchive ? `<button id="clearArchiveBtn" class="text-btn">Clear archive</button>` : ''}
        </div>
      </div>
    `;
  }

  // Group activities by repository
  const grouped = groupByRepo(filtered, pinnedRepos);

  // Render each repo group
  Object.keys(grouped).forEach(repo => {
    const activities = grouped[repo];
    const repoUnreadCount = activities.filter(a => !state.readItems.includes(a.id)).length;
    const isCollapsed = collapsedRepos.has(repo);
    const isPinned = pinnedRepos.includes(repo);

    htmlContent += `
      <div class="repo-group-header ${isPinned ? 'pinned' : ''}" data-repo="${repo}">
        <div class="repo-group-title">
          <button class="repo-collapse-btn" data-repo="${repo}" title="${isCollapsed ? 'Expand' : 'Collapse'}" aria-label="${isCollapsed ? 'Expand' : 'Collapse'} ${repo} activities">
            ${createSvg(CHEVRON_DOWN_ICON, 12, 12, `chevron ${isCollapsed ? 'collapsed' : ''}`)}
          </button>
          <span class="repo-group-name">${repo}</span>
        </div>
        <div class="repo-group-actions">
          <button class="repo-pin-btn ${isPinned ? 'pinned' : ''}" data-repo="${repo}" title="${isPinned ? 'Unpin repository' : 'Pin repository'}" aria-label="${isPinned ? 'Unpin' : 'Pin'} ${repo} repository">
            ${getPinIcon(isPinned)}
          </button>
          ${repoUnreadCount > 0 ? `<span class="repo-unread-count">${repoUnreadCount}</span>` : ''}
          <button class="repo-snooze-btn" data-repo="${repo}" title="Snooze this repository" aria-label="Snooze ${repo} repository">
            ${createSvg(SNOOZE_ICON, 14, 14)}
          </button>
        </div>
      </div>
      <div class="repo-activities ${isCollapsed ? 'collapsed' : ''}" data-repo="${repo}">
    `;

    htmlContent += activities.map(activity => renderActivityItem(activity)).join('');
    htmlContent += '</div>';
  });

  list.innerHTML = htmlContent;

  // Event listeners
  document.getElementById('markAllReadBtn')?.addEventListener('click', handleMarkAllRead);
  document.getElementById('collapseAllBtn')?.addEventListener('click', handleCollapseAll);
  document.getElementById('clearArchiveBtn')?.addEventListener('click', async () => {
    // Clear all archived items by removing them from readItems
    await setState({ readItems: [] });
  });

  // Header click listeners for expand/collapse
  list.querySelectorAll('.repo-group-header').forEach(header => {
    header.addEventListener('click', (e) => {
      // Don't trigger if clicking on buttons or SVG inside buttons
      const target = e.target;
      if (target.closest('.repo-snooze-btn') ||
          target.closest('.repo-pin-btn') ||
          target.closest('.repo-collapse-btn') ||
          target.classList.contains('repo-unread-count')) {
        return;
      }

      const repo = header.dataset.repo;
      toggleRepoCollapse(repo);
    });
  });

  // Collapse button listeners
  list.querySelectorAll('.repo-collapse-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const repo = btn.dataset.repo;
      toggleRepoCollapse(repo);
    });
  });

  // Pin button listeners
  list.querySelectorAll('.repo-pin-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const repo = btn.dataset.repo;
      togglePinRepo(repo);
    });
  });

  // Snooze button listeners
  list.querySelectorAll('.repo-snooze-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const repo = btn.dataset.repo;
      snoozeRepo(repo);
    });
  });

  list.querySelectorAll('.activity-item').forEach(item => {
    const content = item.querySelector('.activity-content');

    // Shared handler for opening activity
    const handleOpen = async () => {
      const url = item.dataset.url;

      // Validate URL before opening to prevent javascript: and data: URLs
      const opened = await safelyOpenUrl(url);
      if (!opened) {
        showError('errorMessage', new Error('Invalid URL detected'), null, { action: 'open link' }, 3000);
      }
    };

    // Click handler for content
    content.addEventListener('click', handleOpen);

    // Keyboard handler for the entire item (role="button")
    item.addEventListener('keydown', (e) => {
      // Activate on Enter or Space key
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        handleOpen();
      }
    });

    item.querySelectorAll('.action-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const action = btn.dataset.action;
        const id = item.dataset.id;

        if (action === 'mark-read') {
          markAsReadWithAnimation(id, item);
        }
      });
    });
  });
}
