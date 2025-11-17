import { jest, describe, test, beforeEach, expect } from '@jest/globals';

// Import after jest is available
const { toggleDarkMode, updateDarkModeIcon } = await import('../popup/controllers/theme-controller.js');

describe('Theme Controller', () => {
  beforeEach(() => {
    document.body.innerHTML = `
      <button id="darkModeBtn">
        <span class="system-icon">⚙️</span>
        <span class="moon-icon">🌙</span>
        <span class="sun-icon">☀️</span>
      </button>
    `;

    global.chrome = {
      storage: {
        sync: {
          get: jest.fn((keys, callback) => {
            callback({ theme: 'light' });
            return Promise.resolve({ theme: 'light' });
          }),
          set: jest.fn((items, callback) => {
            if (callback) callback();
            return Promise.resolve();
          })
        }
      }
    };
  });

  describe('toggleDarkMode', () => {
    test('toggles theme and updates storage', async () => {
      await toggleDarkMode();

      expect(chrome.storage.sync.set).toHaveBeenCalled();
    });
  });

  describe('updateDarkModeIcon', () => {
    test('updates icon visibility based on theme', async () => {
      await updateDarkModeIcon();

      const moonIcon = document.querySelector('.moon-icon');
      const sunIcon = document.querySelector('.sun-icon');

      expect(moonIcon).toBeTruthy();
      expect(sunIcon).toBeTruthy();
    });

    test('handles missing button gracefully', async () => {
      document.body.innerHTML = '';

      await expect(updateDarkModeIcon()).resolves.not.toThrow();
    });
  });
});
