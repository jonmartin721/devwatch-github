import { stateManager, useState } from '../../shared/state-manager.js';
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
    if (!state.showArchive) emptyMessage = 'No new activity';
    if (state.searchQuery) emptyMessage = 'No matching activity';

    // Always make "options" a link to add repos section
    const optionsText = `<a href="#" id="optionsLink" class="options-link">options</a>`;
    const fullMessage = `Go to ${optionsText} to watch more repositories.`;

    list.innerHTML = `
      <div class="empty-state">
        <p>${emptyMessage}</p>
        <small>${fullMessage}</small>
      </div>
    `;

    // Add click listener for options link
    const optionsLink = document.getElementById('optionsLink');
    if (optionsLink) {
      optionsLink.addEventListener('click', async (e) => {
        e.preventDefault();

        // Open options page with hash and query parameter
        const optionsUrl = chrome.runtime.getURL('options/options.html#repositories?showAdd=true');
        await chrome.tabs.create({ url: optionsUrl });
      });
    }
    return;
  }

  // Use optimized renderer if available, fallback to legacy rendering
  if (activityRenderer) {
    const unreadCount = filtered.filter(a => !state.readItems.includes(a.id)).length;
    const repoCount = new Set(filtered.map(a => a.repo)).size;

    // Render with optimized renderer
    activityRenderer.render(filtered, {
      groupByRepo: true,
      maxItems: 50
    });

    // Add header with action buttons
    const header = `
      <div class="list-header">
        <span>${unreadCount > 0 ? `${unreadCount} unread` : ''}</span>
        <div class="header-actions">
          ${repoCount > 1 ? `<button id="collapseAllBtn" class="text-btn">Collapse all</button>` : ''}
          ${unreadCount > 0 ? `<button id="markAllReadBtn" class="text-btn">Mark all as read</button>` : ''}
        </div>
      </div>
    `;

    // Prepend header to the container
    const existingHeader = list.querySelector('.list-header');
    if (!existingHeader) {
      list.insertAdjacentHTML('afterbegin', header);
    }

    // Event listeners are already attached in the DOM generation
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

  const header = `
    <div class="list-header">
      <span>${unreadCount > 0 ? `${unreadCount} unread` : ''}</span>
      <div class="header-actions">
        ${repoCount > 1 ? `<button id="collapseAllBtn" class="text-btn">${allCollapsed ? 'Expand all' : 'Collapse all'}</button>` : ''}
        ${unreadCount > 0 ? `<button id="markAllReadBtn" class="text-btn">Mark all as read</button>` : ''}
      </div>
    </div>
  `;

  // Group activities by repository
  const grouped = groupByRepo(filtered, pinnedRepos);

  let htmlContent = header;

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

  // Header click listeners for expand/collapse
  list.querySelectorAll('.repo-group-header').forEach(header => {
    header.addEventListener('click', (e) => {
      // Don't trigger if clicking on buttons
      if (e.target.closest('.repo-snooze-btn')) {
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
      const id = item.dataset.id;
      const url = item.dataset.url;
      markAsRead(id);

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
