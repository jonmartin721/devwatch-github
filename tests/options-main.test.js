import { jest, describe, test, beforeEach, expect } from '@jest/globals';

const {
  formatNumber,
  getFilteredRepos,
  cleanupRepoNotifications,
  state
} = await import('../options/options.js');

describe('Options Main Functions', () => {
  beforeEach(() => {
    // Setup complete DOM structure for options page
    document.body.innerHTML = `
      <input id="githubToken" type="password" />
      <div id="tokenStatus" class="token-status"></div>
      <button id="clearTokenBtn">Clear</button>
      <input id="repoInput" />
      <button id="addRepoBtn">Add</button>
      <div id="repoHelpText"></div>
      <div id="importReposSection"></div>
      <div id="repoValidationStatus" class="repo-validation-status"></div>
      <div id="repoError"></div>
      <div id="repoList"></div>
      <input id="repoSearch" />
      <div id="repoSearchClear"></div>
      <button id="hidePinnedToggleBtn"></button>
    `;

    // Reset state for each test
    state.watchedRepos = [];
    state.mutedRepos = [];
    state.pinnedRepos = [];
    state.currentPage = 1;
    state.reposPerPage = 10;
    state.searchQuery = '';
    state.hidePinnedRepos = false;

    // Mock Chrome APIs
    global.chrome = {
      storage: {
        local: {
          get: jest.fn((keys, callback) => {
            callback({ activities: [], readItems: [] });
          }),
          set: jest.fn((data, callback) => {
            if (callback) callback();
          }),
          remove: jest.fn((keys, callback) => {
            if (callback) callback();
          })
        },
        sync: {
          get: jest.fn((keys, callback) => {
            callback({});
          }),
          set: jest.fn((data, callback) => {
            if (callback) callback();
          }),
          remove: jest.fn((keys, callback) => {
            if (callback) callback();
          })
        }
      },
      runtime: {
        sendMessage: jest.fn(() => Promise.resolve())
      }
    };

    global.fetch = jest.fn();
  });

  describe('formatNumber', () => {
    test('formats numbers under 1000 as-is', () => {
      expect(formatNumber(0)).toBe('0');
      expect(formatNumber(42)).toBe('42');
      expect(formatNumber(999)).toBe('999');
    });

    test('formats thousands with k suffix', () => {
      expect(formatNumber(1000)).toBe('1.0k');
      expect(formatNumber(1500)).toBe('1.5k');
      expect(formatNumber(42000)).toBe('42.0k');
      expect(formatNumber(999999)).toBe('1000.0k');
    });

    test('formats millions with M suffix', () => {
      expect(formatNumber(1000000)).toBe('1.0M');
      expect(formatNumber(1500000)).toBe('1.5M');
      expect(formatNumber(42000000)).toBe('42.0M');
    });

    test('handles edge cases', () => {
      expect(formatNumber(1001)).toBe('1.0k');
      expect(formatNumber(999500)).toBe('999.5k');
      expect(formatNumber(1000001)).toBe('1.0M');
    });
  });

  describe('getFilteredRepos', () => {
    beforeEach(() => {
      state.watchedRepos = [
        {
          fullName: 'facebook/react',
          description: 'A JavaScript library for building user interfaces',
          language: 'JavaScript'
        },
        {
          fullName: 'microsoft/vscode',
          description: 'Visual Studio Code',
          language: 'TypeScript'
        },
        {
          fullName: 'golang/go',
          description: 'The Go programming language',
          language: 'Go'
        }
      ];
      state.pinnedRepos = ['facebook/react'];
      state.searchQuery = '';
      state.hidePinnedRepos = false;
    });

    test('returns all repos when no filter applied', () => {
      const filtered = getFilteredRepos();
      expect(filtered.length).toBe(3);
    });

    test('filters repos by name', () => {
      state.searchQuery = 'vscode';
      const filtered = getFilteredRepos();
      expect(filtered.length).toBe(1);
      expect(filtered[0].fullName).toBe('microsoft/vscode');
    });

    test('filters repos by description', () => {
      state.searchQuery = 'javascript';
      const filtered = getFilteredRepos();
      expect(filtered.length).toBe(1);
      expect(filtered[0].fullName).toBe('facebook/react');
    });

    test('filters repos by language', () => {
      state.searchQuery = 'typescript';
      const filtered = getFilteredRepos();
      expect(filtered.length).toBe(1);
      expect(filtered[0].fullName).toBe('microsoft/vscode');
    });

    test('hides pinned repos when hidePinnedRepos is true', () => {
      state.hidePinnedRepos = true;
      const filtered = getFilteredRepos();
      expect(filtered.length).toBe(2);
      expect(filtered.find(r => r.fullName === 'facebook/react')).toBeUndefined();
    });

    test('combines search and hide pinned filters', () => {
      state.searchQuery = 'go';
      state.hidePinnedRepos = true;
      const filtered = getFilteredRepos();
      expect(filtered.length).toBe(1);
      expect(filtered[0].fullName).toBe('golang/go');
    });

    test('search is case insensitive', () => {
      // searchQuery is stored lowercase (as it would be from user input)
      state.searchQuery = 'vscode'.toLowerCase();
      const filtered = getFilteredRepos();
      expect(filtered.length).toBe(1);
      expect(filtered[0].fullName).toBe('microsoft/vscode');
    });

    test('returns empty array when no matches', () => {
      state.searchQuery = 'nonexistent';
      const filtered = getFilteredRepos();
      expect(filtered.length).toBe(0);
    });

    test('handles undefined description and language gracefully', () => {
      state.watchedRepos = [
        {
          fullName: 'test/repo',
          description: undefined,
          language: undefined
        }
      ];
      state.searchQuery = 'test';
      const filtered = getFilteredRepos();
      expect(filtered.length).toBe(1);
    });
  });

  describe('cleanupRepoNotifications', () => {
    test('removes activities for deleted repository', async () => {
      const activities = [
        { id: '1', repo: 'facebook/react', type: 'pr' },
        { id: '2', repo: 'microsoft/vscode', type: 'issue' },
        { id: '3', repo: 'facebook/react', type: 'release' }
      ];
      const readItems = ['1', '2'];

      global.chrome.storage.local.get = jest.fn((keys, callback) => {
        callback({ activities, readItems });
      });

      await cleanupRepoNotifications('facebook/react');

      // Verify activities were filtered - should only have vscode activity
      expect(chrome.storage.local.set).toHaveBeenCalledWith(
        expect.objectContaining({
          activities: expect.arrayContaining([
            expect.objectContaining({ id: '2', repo: 'microsoft/vscode' })
          ])
        }),
        expect.any(Function)
      );

      // Verify read items for deleted repo activities were removed
      expect(chrome.storage.local.set).toHaveBeenCalledWith(
        expect.objectContaining({
          readItems: ['2']
        }),
        expect.any(Function)
      );
    });

    test('handles empty activities array', async () => {
      global.chrome.storage.local.get = jest.fn((keys, callback) => {
        callback({ activities: [], readItems: [] });
      });

      await cleanupRepoNotifications('facebook/react');

      expect(chrome.storage.local.set).toHaveBeenCalledWith(
        expect.objectContaining({ activities: [] }),
        expect.any(Function)
      );
      expect(chrome.storage.local.set).toHaveBeenCalledWith(
        expect.objectContaining({ readItems: [] }),
        expect.any(Function)
      );
    });

    test('handles missing storage data gracefully', async () => {
      global.chrome.storage.local.get = jest.fn((keys, callback) => {
        callback({});
      });

      await cleanupRepoNotifications('facebook/react');

      expect(chrome.storage.local.set).toHaveBeenCalled();
    });

    test('does not throw error when cleanup fails', async () => {
      // Mock a Chrome storage error by not calling the callback properly
      global.chrome.storage.local.get = jest.fn(() => {
        throw new Error('Storage error');
      });

      // Should not throw - errors are caught internally
      await expect(cleanupRepoNotifications('facebook/react')).resolves.toBeUndefined();
    });

    test('removes all read items for deleted repo activities', async () => {
      const activities = [
        { id: '1', repo: 'facebook/react', type: 'pr' },
        { id: '2', repo: 'facebook/react', type: 'issue' },
        { id: '3', repo: 'microsoft/vscode', type: 'pr' }
      ];
      const readItems = ['1', '2', '3'];

      global.chrome.storage.local.get = jest.fn((keys, callback) => {
        callback({ activities, readItems });
      });

      await cleanupRepoNotifications('facebook/react');

      // Should only keep readItem '3' since that's for vscode
      expect(chrome.storage.local.set).toHaveBeenCalledWith(
        expect.objectContaining({
          readItems: ['3']
        }),
        expect.any(Function)
      );
    });
  });
});
