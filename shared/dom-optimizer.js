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
    if (currentElement.className !== newElement.className) {
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
      maxItems = UI_CONFIG.MAX_VISIBLE_ACTIVITIES
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
      return this.generateActivityHTML(limitedActivities, { groupByRepo });
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
  generateActivityHTML(activities, { groupByRepo }) {
    if (activities.length === 0) {
      return `
        <div class="empty-state">
          <p>No activity found</p>
        </div>
      `;
    }

    if (groupByRepo) {
      return this.generateGroupedHTML(activities);
    } else {
      return this.generateFlatHTML(activities);
    }
  }

  /**
   * Generate grouped HTML by repository
   * @param {Array} activities - Activities to group
   * @returns {string} Generated HTML
   */
  generateGroupedHTML(activities) {
    const grouped = this.groupActivitiesByRepo(activities);
    let html = '';

    for (const [repo, repoActivities] of grouped) {
      html += `
        <div class="repo-section" data-repo="${escapeHtml(repo)}">
          <h3 class="repo-header">
            <span class="repo-name">${escapeHtml(repo)}</span>
            <span class="repo-count">${repoActivities.length}</span>
          </h3>
          <div class="activities-list">
            ${repoActivities.map(activity => this.generateSingleActivityHTML(activity)).join('')}
          </div>
        </div>
      `;
    }

    return html;
  }

  /**
   * Generate flat HTML for all activities
   * @param {Array} activities - Activities to render
   * @returns {string} Generated HTML
   */
  generateFlatHTML(activities) {
    return `
      <div class="activities-list">
        ${activities.map(activity => this.generateSingleActivityHTML(activity)).join('')}
      </div>
    `;
  }

  /**
   * Generate HTML for a single activity
   * @param {Object} activity - Activity data
   * @returns {string} Activity HTML
   */
  generateSingleActivityHTML(activity) {
    const cached = this.itemCache.get(activity.id);
    if (cached && cached.timestamp > Date.now() - 60000) { // Cache for 1 minute
      return cached.html;
    }

    const html = `
      <div class="activity-item ${activity.type}" data-id="${activity.id}">
        <div class="activity-header">
          <span class="activity-type">${this.getActivityTypeLabel(activity.type)}</span>
          <span class="activity-time">${this.formatTime(activity.createdAt)}</span>
        </div>
        <div class="activity-content">
          <h4 class="activity-title">${escapeHtml(activity.title)}</h4>
          ${activity.description ? `<p class="activity-description">${escapeHtml(activity.description)}</p>` : ''}
        </div>
        <div class="activity-actions">
          <a href="${activity.url}" target="_blank" rel="noopener noreferrer" class="activity-link">View</a>
        </div>
      </div>
    `;

    this.itemCache.set(activity.id, {
      html,
      timestamp: Date.now()
    });

    return html;
  }

  /**
   * Group activities by repository
   * @param {Array} activities - Activities to group
   * @returns {Map} Grouped activities
   */
  groupActivitiesByRepo(activities) {
    const grouped = new Map();

    for (const activity of activities) {
      if (!grouped.has(activity.repo)) {
        grouped.set(activity.repo, []);
      }
      grouped.get(activity.repo).push(activity);
    }

    return grouped;
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