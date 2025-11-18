/**
 * Basic DOM utilities for activity rendering
 * Provides simple caching and DOM manipulation helpers
 */

import { UI_CONFIG } from './config.js';

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
          // Child might have already been removed
          console.warn('Failed to remove child:', e);
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

  /**
   * Render activities list with efficient updates
   * @param {Array<Object>} activities - Activities to render
   * @param {Object} options - Rendering options
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
      return; // No changes needed
    }

    this.lastRenderedData = renderKey;

    // Schedule optimized render
    this.optimizer.scheduleRender(() => {
      return this.generateActivityHTML(limitedActivities, {
        groupByRepo,
        collapsedRepos,
        pinnedRepos,
        readItems
      });
    });
  }

  /**
   * Generate a unique key for the current render state
   * @param {Array} activities - Activities being rendered
   * @param {Object} options - Render options
   * @returns {string} Render key
   */
  generateRenderKey(activities, options) {
    const activityIds = activities.map(a => a.id).join(',');
    const optionKeys = Object.keys(options).sort().map(k => `${k}:${options[k]}`).join(',');
    return `${activityIds}|${optionKeys}`;
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
    const grouped = this.groupActivitiesByRepo(activities, pinnedRepos);
    let html = '';

    for (const [repo, repoActivities] of grouped) {
      const repoUnreadCount = repoActivities.filter(a => !readItems.includes(a.id)).length;
      const isCollapsed = collapsedRepos.has(repo);
      const isPinned = pinnedRepos.includes(repo);

      html += `
        <div class="repo-group-header ${isPinned ? 'pinned' : ''}" data-repo="${escapeHtml(repo)}">
          <div class="repo-group-title">
            <button class="repo-collapse-btn" data-repo="${escapeHtml(repo)}" title="${isCollapsed ? 'Expand' : 'Collapse'}" aria-label="${isCollapsed ? 'Expand' : 'Collapse'} ${escapeHtml(repo)} activities">
              <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor" class="chevron ${isCollapsed ? 'collapsed' : ''}">
                <path d="M4.427 7.427l3.396 3.396a.25.25 0 00.354 0l3.396-3.396A.25.25 0 0011.396 7H4.604a.25.25 0 00-.177.427z"/>
              </svg>
            </button>
            <span class="repo-group-name">${escapeHtml(repo)}</span>
            <span class="repo-count">${repoActivities.length}</span>
          </div>
          <div class="repo-group-actions">
            <button class="repo-pin-btn ${isPinned ? 'pinned' : ''}" data-repo="${escapeHtml(repo)}" title="${isPinned ? 'Unpin repository' : 'Pin repository'}" aria-label="${isPinned ? 'Unpin' : 'Pin'} ${escapeHtml(repo)} repository">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                ${isPinned
                  ? '<path d="M4.456.734a1.75 1.75 0 012.826.504l.613 1.327a3.081 3.081 0 002.084 1.707l2.454.584c1.332.317 1.8 1.972.832 2.94L11.06 10l3.72 3.72a.75.75 0 11-1.061 1.06L10 11.06l-2.204 2.205c-.968.968-2.623.5-2.94-.832l-.584-2.454a3.081 3.081 0 00-1.707-2.084l-1.327-.613a1.75 1.75 0 01-.504-2.826L4.456.734z"/>'
                  : '<path d="M4.456.734a1.75 1.75 0 012.826.504l.613 1.327a3.081 3.081 0 002.084 1.707l2.454.584c1.332.317 1.8 1.972.832 2.94L11.06 10l3.72 3.72a.75.75 0 11-1.061 1.06L10 11.06l-2.204 2.205c-.968.968-2.623.5-2.94-.832l-.584-2.454a3.081 3.081 0 00-1.707-2.084l-1.327-.613a1.75 1.75 0 01-.504-2.826L4.456.734zM5.92 1.866a.25.25 0 00-.404-.072L1.794 5.516a.25.25 0 00.072.404l1.328.613A4.582 4.582 0 015.73 9.63l.584 2.454a.25.25 0 00.42.12l5.47-5.47a.25.25 0 00-.12-.42L9.63 5.73a4.581 4.581 0 01-3.098-2.537L5.92 1.866z"/>'}
              </svg>
            </button>
            ${repoUnreadCount > 0 ? `<span class="repo-unread-count">${repoUnreadCount}</span>` : ''}
            <button class="repo-snooze-btn" data-repo="${escapeHtml(repo)}" title="Snooze this repository" aria-label="Snooze ${escapeHtml(repo)} repository">
              <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
                <path d="M.5 2.75A.75.75 0 011.25 2h2.5a.75.75 0 010 1.5h-2.5A.75.75 0 01.5 2.75zm4.5 4a.75.75 0 01.75-.75h4.5a.75.75 0 010 1.5h-4.5A.75.75 0 015 6.75zM2.25 11.5a.75.75 0 000 1.5h2.5a.75.75 0 000-1.5h-2.5zM11 7a1.5 1.5 0 100 3 1.5 1.5 0 000-3zm-5.5 1.5a.75.75 0 000 1.5h.5a.75.75 0 000-1.5h-.5z"/>
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
    const sanitizedTypeLabel = escapeHtml(this.getActivityTypeLabel(activity.type));
    const sanitizedDescription = activity.description ? escapeHtml(activity.description) : '';
    const sanitizedAvatar = activity.authorAvatar || 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg"%3E%3C/svg%3E';
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
            by ${sanitizedAuthor} • ${this.formatTime(activity.createdAt)}
          </div>
        </div>
        <div class="activity-actions">
          <button class="action-btn mark-read-btn" data-action="mark-read" title="Mark as done" aria-label="Mark ${sanitizedTitle} as done">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
              <path d="M13.78 4.22a.75.75 0 010 1.06l-7.25 7.25a.75.75 0 01-1.06 0L2.22 9.28a.75.75 0 011.06-1.06L6 10.94l6.72-6.72a.75.75 0 011.06 0z"/>
            </svg>
          </button>
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
   * Group activities by repository
   * @param {Array} activities - Activities to group
   * @param {Array} pinnedRepos - Array of pinned repository names
   * @returns {Map} Grouped activities sorted with pinned repos first
   */
  groupActivitiesByRepo(activities, pinnedRepos = []) {
    const groups = {};

    // Group activities by repo
    for (const activity of activities) {
      if (!groups[activity.repo]) {
        groups[activity.repo] = [];
      }
      groups[activity.repo].push(activity);
    }

    // Sort repos: pinned first, then by most recent activity
    const sortedGroupsMap = new Map();
    Object.keys(groups)
      .sort((a, b) => {
        const aIsPinned = pinnedRepos.includes(a);
        const bIsPinned = pinnedRepos.includes(b);

        // Pinned repos come first
        if (aIsPinned && !bIsPinned) return -1;
        if (!aIsPinned && bIsPinned) return 1;

        // If both pinned or both not pinned, sort by most recent activity
        const latestA = new Date(groups[a][0].createdAt);
        const latestB = new Date(groups[b][0].createdAt);
        return latestB - latestA;
      })
      .forEach(repo => {
        // Sort activities within each repo by newest first
        groups[repo].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
        sortedGroupsMap.set(repo, groups[repo]);
      });

    return sortedGroupsMap;
  }

  /**
   * Get human-readable activity type label
   * @param {string} type - Activity type
   * @returns {string} Type label
   */
  getActivityTypeLabel(type) {
    const labels = {
      'PullRequestEvent': 'Pull Request',
      'IssuesEvent': 'Issue',
      'ReleaseEvent': 'Release',
      'PushEvent': 'Push',
      'IssueCommentEvent': 'Comment'
    };
    return labels[type] || type;
  }

  /**
   * Format time for display
   * @param {string} timestamp - ISO timestamp
   * @returns {string} Formatted time
   */
  formatTime(timestamp) {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;

    return date.toLocaleDateString();
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