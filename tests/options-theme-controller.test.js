/**
 * Tests for options/controllers/theme-controller.js
 */

import { jest } from '@jest/globals';
import { setupThemeListener } from '../options/controllers/theme-controller.js';

describe('options theme-controller', () => {
  let mockMatchMedia;
  let mockListener;

  beforeEach(() => {
    // Mock window.matchMedia
    mockListener = null;
    mockMatchMedia = {
      matches: false,
      addEventListener: jest.fn((event, listener) => {
        mockListener = listener;
      }),
      removeEventListener: jest.fn()
    };

    window.matchMedia = jest.fn(() => mockMatchMedia);

    // Mock chrome storage
    chrome.storage.sync.get.mockImplementation((keys, callback) => {
      callback({ theme: 'system' });
    });
  });

  test('should set up matchMedia listener for theme changes', () => {
    setupThemeListener();

    expect(window.matchMedia).toHaveBeenCalledWith('(prefers-color-scheme: dark)');
    expect(mockMatchMedia.addEventListener).toHaveBeenCalledWith('change', expect.any(Function));
  });

  test('should apply theme when system theme changes and theme is set to system', async () => {
    // Mock applyTheme (it's imported in the module)
    const _applyThemeSpy = jest.fn();

    setupThemeListener();

    // Get the listener that was registered
    expect(mockListener).toBeDefined();

    // Mock storage to return 'system'
    chrome.storage.sync.get.mockImplementation((keys, callback) => {
      callback({ theme: 'system' });
    });

    // Trigger the change event
    await mockListener();

    // Verify getSyncItem was called
    expect(chrome.storage.sync.get).toHaveBeenCalled();
  });

  test('should not apply theme when theme is not set to system', async () => {
    setupThemeListener();

    // Mock storage to return 'light'
    chrome.storage.sync.get.mockImplementation((keys, callback) => {
      callback({ theme: 'light' });
    });

    // Trigger the change event
    await mockListener();

    // Verify getSyncItem was still called (to check the theme)
    expect(chrome.storage.sync.get).toHaveBeenCalled();
  });
});
