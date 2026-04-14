/**
 * Basic DOM utilities for activity rendering
 * Provides simple caching and DOM manipulation helpers
 */

import { UI_CONFIG } from './config.js';
import { SNOOZE_ICON, CHECK_ICON } from './icons.js';
import { sanitizeImageUrl } from './sanitize.js';
import {
  formatRelativeTime as formatSharedRelativeTime,
  getActivityTypeLabel as getSharedActivityTypeLabel,
  getSortedRepoGroups
} from './feed-presentation.js';

/**
 * Basic DOM renderer with simple caching to avoid unnecessary re-renders
 */
class DOMOptimizer {
  constructor() {
    this.cache = new Map();
    this.container = null;
    this.renderScheduled = false;
  }

  /**
   * Initialize the optimizer with a container element
   * @param {HTMLElement} container - The container element to render in
   */
  initialize(container) {
    this.container = container;
  }

  /**
   * Schedule a render operation (debounced for performance)
   * @param {Function} renderFn - Function that generates the new DOM structure
   */
  scheduleRender(renderFn) {
    if (this.renderScheduled) return;

    this.renderScheduled = true;
    requestAnimationFrame(() => {
      this.render(renderFn());
      this.renderScheduled = false;
    });
  }

  /**
   * Efficiently render new content by comparing with current DOM
   * @param {string|HTMLElement} newContent - New content to render
   */
  render(newContent) {
    if (!this.container) {
      console.warn('DOMOptimizer not initialized');
      return;
    }

    // Convert new content to DOM element if it's a string
    const newElement = typeof newContent === 'string'
      ? this.createElementFromHTML(newContent)
      : newContent;

    // Guard against null/undefined newElement
    if (!newElement) {
      console.warn('DOMOptimizer: newElement is null or undefined');
      return;
    }

    // Simple diff and patch implementation
    this.patchElement(this.container, newElement);
  }

  /**
   * Create a DOM element from HTML string
   * @param {string} html - HTML string
   * @returns {HTMLElement} DOM element
   */
  createElementFromHTML(html) {
    const template = document.createElement('template');
    template.innerHTML = html.trim();
    return template.content.firstChild;
  }

  /**
   * Create a virtual node representation
   * @param {string} type - Element type
   * @param {Object} props - Element properties
   * @param {Array} children - Child elements
   * @returns {Object} Virtual node
   */
  createVirtualNode(type, props = {}, children = []) {
    return {
      type,
      props,
      children,
      key: props.key || null
    };
  }

  /**
   * Basic DOM update - replaces or updates elements
   * @param {HTMLElement} currentElement - Current DOM element
   * @param {HTMLElement} newElement - New DOM element
   */
  patchElement(currentElement, newElement) {
    // Guard against null/undefined elements
    if (!currentElement || !newElement) {
      return;
    }

    // If elements are the same type, update attributes and children
    if (currentElement.tagName === newElement.tagName) {
      this.updateAttributes(currentElement, newElement);
      this.updateChildren(currentElement, newElement);
    } else {
      // Replace entire element
      if (currentElement.parentNode) {
        currentElement.parentNode.replaceChild(newElement, currentElement);
      }
    }
  }

  /**
   * Update element attributes efficiently
   * @param {HTMLElement} currentElement - Current element
   * @param {HTMLElement} newElement - New element
   */
  updateAttributes(currentElement, newElement) {
    // Guard against null/undefined elements
    if (!currentElement || !newElement) {
      return;
    }

    // Remove attributes that are no longer present
    if (currentElement.attributes) {
      for (let i = 0; i < currentElement.attributes.length; i++) {
        const attr = currentElement.attributes[i];
        if (attr && attr.name && !newElement.hasAttribute(attr.name)) {
          currentElement.removeAttribute(attr.name);
        }
      }
    }

    // Add or update attributes
    if (newElement.attributes) {
      for (let i = 0; i < newElement.attributes.length; i++) {
        const attr = newElement.attributes[i];
        if (attr && attr.name && currentElement.getAttribute(attr.name) !== attr.value) {
          currentElement.setAttribute(attr.name, attr.value);
        }
      }
    }

    // Update classes efficiently
    // Handle SVG elements differently (they use className.baseVal)
    if (currentElement instanceof SVGElement) {
      if (currentElement.getAttribute('class') !== newElement.getAttribute('class')) {
        const newClass = newElement.getAttribute('class');
        if (newClass) {
          currentElement.setAttribute('class', newClass);
        } else {
          currentElement.removeAttribute('class');
        }
      }
    } else if (currentElement.className !== newElement.className) {
      currentElement.className = newElement.className;
    }
  }

