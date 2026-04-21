import { beforeEach, describe, expect, jest, test } from '@jest/globals';

async function loadThemeBootModule() {
  jest.resetModules();
  return import(`../shared/theme-boot.js?test=${Date.now()}-${Math.random()}`);
}

describe('theme boot', () => {
  beforeEach(() => {
    document.documentElement.className = '';
    document.documentElement.removeAttribute('data-color-theme');
    document.documentElement.style.colorScheme = '';
    document.body.className = '';
    document.body.removeAttribute('data-color-theme');
    localStorage.clear();

    window.matchMedia = jest.fn().mockReturnValue({
      matches: false,
      addEventListener: jest.fn(),
      removeEventListener: jest.fn()
    });

    global.chrome = {
      storage: {
        sync: {
          get: jest.fn((keys, callback) => {
            callback({
              theme: 'dark',
              colorTheme: 'graphite'
            });
          })
        }
      }
    };
  });

  test('hydrates the document theme from cached preferences immediately', async () => {
    localStorage.setItem('devwatch:theme-preferences', JSON.stringify({
      theme: 'dark',
      colorTheme: 'obsidian'
    }));

    await loadThemeBootModule();

    expect(document.documentElement.classList.contains('dark-mode')).toBe(true);
    expect(document.body.classList.contains('dark-mode')).toBe(true);
    expect(document.documentElement.getAttribute('data-color-theme')).toBe('graphite');
    expect(document.body.getAttribute('data-color-theme')).toBe('graphite');
    expect(document.documentElement.style.colorScheme).toBe('dark');
  });

  test('falls back to system + polar when nothing is cached or stored', async () => {
    chrome.storage.sync.get.mockImplementation((keys, callback) => {
      callback({});
    });

    await loadThemeBootModule();

    expect(document.documentElement.classList.contains('dark-mode')).toBe(false);
    expect(document.body.classList.contains('dark-mode')).toBe(false);
    expect(document.documentElement.getAttribute('data-color-theme')).toBe('polar');
    expect(document.body.getAttribute('data-color-theme')).toBe('polar');
    expect(document.documentElement.style.colorScheme).toBe('light');
  });
});
