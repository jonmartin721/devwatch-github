import { formatDate } from '../../shared/utils.js';
import { escapeHtml, sanitizeImageUrl } from '../../shared/sanitize.js';
import { CHECK_ICON, createSvg } from '../../shared/icons.js';
import { useState } from '../../shared/state-manager.js';
import {
  getActivityTypeBadgeLabel,
  formatRelativeTime,
  getActivityTypeLabel,
  groupByRepo,
  groupByTime
} from '../../shared/feed-presentation.js';

/**
 * Renders a single activity item HTML
 * @param {Object} activity - The activity object to render
 * @returns {string} HTML string for the activity item
 */
export function renderActivityItem(activity) {
  const state = useState();
  const isRead = state.readItems.includes(activity.id);

  // Sanitize all user-generated content to prevent XSS
  const sanitizedTitle = escapeHtml(activity.title);
  const sanitizedAuthor = escapeHtml(activity.author);
  const sanitizedRepo = escapeHtml(activity.repo);
  const sanitizedType = escapeHtml(activity.type);
  const sanitizedTypeLabel = escapeHtml(getActivityTypeLabel(activity.type));
  const sanitizedTypeBadgeLabel = escapeHtml(getActivityTypeBadgeLabel(activity.type));
  const sanitizedAvatar = sanitizeImageUrl(activity.authorAvatar);

  return `
    <div class="activity-item ${isRead ? 'read' : 'unread'}" data-id="${escapeHtml(activity.id)}" data-url="${escapeHtml(activity.url)}" role="button" tabindex="0" aria-label="Open ${sanitizedTypeLabel}: ${sanitizedTitle} by ${sanitizedAuthor}">
      <img src="${sanitizedAvatar}" class="activity-avatar" alt="${sanitizedAuthor}">
      <div class="activity-content">
        <div class="activity-header">
          <span class="activity-type ${sanitizedType}" title="${sanitizedTypeLabel}">${sanitizedTypeBadgeLabel}</span>
          <span class="activity-repo">${sanitizedRepo}</span>
        </div>
        <div class="activity-title">${sanitizedTitle}</div>
        <div class="activity-meta">
          by ${sanitizedAuthor} • ${formatRelativeTime(activity.createdAt) || formatDate(activity.createdAt)}
        </div>
      </div>
      <div class="activity-actions">
        ${!isRead ? `<button class="action-btn mark-read-btn" data-action="mark-read" title="Mark as done" aria-label="Mark ${sanitizedTitle} as done">
          ${createSvg(CHECK_ICON, 16, 16)}
        </button>` : ''}
      </div>
    </div>
  `;
}

export { groupByRepo, groupByTime };