  /**
   * Update children with basic element comparison
   * @param {HTMLElement} currentElement - Current element
   * @param {HTMLElement} newElement - New element
   */
  updateChildren(currentElement, newElement) {
    // Guard against null/undefined elements
    if (!currentElement || !newElement) {
      return;
    }

    const currentChildren = Array.from(currentElement.childNodes || []);
    const newChildren = Array.from(newElement.childNodes || []);

    // Simple strategy: if child counts are very different, replace all
    if (Math.abs(currentChildren.length - newChildren.length) > 5) {
      currentElement.innerHTML = newElement.innerHTML || '';
      return;
    }

    // Otherwise, update children one by one
    const maxLength = Math.max(currentChildren.length, newChildren.length);
    for (let i = 0; i < maxLength; i++) {
      const currentChild = currentChildren[i];
      const newChild = newChildren[i];

      if (!currentChild && newChild) {
        // Add new child
        const clonedChild = newChild.cloneNode(true);
        if (clonedChild) {
          currentElement.appendChild(clonedChild);
        }
      } else if (currentChild && !newChild) {
        // Remove current child
        try {
          currentElement.removeChild(currentChild);
        } catch (e) {
          console.warn('Failed to remove child element:', e);
        }
      } else if (currentChild && newChild) {
        // Update existing child
        const clonedChild = newChild.cloneNode(true);
        if (clonedChild) {
          this.patchElement(currentChild, clonedChild);
        }
      }
    }
  }

  /**
   * Batch multiple DOM operations for better performance
   * @param {Function} operations - Function containing DOM operations
   */
  batch(operations) {
    // Use DocumentFragment for batch operations
    const fragment = document.createDocumentFragment();
    const originalParent = this.container.parentNode;

    if (originalParent) {
      originalParent.replaceChild(fragment, this.container);
      operations();
      originalParent.replaceChild(this.container, fragment);
    } else {
      operations();
    }
  }

  /**
   * Clear the cache (useful when memory becomes an issue)
   */
  clearCache() {
    this.cache.clear();
  }
}

/**
 * Activity list renderer optimized for large datasets
 */
class ActivityListRenderer {
  constructor(container) {
    this.container = container;
    this.optimizer = new DOMOptimizer();
    this.optimizer.initialize(container);
    this.lastRenderedData = null;
    this.itemCache = new Map();
  }

  groupActivitiesByRepo(activities = []) {
    return new Map(getSortedRepoGroups(activities));
  }

  getActivityTypeLabel(type) {
    return getSharedActivityTypeLabel(type);
  }

  formatTime(timestamp) {
    return formatSharedRelativeTime(timestamp);
  }

  /**
   * Render activities list with efficient updates
   * @param {Array<Object>} activities - Activities to render
   * @param {Object} options - Rendering options
   * @returns {boolean} True if HTML was updated, false if skipped
   */
  render(activities, options = {}) {
    const {
      groupByRepo = true,
      maxItems = UI_CONFIG.MAX_VISIBLE_ACTIVITIES,
      collapsedRepos = new Set(),
      pinnedRepos = [],
      readItems = []
    } = options;

    // Limit activities to prevent performance issues
    const limitedActivities = activities.slice(0, maxItems);

    // Check if we need to re-render
    const renderKey = this.generateRenderKey(limitedActivities, options);
    if (this.lastRenderedData === renderKey) {
      return false; // No changes needed, event listeners should NOT be re-attached
    }

    this.lastRenderedData = renderKey;

    // Evict stale cache entries before rendering
    this.cleanupCache();

    // Render synchronously to ensure DOM is ready for event listeners
    const html = this.generateActivityHTML(limitedActivities, {
      groupByRepo,
      collapsedRepos,
      pinnedRepos,
      readItems
    });
    this.container.innerHTML = html;
    return true; // HTML was updated, event listeners should be re-attached
  }

