import { TextEncoder, TextDecoder } from 'node:util';
import { jest, describe, test, beforeEach, afterEach, expect } from '@jest/globals';

const {
  formatNumber,
  getFilteredRepos,
  cleanupRepoNotifications,
  loadSettings,
  setupEventListeners,
  shouldClearStoredToken,
  syncTokenUiWithStoredCredential,
  state
} = await import('../options/options.js');

describe('Options Main Functions', () => {
  beforeEach(() => {
    // Setup complete DOM structure for options page
    document.body.innerHTML = `
      <button id="connectGitHubBtn">Connect GitHub</button>
      <div id="deviceCodeSection" class="hidden" style="display: none;">
        <input id="githubToken" type="text" />
      </div>
      <div id="tokenStatus" class="token-status"></div>
      <button id="clearTokenBtn">Disconnect</button>
      <input id="repoInput" />
      <button id="addRepoBtn">Add</button>
      <div id="repoHelpText"></div>
      <div id="importReposSection"></div>
      <div id="repoValidationStatus" class="repo-validation-status"></div>
      <div id="repoError"></div>
      <div id="repoList"></div>
      <div id="repoCountBadge"></div>
      <div id="paginationControls"></div>
      <button id="prevPage"></button>
      <button id="nextPage"></button>
      <div id="pageInfo"></div>
      <input id="repoSearch" />
      <div id="repoSearchClear"></div>
      <button id="hidePinnedToggleBtn"></button>
      <button id="hidePinnedToggleBtn2"></button>
      <input id="filterPrs" type="checkbox" />
      <input id="filterIssues" type="checkbox" />
      <input id="filterReleases" type="checkbox" />
      <input id="notifyPrs" type="checkbox" />
      <input id="notifyIssues" type="checkbox" />
      <input id="notifyReleases" type="checkbox" />
      <input id="theme-light" name="theme" type="radio" value="light" />
      <input id="theme-dark" name="theme" type="radio" value="dark" />
      <input id="theme-system" name="theme" type="radio" value="system" />
      <input id="interval-15" name="checkInterval" type="radio" value="15" />
      <input id="snooze-1" name="snoozeHours" type="radio" value="1" />
      <input id="itemExpiryEnabled" type="checkbox" />
      <input id="itemExpiryHours" />
      <div id="itemExpiryInputRow"></div>
      <input id="markReadOnSnooze" type="checkbox" />
      <input id="allowUnlimitedRepos" type="checkbox" />
      <div id="snoozedReposList"></div>
      <button id="importWatchedBtn"></button>
      <button id="importStarredBtn"></button>
      <button id="importParticipatingBtn"></button>
      <button id="importMineBtn"></button>
      <button id="importBtn"></button>
      <input id="importFileInput" type="file" />
      <button id="exportBtn"></button>
      <button id="closeImportModal"></button>
      <button id="cancelImportBtn"></button>
      <button id="confirmImportBtn"></button>
      <input id="selectAllImport" type="checkbox" />
      <input id="importRepoSearch" />
      <div id="importSearchClear"></div>
      <div id="importModal"></div>
      <button id="clearCacheBtn"></button>
      <button id="clearAllDataBtn"></button>
      <button id="resetSettingsBtn"></button>
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
            const requestedKeys = Array.isArray(keys) ? keys : [keys];
            const result = {};

            requestedKeys.forEach((key) => {
              if (key === 'activities') {
                result.activities = [];
              }
              if (key === 'readItems') {
                result.readItems = [];
              }
              if (key === 'githubOAuthClientId') {
                result.githubOAuthClientId = 'Iv1.test-client-id';
              }
              if (key === 'encryptedGithubAuthSession') {
                result.encryptedGithubAuthSession = null;
              }
            });

            callback(result);
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
            const result = {};
            if (callback) {
              callback(result);
              return;
            }
            return Promise.resolve(result);
          }),
          set: jest.fn((data, callback) => {
            if (callback) callback();
            return Promise.resolve();
          }),
          remove: jest.fn((keys, callback) => {
            if (callback) callback();
            return Promise.resolve();
          })
        },
        session: {
          get: jest.fn((keys, callback) => {
            if (callback) callback({});
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
      },
      tabs: {
        create: jest.fn()
      }
    };

    global.fetch = jest.fn();
    global.confirm = jest.fn(() => true);
    window.matchMedia = jest.fn().mockReturnValue({
      matches: false,
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
      addListener: jest.fn(),
      removeListener: jest.fn()
    });
    Object.defineProperty(global, 'crypto', {
      configurable: true,
      value: {
        getRandomValues: jest.fn((array) => {
          array.fill(1);
          return array;
        }),
        subtle: {
          generateKey: jest.fn(async () => ({ mockKey: true })),
          importKey: jest.fn(async () => ({ mockKey: true })),
          exportKey: jest.fn(async () => new Uint8Array([1, 2, 3, 4]).buffer),
          encrypt: jest.fn(async () => new Uint8Array([9, 8, 7]).buffer),
          decrypt: jest.fn(async () => new TextEncoder().encode('decrypted-token').buffer)
        }
      }
    });
    Object.defineProperty(global, 'TextEncoder', {
      configurable: true,
      value: TextEncoder
    });
    Object.defineProperty(global, 'TextDecoder', {
      configurable: true,
      value: TextDecoder
    });
  });

  afterEach(() => {
    jest.useRealTimers();
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

  describe('token persistence helpers', () => {
    test('only clears stored tokens for invalid credentials', () => {
      expect(shouldClearStoredToken({ isValid: false, reason: 'invalid' })).toBe(true);
      expect(shouldClearStoredToken({ isValid: false, reason: 'network' })).toBe(false);
      expect(shouldClearStoredToken({ isValid: false, reason: 'http', status: 500 })).toBe(false);
      expect(shouldClearStoredToken({ isValid: true, user: 'testuser' })).toBe(false);
    });

    test('restores authenticated UI when a stored session exists', () => {
      const clearBtn = document.getElementById('clearTokenBtn');
      const connectBtn = document.getElementById('connectGitHubBtn');
      const repoInput = document.getElementById('repoInput');
      const addBtn = document.getElementById('addRepoBtn');
      const helpText = document.getElementById('repoHelpText');
      const importSection = document.getElementById('importReposSection');

      clearBtn.style.display = 'none';
      repoInput.disabled = true;
      addBtn.disabled = true;
      helpText.textContent = 'GitHub sign-in expired or was revoked. Reconnect GitHub and try again.';
      importSection.classList.add('hidden');
      importSection.style.display = 'none';

      syncTokenUiWithStoredCredential(true);

      expect(connectBtn.textContent).toBe('Reconnect GitHub');
      expect(clearBtn.style.display).toBe('block');
      expect(repoInput.disabled).toBe(false);
      expect(addBtn.disabled).toBe(false);
      expect(helpText.textContent).toContain('Add repositories to monitor');
      expect(importSection.classList.contains('hidden')).toBe(false);
      expect(importSection.style.display).toBe('block');
    });

    test('restores unauthenticated UI when no stored token is available', () => {
      const clearBtn = document.getElementById('clearTokenBtn');
      const connectBtn = document.getElementById('connectGitHubBtn');
      const repoInput = document.getElementById('repoInput');
      const addBtn = document.getElementById('addRepoBtn');
      const helpText = document.getElementById('repoHelpText');
      const importSection = document.getElementById('importReposSection');

      syncTokenUiWithStoredCredential(false);

      expect(connectBtn.textContent).toBe('Connect GitHub');
      expect(clearBtn.style.display).toBe('none');
      expect(repoInput.disabled).toBe(true);
      expect(addBtn.disabled).toBe(true);
      expect(helpText.textContent).toContain('Connect GitHub above');
      expect(importSection.classList.contains('hidden')).toBe(true);
      expect(importSection.style.display).toBe('none');
    });

    test('loadSettings restores a stored auth session', async () => {
      chrome.storage.session.get.mockImplementation((keys, callback) => {
        callback({
          githubAuthSession: {
            accessToken: 'persisted-token',
            username: 'persisted-user'
          }
        });
      });
      chrome.storage.sync.get.mockImplementation((keys, callback) => {
        const result = Array.isArray(keys) && keys.includes('snoozedRepos')
          ? { snoozedRepos: [] }
          : {};
        if (callback) {
          callback(result);
          return;
        }
        return Promise.resolve(result);
      });

      await loadSettings();

      expect(document.getElementById('tokenStatus').textContent).toContain('persisted-user');
      expect(document.getElementById('connectGitHubBtn').textContent).toBe('Reconnect GitHub');
      expect(document.getElementById('clearTokenBtn').style.display).toBe('block');
      expect(document.getElementById('repoInput').disabled).toBe(false);
    });

    test('setupEventListeners clears persisted auth after the disconnect action succeeds', async () => {
      setupEventListeners();

      document.getElementById('clearTokenBtn').click();
      await Promise.resolve();

      expect(chrome.storage.session.remove).toHaveBeenCalledWith(['githubAuthSession'], expect.any(Function));
      expect(chrome.storage.local.set).toHaveBeenCalledWith(
        expect.objectContaining({ encryptedGithubAuthSession: null }),
        expect.any(Function)
      );
    });

    test('connect button starts the device flow and stores the session', async () => {
      setupEventListeners();

      global.fetch
        .mockResolvedValueOnce({
          ok: true,
          text: async () => JSON.stringify({
            device_code: 'device-code',
            user_code: 'ABCD-EFGH',
            verification_uri: 'https://github.com/login/device',
            expires_in: 900,
            interval: 0
          })
        })
        .mockResolvedValueOnce({
          ok: true,
          text: async () => JSON.stringify({
            access_token: 'oauth-token',
            token_type: 'bearer',
            scope: 'repo read:user'
          })
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ login: 'new-user' })
        });

      document.getElementById('connectGitHubBtn').click();
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
      await new Promise(resolve => setTimeout(resolve, 0));

      expect(document.getElementById('clearTokenBtn').style.display).toBe('block');
      expect(document.getElementById('repoInput').disabled).toBe(false);
      expect(document.getElementById('addRepoBtn').disabled).toBe(false);
      expect(chrome.storage.session.set).toHaveBeenCalledWith(
        expect.objectContaining({
          githubAuthSession: expect.objectContaining({
            accessToken: 'oauth-token',
            username: 'new-user'
          })
        }),
        expect.any(Function)
      );
      expect(chrome.tabs.create).toHaveBeenCalledWith({
        url: 'https://github.com/login/device'
      });
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
      allowUnexpectedConsole('error');
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
