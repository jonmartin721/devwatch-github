/**
 * Tests for shared/ui/notification-manager.js
 */

import { jest } from '@jest/globals';
import { NotificationManager } from '../shared/ui/notification-manager.js';

describe('NotificationManager', () => {
  let manager;
  let mockContainer;

  beforeEach(() => {
    // Reset the singleton instance between tests
    NotificationManager.instance = null;

    // Create mock container
    mockContainer = document.createElement('div');
    mockContainer.id = 'toastContainer';
    document.body.appendChild(mockContainer);

    // Mock requestAnimationFrame
    global.requestAnimationFrame = jest.fn((cb) => {
      cb();
      return 1;
    });

    // Mock setTimeout/clearTimeout
    jest.useFakeTimers();

    manager = NotificationManager.getInstance();
    manager.init();
  });

  afterEach(() => {
    document.body.innerHTML = '';
    jest.useRealTimers();
  });

  describe('Singleton pattern', () => {
    test('should return same instance when getInstance() is called multiple times', () => {
      const instance1 = NotificationManager.getInstance();
      const instance2 = NotificationManager.getInstance();

      expect(instance1).toBe(instance2);
    });

    test('should return existing instance when using new constructor', () => {
      // Reset to test constructor behavior
      NotificationManager.instance = null;
      const instance1 = new NotificationManager();
      const instance2 = new NotificationManager();

      expect(instance1).toBe(instance2);
    });
  });

  describe('init()', () => {
    test('should find and store toast container element', () => {
      // Reset singleton and create fresh instance
      NotificationManager.instance = null;
      const newManager = new NotificationManager();
      expect(newManager.container).toBeNull();

      newManager.init();
      expect(newManager.container).toBe(mockContainer);

      // Restore for other tests
      manager = NotificationManager.getInstance();
      manager.init();
    });
  });

  describe('show()', () => {
    test('should create and display a toast', () => {
      const toastId = manager.show('Test message');

      expect(toastId).toBe(1);
      expect(mockContainer.children.length).toBe(1);

      const toast = mockContainer.children[0];
      expect(toast.classList.contains('toast')).toBe(true);
      expect(toast.classList.contains('info')).toBe(true);
      expect(toast.textContent).toContain('Test message');
    });

    test('should return early if container is not initialized', () => {
      manager.container = null;
      const toastId = manager.show('Test');

      expect(toastId).toBeUndefined();
      expect(mockContainer.children.length).toBe(0);
    });

    test('should create toast with different types', () => {
      manager.show('Success', 'success');
      manager.show('Error', 'error');
      manager.show('Warning', 'warning');

      const toasts = mockContainer.children;
      expect(toasts[0].classList.contains('success')).toBe(true);
      expect(toasts[1].classList.contains('error')).toBe(true);
      expect(toasts[2].classList.contains('warning')).toBe(true);
    });

    test('should use default duration for info toasts (5000ms)', () => {
      manager.show('Info message', 'info');

      // Fast-forward time
      jest.advanceTimersByTime(5000);

      // Toast should be removing
      const toast = mockContainer.children[0];
      expect(toast.classList.contains('removing')).toBe(true);
    });

    test('should use longer duration for error toasts (8000ms)', () => {
      manager.show('Error message', 'error');

      // Fast-forward partial time
      jest.advanceTimersByTime(5000);
      expect(mockContainer.children[0].classList.contains('removing')).toBe(false);

      // Fast-forward full time
      jest.advanceTimersByTime(3000);
      expect(mockContainer.children[0].classList.contains('removing')).toBe(true);
    });

    test('should not auto-remove persistent toasts', () => {
      manager.show('Persistent', 'info', { persistent: true });

      jest.advanceTimersByTime(10000);

      expect(mockContainer.children[0].classList.contains('removing')).toBe(false);
    });

    test('should support custom duration', () => {
      manager.show('Custom duration', 'info', { duration: 2000 });

      jest.advanceTimersByTime(2000);

      expect(mockContainer.children[0].classList.contains('removing')).toBe(true);
    });

    test('should create toast with action button', () => {
      const actionHandler = jest.fn();
      manager.show('Message with action', 'info', {
        action: {
          id: 'test-action',
          text: 'Click me',
          handler: actionHandler
        }
      });

      const toast = mockContainer.children[0];
      const actionBtn = toast.querySelector('.toast-action');

      // Action button should be present
      expect(actionBtn).not.toBeNull();
      expect(actionBtn.textContent).toBe('Click me');

      // Click the action button
      actionBtn.click();

      expect(actionHandler).toHaveBeenCalled();
      expect(toast.classList.contains('removing')).toBe(true);
    });

    test('should escape HTML in messages', () => {
      manager.show('<script>alert("xss")</script>');

      const toast = mockContainer.children[0];
      const messageDiv = toast.querySelector('.toast-message');

      expect(messageDiv.textContent).toContain('<script>');
      expect(messageDiv.innerHTML).not.toContain('<script>alert');
    });

    test('should escape HTML in action button text', () => {
      manager.show('Test', 'info', {
        action: {
          id: 'test',
          text: '<img src=x onerror=alert(1)>',
          handler: () => {}
        }
      });

      const actionBtn = mockContainer.querySelector('.toast-action');
      expect(actionBtn).not.toBeNull();
      expect(actionBtn.textContent).toContain('<img');
      expect(actionBtn.innerHTML).not.toContain('<img src=');
    });
  });

  describe('createToast()', () => {
    test('should create toast with correct structure', () => {
      const toast = manager.createToast(1, 'Test', 'info', null);

      expect(toast.className).toBe('toast info');
      expect(toast.dataset.toastId).toBe('1');
      expect(toast.querySelector('.toast-icon')).not.toBeNull();
      expect(toast.querySelector('.toast-message')).not.toBeNull();
      expect(toast.querySelector('.toast-close')).not.toBeNull();
      expect(toast.querySelector('.toast-progress')).not.toBeNull();
    });

    test('should attach close button listener', () => {
      const toast = manager.createToast(1, 'Test', 'info', null);
      const closeBtn = toast.querySelector('.toast-close');

      mockContainer.appendChild(toast);
      manager.toasts.set(1, { element: toast, timeout: null });

      closeBtn.click();

      expect(toast.classList.contains('removing')).toBe(true);
    });
  });

  describe('getIcon()', () => {
    test('should return correct icons for each type', () => {
      expect(manager.getIcon('success')).toBe('✓');
      expect(manager.getIcon('error')).toBe('✕');
      expect(manager.getIcon('warning')).toBe('⚠');
      expect(manager.getIcon('info')).toBe('ℹ');
    });

    test('should return info icon for unknown types', () => {
      expect(manager.getIcon('unknown')).toBe('ℹ');
    });
  });

  describe('remove()', () => {
    test('should remove toast from DOM and map', () => {
      const toastId = manager.show('Test');
      expect(manager.toasts.size).toBe(1);

      manager.remove(toastId);

      // Fast-forward animation time
      jest.advanceTimersByTime(300);

      expect(mockContainer.children.length).toBe(0);
      expect(manager.toasts.size).toBe(0);
    });

    test('should do nothing if toast does not exist', () => {
      manager.remove(999);
      // Should not throw error
      expect(manager.toasts.size).toBe(0);
    });

    test('should clear timeout when removing toast', () => {
      const clearTimeoutSpy = jest.spyOn(global, 'clearTimeout');
      const toastId = manager.show('Test', 'info');

      const toastData = manager.toasts.get(toastId);
      expect(toastData.timeout).not.toBeNull();

      manager.remove(toastId);

      // Timeout should be cleared
      expect(clearTimeoutSpy).toHaveBeenCalledWith(toastData.timeout);
      expect(mockContainer.children[0].classList.contains('removing')).toBe(true);

      clearTimeoutSpy.mockRestore();
    });
  });

  describe('Convenience methods', () => {
    test('success() should create success toast', () => {
      manager.success('Success!');

      const toast = mockContainer.children[0];
      expect(toast.classList.contains('success')).toBe(true);
      expect(toast.textContent).toContain('Success!');
    });

    test('error() should create error toast', () => {
      manager.error('Error!');

      const toast = mockContainer.children[0];
      expect(toast.classList.contains('error')).toBe(true);
      expect(toast.textContent).toContain('Error!');
    });

    test('warning() should create warning toast', () => {
      manager.warning('Warning!');

      const toast = mockContainer.children[0];
      expect(toast.classList.contains('warning')).toBe(true);
      expect(toast.textContent).toContain('Warning!');
    });

    test('info() should create info toast', () => {
      manager.info('Info!');

      const toast = mockContainer.children[0];
      expect(toast.classList.contains('info')).toBe(true);
      expect(toast.textContent).toContain('Info!');
    });

    test('convenience methods should pass options correctly', () => {
      manager.success('Persistent success', { persistent: true });

      jest.advanceTimersByTime(10000);

      expect(mockContainer.children[0].classList.contains('removing')).toBe(false);
    });
  });

  describe('clear()', () => {
    test('should remove all toasts', () => {
      manager.show('Toast 1');
      manager.show('Toast 2');
      manager.show('Toast 3');

      expect(manager.toasts.size).toBe(3);

      manager.clear();

      expect(mockContainer.querySelectorAll('.removing').length).toBe(3);

      // Fast-forward to remove all
      jest.advanceTimersByTime(300);

      expect(manager.toasts.size).toBe(0);
    });
  });

  describe('setupAutoRemove()', () => {
    test('should set progress bar transition', () => {
      const _toastId = manager.show('Test');
      const progressBar = mockContainer.querySelector('.toast-progress');

      expect(progressBar.style.transition).toContain('5000ms');
    });

    test('should handle missing progress bar gracefully', () => {
      const toastId = manager.show('Test');
      const toast = mockContainer.children[0];

      // Remove progress bar
      const progressBar = toast.querySelector('.toast-progress');
      progressBar.remove();

      // Should not throw when trying to set transition
      manager.setupAutoRemove(toastId, 1000);
    });
  });
});