  /**
   * Generate a unique key for the current render state
   * @param {Array} activities - Activities being rendered
   * @param {Object} options - Render options
   * @returns {string} Render key
   */
  generateRenderKey(activities, options) {
    const activityIds = activities.map(a => a.id).join(',');

    // Include repository structure in the key to detect when repos are added/removed
    const repos = [...new Set(activities.map(a => a.repo))].sort().join(',');

    // Handle Set objects in options (like collapsedRepos)
    const processedOptions = {};
    Object.keys(options).forEach(k => {
      if (options[k] instanceof Set) {
        processedOptions[k] = [...options[k]].sort().join(',');
      } else if (Array.isArray(options[k])) {
        processedOptions[k] = [...options[k]].sort().join(',');
      } else {
        processedOptions[k] = options[k];
      }
    });

    const optionKeys = Object.keys(processedOptions).sort().map(k => `${k}:${processedOptions[k]}`).join(',');
    return `${activityIds}|repos:${repos}|${optionKeys}`;
  }

  /**
   * Generate HTML for activities with efficient string building
   * @param {Array} activities - Activities to render
   * @param {Object} options - Render options
   * @returns {string} Generated HTML
   */
  generateActivityHTML(activities, options = {}) {
    const {
      groupByRepo = true,
      collapsedRepos = new Set(),
      pinnedRepos = [],
      readItems = []
    } = options;

    if (activities.length === 0) {
      return `
        <div class="empty-state">
          <p>No activity found</p>
        </div>
      `;
    }

    if (groupByRepo) {
      return this.generateGroupedHTML(activities, collapsedRepos, pinnedRepos, readItems);
    } else {
      return this.generateFlatHTML(activities, readItems);
    }
  }

  /**
   * Generate grouped HTML by repository
   * @param {Array} activities - Activities to group
   * @param {Set} collapsedRepos - Set of collapsed repository names
   * @param {Array} pinnedRepos - Array of pinned repository names
   * @param {Array} readItems - Array of read activity IDs
   * @returns {string} Generated HTML
   */
  generateGroupedHTML(activities, collapsedRepos = new Set(), pinnedRepos = [], readItems = []) {
    const grouped = getSortedRepoGroups(activities, pinnedRepos);
    let html = '';

    for (const [repo, repoActivities] of grouped) {
      const repoUnreadCount = repoActivities.filter(a => !readItems.includes(a.id)).length;
      const isCollapsed = collapsedRepos.has(repo);
      const isPinned = pinnedRepos.includes(repo);

      html += `
        <div class="repo-group">
          <div class="repo-group-header ${isPinned ? 'pinned' : ''}" data-repo="${escapeHtml(repo)}">
            <div class="repo-group-title">
              <button class="repo-collapse-btn" data-repo="${escapeHtml(repo)}" title="${isCollapsed ? 'Expand' : 'Collapse'}" aria-label="${isCollapsed ? 'Expand' : 'Collapse'} ${escapeHtml(repo)} activities">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="chevron ${isCollapsed ? 'collapsed' : ''}">
                  <path d="m6 9 6 6 6-6"/>
                </svg>
              </button>
              <span class="repo-group-name">${escapeHtml(repo)}</span>
              ${repoUnreadCount > 0 ? `<span class="repo-unread-count">${repoUnreadCount}</span>` : ''}
            </div>
            <div class="repo-group-actions">
              <button class="repo-pin-btn ${isPinned ? 'pinned' : ''}" data-repo="${escapeHtml(repo)}" title="${isPinned ? 'Unpin repository' : 'Pin repository'}" aria-label="${isPinned ? 'Unpin' : 'Pin'} ${escapeHtml(repo)} repository">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  ${isPinned
                    ? '<line x1="12" x2="12" y1="17" y2="22"/><path fill="currentColor" d="M5 17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V6h1a2 2 0 0 0 0-4H8a2 2 0 0 0 0 4h1v4.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24Z"/>'
                    : '<line x1="12" x2="12" y1="17" y2="22"/><path d="M5 17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V6h1a2 2 0 0 0 0-4H8a2 2 0 0 0 0 4h1v4.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24Z"/>'}
                </svg>
              </button>
              ${repoUnreadCount > 0 ? `
              <button class="repo-mark-read-btn" data-repo="${escapeHtml(repo)}" title="Mark all as read" aria-label="Mark all ${escapeHtml(repo)} activities as read">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  ${CHECK_ICON}
                </svg>
              </button>` : ''}
              <button class="repo-snooze-btn" data-repo="${escapeHtml(repo)}" title="Snooze this repository" aria-label="Snooze ${escapeHtml(repo)} repository">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  ${SNOOZE_ICON}
                </svg>
              </button>
            </div>
          </div>
          <div class="repo-activities ${isCollapsed ? 'collapsed' : ''}" data-repo="${escapeHtml(repo)}">
            ${repoActivities.map(activity => {
              const isRead = readItems.includes(activity.id);
              return this.generateSingleActivityHTML(activity, isRead);
            }).join('')}
          </div>
        </div>
      `;
    }

    return html;
  }

