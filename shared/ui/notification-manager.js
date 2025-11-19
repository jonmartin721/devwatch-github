/**
 * Toast Notification Manager
 * Singleton class for managing toast notifications across the application
 * Note: Using textContent for text insertion provides automatic XSS protection
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

    // Build toast structure
    const toastIcon = document.createElement('div');
    toastIcon.className = 'toast-icon';
    toastIcon.textContent = icon;

    const toastMessage = document.createElement('div');
    toastMessage.className = 'toast-message';
    toastMessage.textContent = message;

    const closeBtn = document.createElement('button');
    closeBtn.className = 'toast-close';
    closeBtn.setAttribute('aria-label', 'Close toast');
    closeBtn.textContent = '✕';

    const progressBar = document.createElement('div');
    progressBar.className = 'toast-progress';

    // Append elements in order
    toast.appendChild(toastIcon);
    toast.appendChild(toastMessage);

    // Add action button if provided
    if (action) {
      const actionBtn = document.createElement('button');
      actionBtn.className = 'toast-action';
      actionBtn.setAttribute('data-action', action.id);
      actionBtn.textContent = action.text;
      toast.appendChild(actionBtn);
    }

    toast.appendChild(closeBtn);
    toast.appendChild(progressBar);

    // Add event listeners
    closeBtn.addEventListener('click', () => this.remove(id));

    if (action) {
      const actionBtn = toast.querySelector('.toast-action');
      if (actionBtn) {
        actionBtn.addEventListener('click', () => {
          action.handler();
          this.remove(id);
        });
      }
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
