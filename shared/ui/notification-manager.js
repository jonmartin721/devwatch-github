import { escapeHtml } from '../sanitize.js';

/**
 * Toast Notification Manager
 * Singleton class for managing toast notifications across the application
 */
class NotificationManager {
  constructor() {
    if (NotificationManager.instance) {
      return NotificationManager.instance;
    }

    this.container = null;
    this.toasts = new Map();
    this.toastCounter = 0;
    this.lastValidToken = null;
    this.isManualTokenEntry = false;

    NotificationManager.instance = this;
  }

  static getInstance() {
    if (!NotificationManager.instance) {
      NotificationManager.instance = new NotificationManager();
    }
    return NotificationManager.instance;
  }

  init() {
    this.container = document.getElementById('toastContainer');
  }

  show(message, type = 'info', options = {}) {
    if (!this.container) {
      return;
    }

    const {
      duration = type === 'error' ? 8000 : 5000,
      persistent = false,
      action = null
    } = options;

    const toastId = ++this.toastCounter;
    const toast = this.createToast(toastId, message, type, action);

    this.container.appendChild(toast);
    this.toasts.set(toastId, { element: toast, timeout: null });

    // Trigger animation
    requestAnimationFrame(() => {
      toast.classList.add('show');
    });

    // Set up auto-remove
    if (!persistent && duration > 0) {
      this.setupAutoRemove(toastId, duration);
    }

    return toastId;
  }

  createToast(id, message, type, action) {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.dataset.toastId = id;

    const icon = this.getIcon(type);

    let toastHTML = `
      <div class="toast-icon">${icon}</div>
      <div class="toast-message">${escapeHtml(message)}</div>
      <button class="toast-close" aria-label="Close toast">✕</button>
      <div class="toast-progress"></div>
    `;

    if (action) {
      const actionButton = `<button class="toast-action" data-action="${action.id}">${escapeHtml(action.text)}</button>`;
      toastHTML = toastHTML.replace('</div><button class="toast-close">', `</div>${actionButton}<button class="toast-close">`);
    }

    toast.innerHTML = toastHTML;

    // Add event listeners
    const closeBtn = toast.querySelector('.toast-close');
    closeBtn.addEventListener('click', () => this.remove(id));

    const actionBtn = toast.querySelector('.toast-action');
    if (actionBtn && action) {
      actionBtn.addEventListener('click', () => {
        action.handler();
        this.remove(id);
      });
    }

    return toast;
  }

  getIcon(type) {
    const icons = {
      success: '✓',
      error: '✕',
      warning: '⚠',
      info: 'ℹ'
    };
    return icons[type] || icons.info;
  }

  setupAutoRemove(id, duration) {
    const progressBar = document.querySelector(`[data-toast-id="${id}"] .toast-progress`);
    if (progressBar) {
      progressBar.style.transition = `width ${duration}ms linear`;
      requestAnimationFrame(() => {
        progressBar.style.width = '0%';
      });
    }

    const timeout = setTimeout(() => {
      this.remove(id);
    }, duration);

    const toastData = this.toasts.get(id);
    if (toastData) {
      toastData.timeout = timeout;
    }
  }

  remove(id) {
    const toastData = this.toasts.get(id);
    if (!toastData) return;

    const { element, timeout } = toastData;

    // Clear timeout if exists
    if (timeout) {
      clearTimeout(timeout);
    }

    // Add removing animation
    element.classList.add('removing');

    // Remove after animation
    setTimeout(() => {
      if (element.parentNode) {
        element.parentNode.removeChild(element);
      }
      this.toasts.delete(id);
    }, 300);
  }

  // Convenience methods
  success(message, options) {
    return this.show(message, 'success', options);
  }

  error(message, options) {
    return this.show(message, 'error', options);
  }

  warning(message, options) {
    return this.show(message, 'warning', options);
  }

  info(message, options) {
    return this.show(message, 'info', options);
  }

  // Clear all toasts
  clear() {
    this.toasts.forEach((_, id) => this.remove(id));
  }
}

export { NotificationManager };