  /**
   * Generate flat HTML for all activities
   * @param {Array} activities - Activities to render
   * @param {Array} readItems - Array of read activity IDs
   * @returns {string} Generated HTML
   */
  generateFlatHTML(activities, readItems = []) {
    return `
      <div class="activities-list">
        ${activities.map(activity => {
          const isRead = readItems.includes(activity.id);
          return this.generateSingleActivityHTML(activity, isRead);
        }).join('')}
      </div>
    `;
  }

  /**
   * Generate HTML for a single activity
   * @param {Object} activity - Activity data
   * @param {boolean} isRead - Whether activity is read
   * @returns {string} Activity HTML
   */
  generateSingleActivityHTML(activity, isRead = false) {
    const cached = this.itemCache.get(`${activity.id}-${isRead}`);
    if (cached && cached.timestamp > Date.now() - 60000) { // Cache for 1 minute
      return cached.html;
    }

    // Sanitize all user-generated content
    const sanitizedTitle = escapeHtml(activity.title);
    const sanitizedAuthor = escapeHtml(activity.author);
    const sanitizedRepo = escapeHtml(activity.repo);
    const sanitizedType = escapeHtml(activity.type);
    const sanitizedTypeLabel = escapeHtml(getSharedActivityTypeLabel(activity.type));
    const sanitizedDescription = activity.description ? escapeHtml(activity.description) : '';
    const sanitizedAvatar = sanitizeImageUrl(activity.authorAvatar)
      || 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg"%3E%3C/svg%3E';
    const sanitizedUrl = escapeHtml(activity.url);
    const sanitizedId = escapeHtml(activity.id);

    const html = `
      <div class="activity-item ${isRead ? 'read' : 'unread'}" data-id="${sanitizedId}" data-url="${sanitizedUrl}" role="button" tabindex="0" aria-label="Open ${sanitizedTypeLabel}: ${sanitizedTitle} by ${sanitizedAuthor}">
        <img src="${sanitizedAvatar}" class="activity-avatar" alt="${sanitizedAuthor}">
        <div class="activity-content">
          <div class="activity-header">
            <span class="activity-type ${sanitizedType}">${sanitizedTypeLabel}</span>
            <span class="activity-repo">${sanitizedRepo}</span>
          </div>
          <div class="activity-title">${sanitizedTitle}</div>
          ${sanitizedDescription ? `<p class="activity-description">${sanitizedDescription}</p>` : ''}
          <div class="activity-meta">
            by ${sanitizedAuthor} • ${formatSharedRelativeTime(activity.createdAt)}
          </div>
        </div>
        <div class="activity-actions">
          ${!isRead ? `<button class="action-btn mark-read-btn" data-action="mark-read" title="Mark as done" aria-label="Mark ${sanitizedTitle} as done">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M20 6 9 17l-5-5"/>
            </svg>
          </button>` : ''}
        </div>
      </div>
    `;

    this.itemCache.set(`${activity.id}-${isRead}`, {
      html,
      timestamp: Date.now()
    });

    return html;
  }

  /**
   * Clean up old cache entries
   */
  cleanupCache() {
    const now = Date.now();
    for (const [id, cached] of this.itemCache) {
      if (now - cached.timestamp > 300000) { // 5 minutes
        this.itemCache.delete(id);
      }
    }
  }
}

// Utility function to escape HTML
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Export classes and utilities
export { DOMOptimizer, ActivityListRenderer, escapeHtml };
