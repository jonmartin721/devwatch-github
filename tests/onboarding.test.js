import { jest, describe, beforeEach, test, expect } from '@jest/globals';
import { TextEncoder } from 'node:util';

// Simple mock storage to simulate chrome.storage.local for onboarding flows
let _localStorage = {};
let _sessionStorage = {};

global.chrome = {
  storage: {
    local: {
      get: jest.fn((keys, callback) => {
        // keys can be array or single key
        const result = {};
        if (Array.isArray(keys)) {
          keys.forEach(k => result[k] = _localStorage[k]);
        } else {
          result[keys] = _localStorage[keys];
        }

        if (callback) callback(result);
        return Promise.resolve(result);
      }),
      set: jest.fn((items, callback) => {
        _localStorage = { ..._localStorage, ...items };
        if (callback) callback();
        return Promise.resolve();
      })
    },
    sync: {
      get: jest.fn((keys, callback) => {
        if (callback) callback({});
        return Promise.resolve({});
      }),
      set: jest.fn((items, callback) => {
        if (callback) callback();
        return Promise.resolve();
      })
    },
    session: {
      get: jest.fn((keys, callback) => {
        // keys can be array or single key
        const result = {};
        if (Array.isArray(keys)) {
          keys.forEach(k => result[k] = _sessionStorage[k]);
        } else {
          result[keys] = _sessionStorage[keys];
        }

        if (callback) callback(result);
        return Promise.resolve(result);
      }),
      set: jest.fn((items, callback) => {
        _sessionStorage = { ..._sessionStorage, ...items };
        if (callback) callback();
        return Promise.resolve();
      }),
      remove: jest.fn((keys, callback) => {
        const keyArray = Array.isArray(keys) ? keys : [keys];
        keyArray.forEach((key) => {
          delete _sessionStorage[key];
        });
        if (callback) callback();
        return Promise.resolve();
      })
    }
  },
  runtime: { sendMessage: jest.fn() },
  tabs: { create: jest.fn() }
};

// Import functions we need from popup
import { OnboardingManager } from '../shared/onboarding.js';

let _handleNextStep;
let _renderReposStep;
let _renderOnboardingStep;
let _showOnboarding;
let _exitOnboarding;

async function renderTokenStep(stateOverrides = {}) {
  _localStorage = {
    githubOAuthClientId: 'Iv1.test-client-id',
    onboarding_state: {
      currentStep: 1,
      completed: false,
      skippedSteps: [],
      data: {},
      ...stateOverrides
    }
  };
  _sessionStorage = {};

  document.body.innerHTML = `
    <div id="onboardingView"></div>
    <button id="footerSkipBtn" class="hidden"></button>
  `;

  await _renderOnboardingStep();
  await Promise.resolve();
}

describe('Onboarding - token persistence', () => {
  beforeEach(async () => {
    // Reset storage and mocks
    _localStorage = {
      githubOAuthClientId: 'Iv1.test-client-id',
      onboarding_state: {
        currentStep: 1, // token step
        completed: false,
        skippedSteps: [],
        data: {
          token: { validated: true, username: 'alice', authType: 'oauth_device' }
        }
      }
    };
    _sessionStorage = {};

    jest.clearAllMocks();
    document.body.innerHTML = '';
    Object.defineProperty(globalThis, 'crypto', {
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
    Object.defineProperty(globalThis, 'TextEncoder', {
      configurable: true,
      value: TextEncoder
    });
    Object.defineProperty(globalThis.navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: jest.fn(async () => undefined)
      }
    });
    // Reload modules to reset module-level onboardingManager cache
    jest.resetModules();
    const module = await import('../popup/views/onboarding-view.js');
    _handleNextStep = module.handleNextStep;
    _renderReposStep = module.renderReposStep;
    _renderOnboardingStep = module.renderOnboardingStep;
    _showOnboarding = module.showOnboarding;
    _exitOnboarding = module.exitOnboarding;
  });

  test('preserves validated auth state when navigating past the connect step', async () => {
    // Setup minimal DOM expected by handleNextStep
    document.body.innerHTML = `
      <input id="tokenInput" value="" />
      <div id="tokenStatus"></div>
      <button id="validateTokenBtn"></button>
      <button id="nextBtn" class="onboarding-btn primary"></button>
      <div id="onboardingView"></div>
    `;

    // Sanity: check onboarding manager initial state contains validated token
    const manager = new OnboardingManager();
    const dataBefore = await manager.getStepData('token');
    expect(dataBefore.validated).toBe(true);
    expect(dataBefore.username).toBe('alice');

    await _handleNextStep();

    const result = await new Promise((resolve) => {
      chrome.storage.local.get(['onboarding_state'], (res) => resolve(res.onboarding_state));
    });

    expect(result).toBeTruthy();
    expect(result.data).toBeTruthy();
    expect(result.data.token.validated).toBe(true);
    expect(result.data.token.username).toBe('alice');
    expect(document.getElementById('tokenStatus').textContent).toBe('');
  });

  test('getPopularRepos uses stored auth session in request', async () => {
    const mockFetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      statusText: 'OK',
      headers: new Map(),
      json: async () => ({ items: [ { owner: { login: 'owner' }, name: 'repo', description: 'desc', language: 'JS', stargazers_count: 2000 } ] }),
      text: async () => ''
    });

    global.fetch = mockFetch;

    // Set an auth session in storage
    _localStorage.githubAuthSession = {
      accessToken: 'gho_TEST_TOKEN',
      authType: 'oauth_device'
    };

    const manager = new OnboardingManager();
    // Clear any onboarding step state so the function uses the active auth session
    await manager.saveStepData('token', {});
    const result = await manager.getPopularRepos();

    // Ensure fetch was called with Authorization header
    expect(mockFetch).toHaveBeenCalled();
    const [, options] = mockFetch.mock.calls[0];
    expect(options.headers['Authorization']).toBe('Bearer gho_TEST_TOKEN');

    // Should return at least 1 repo from our mocked response
    expect(result.length).toBeGreaterThan(0);
    expect(result[0].name).toBe('repo');
  });

  test('getPopularRepos falls back to unauthenticated headers when no auth session exists', async () => {
    const manager = new OnboardingManager();

    const mockFetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      statusText: 'OK',
      headers: new Map(),
      json: async () => ({ items: [ { owner: { login: 'owner' }, name: 'repo' } ] }),
      text: async () => ''
    });

    global.fetch = mockFetch;

    const result = await manager.getPopularRepos();

    expect(mockFetch).toHaveBeenCalled();
    const [, options] = mockFetch.mock.calls[0];
    expect(options.headers['Authorization']).toBeUndefined();
    expect(options.headers['Accept']).toBe('application/vnd.github.v3+json');
    expect(result.length).toBeGreaterThan(0);
  });

  test('renderReposStep uses saved popularRepos and avoids network call', async () => {
    // Provide saved popular repos in onboarding state
    const manager = new OnboardingManager();
    const saved = [ { owner: { login: 'alice' }, name: 'fancy', description: 'desc', language: 'JS' } ];
    await manager.saveStepData('popularRepos', saved);

    // Replace global.fetch with a failing mock to ensure it isn't called
    const oldFetch = global.fetch;
    global.fetch = jest.fn().mockImplementation(() => { throw new Error('should not call network'); });

    // Create minimal DOM so renderReposStep can return HTML safely
    document.body.innerHTML = '<div id="onboardingView"></div>';

    // Use renderReposStep from onboarding-view
    const html = await _renderReposStep();

    expect(html).toContain('alice/fancy');

    // Restore fetch
    global.fetch = oldFetch;
  });

  test('renderReposStep caps saved popular repositories to three cards', async () => {
    const manager = new OnboardingManager();
    const saved = [
      { owner: { login: 'alice' }, name: 'one', description: 'desc', language: 'JS' },
      { owner: { login: 'bob' }, name: 'two', description: 'desc', language: 'TS' },
      { owner: { login: 'carol' }, name: 'three', description: 'desc', language: 'Go' },
      { owner: { login: 'dave' }, name: 'four', description: 'desc', language: 'Rust' }
    ];
    await manager.saveStepData('popularRepos', saved);

    const html = await _renderReposStep();

    expect(html).toContain('alice/one');
    expect(html).toContain('bob/two');
    expect(html).toContain('carol/three');
    expect(html).not.toContain('dave/four');
  });

  test('renderReposStep escapes repository metadata before building HTML', async () => {
    const manager = new OnboardingManager();
    const saved = [
      {
        owner: { login: 'alice"><img src=x onerror=alert(1)>' },
        name: 'fancy<script>alert(1)</script>',
        description: '<img src=x onerror=alert(1)>',
        language: 'JS<script>'
      }
    ];
    await manager.saveStepData('popularRepos', saved);

    const html = await _renderReposStep();

    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(html).toContain('data-repo="alice&quot;&gt;&lt;img src=x onerror=alert(1)&gt;/fancy&lt;script&gt;alert(1)&lt;/script&gt;"');
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).not.toContain('<img src=x onerror=alert(1)>');
  });

  test('renderOnboardingStep escapes saved device codes and usernames on the connect step', async () => {
    await renderTokenStep({
      data: {
        token: {
          userCode: 'ABCD"&quot; autofocus="true',
          validated: true,
          username: '<img src=x onerror=alert(1)>'
        }
      }
    });

    const onboardingHtml = document.getElementById('onboardingView').innerHTML;
    const tokenStatus = document.getElementById('tokenStatus');

    expect(document.getElementById('tokenInput')).toBeNull();
    expect(document.getElementById('validateTokenBtn')).toBeNull();
    expect(tokenStatus.textContent).toContain('Connected as <img src=x onerror=alert(1)>');
    expect(onboardingHtml).toContain('&lt;img src=x onerror=alert(1)&gt;');
    expect(onboardingHtml).not.toContain('<img src=x onerror=alert(1)>');
  });

  test('renderOnboardingStep shows connected status without username safely', async () => {
    await renderTokenStep({
      data: {
        token: {
          validated: true
        }
      }
    });

    const onboardingHtml = document.getElementById('onboardingView').innerHTML;
    const tokenStatus = document.getElementById('tokenStatus');

    expect(tokenStatus.textContent).toContain('GitHub connected');
    expect(tokenStatus.textContent).toContain("You're done here");
    expect(onboardingHtml).toContain('Ready');
  });

  test('connect step renders without a dedicated copy button', async () => {
    await renderTokenStep({
      data: {
        token: {
          userCode: 'ABCD-EFGH',
          validated: false
        }
      }
    });

    expect(document.getElementById('copyTokenCodeBtn')).toBeNull();
  });

  test('connect step lets you copy the saved device code by focusing the field', async () => {
    await renderTokenStep({
      data: {
        token: {
          userCode: 'ABCD-EFGH',
          validated: false
        }
      }
    });

    document.getElementById('tokenInput').dispatchEvent(new Event('focus'));
    await Promise.resolve();
    await Promise.resolve();

    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('ABCD-EFGH');
    expect(document.getElementById('tokenStatus').textContent).toContain('Code ABCD-EFGH copied to clipboard');
  });

  test('continue without GitHub skips the token step and advances to repos', async () => {
    await renderTokenStep({
      data: {
        token: {
          validated: false
        }
      }
    });

    document.getElementById('skipTokenStepBtn').click();
    await Promise.resolve();
    await Promise.resolve();

    const waitForSkippedState = async (timeout = 400) => {
      const start = Date.now();
      while (Date.now() - start < timeout) {
        const state = await new Promise((resolve) => {
          chrome.storage.local.get(['onboarding_state'], (res) => resolve(res.onboarding_state));
        });

        if (state?.currentStep === 2) {
          return state;
        }

        await new Promise(resolve => setTimeout(resolve, 20));
      }

      return null;
    };

    const state = await waitForSkippedState();

    expect(state).toBeTruthy();
    expect(state.currentStep).toBe(2);
    expect(state.skippedSteps).toContain('token');
    expect(state.data.token).toEqual({
      validated: false,
      skipped: true
    });
  });

  test('repos step shows anonymous guidance when no GitHub session exists', async () => {
    const manager = new OnboardingManager();
    await manager.saveStepData('popularRepos', [
      { owner: { login: 'owner' }, name: 'repo', description: 'desc', language: 'JS' }
    ]);

    const html = await _renderReposStep();

    expect(html).toContain('You can add public repositories now');
  });

  test('signed-in repos step shows GitHub source buttons and defaults to Mine', async () => {
    _localStorage.githubAuthSession = {
      accessToken: 'gho_TEST_TOKEN',
      authType: 'oauth_device'
    };

    const manager = new OnboardingManager();
    await manager.saveStepData('popularRepos', [
      { owner: { login: 'popular' }, name: 'starter', description: 'desc', language: 'JS', stargazers_count: 100 }
    ]);
    await manager.saveStepData('repoSource', {
      selectedSource: 'mine',
      previews: {
        mine: [
          { owner: { login: 'owner' }, name: 'repo', description: 'desc', language: 'JS', stargazers_count: 42 }
        ]
      },
      loadedSources: ['mine']
    });

    const html = await _renderReposStep();

    expect(html).toContain('Add from GitHub');
    expect(html).toContain('Popular repositories');
    expect(html).toContain('data-source="mine"');
    expect(html).toContain('repo-source-btn active');
    expect(html).toContain('owner/repo');
    expect(html).toContain('popular/starter');
    expect(html).not.toContain('You can add public repositories now');
  });

  test('signed-in repos step lets you switch GitHub preview sources', async () => {
    _localStorage.githubAuthSession = {
      accessToken: 'gho_TEST_TOKEN',
      authType: 'oauth_device'
    };
    _localStorage.onboarding_state = {
      currentStep: 2,
      completed: false,
      skippedSteps: [],
      data: {
        popularRepos: [
          { owner: { login: 'popular' }, name: 'starter', description: 'desc', language: 'JS' }
        ]
      }
    };

    global.fetch = jest.fn()
      .mockResolvedValueOnce({
        ok: true,
        headers: new Map(),
        json: async () => ([{
          full_name: 'mine/repo',
          description: 'Mine repo',
          language: 'TypeScript',
          stargazers_count: 10,
          forks_count: 1,
          updated_at: '2026-04-20T00:00:00Z'
        }])
      })
      .mockResolvedValueOnce({
        ok: true,
        headers: new Map(),
        json: async () => ([{
          full_name: 'starred/repo',
          description: 'Starred repo',
          language: 'JavaScript',
          stargazers_count: 20,
          forks_count: 2,
          updated_at: '2026-04-20T00:00:00Z'
        }])
      });

    document.body.innerHTML = `
      <div id="onboardingView"></div>
      <button id="footerSkipBtn" class="hidden"></button>
    `;

    await _renderOnboardingStep();
    await Promise.resolve();
    await Promise.resolve();
    await new Promise(resolve => setTimeout(resolve, 0));

    const waitForRepoSuggestion = async (expectedText, timeout = 400) => {
      const start = Date.now();
      while (Date.now() - start < timeout) {
        if (document.getElementById('repoSuggestions').textContent.includes(expectedText)) {
          return true;
        }
        await new Promise(resolve => setTimeout(resolve, 20));
      }
      return false;
    };

    expect(await waitForRepoSuggestion('mine/repo')).toBe(true);

    document.querySelector('[data-source="starred"]').click();
    await Promise.resolve();
    await Promise.resolve();
    await new Promise(resolve => setTimeout(resolve, 0));

    expect(await waitForRepoSuggestion('starred/repo')).toBe(true);
  });

  test('signed-in repos step shows an empty state when a source has no addable repos', async () => {
    _localStorage.githubAuthSession = {
      accessToken: 'gho_TEST_TOKEN',
      authType: 'oauth_device'
    };

    const manager = new OnboardingManager();
    await manager.saveStepData('popularRepos', [
      { owner: { login: 'popular' }, name: 'starter', description: 'desc', language: 'JS' }
    ]);
    await manager.saveStepData('repoSource', {
      selectedSource: 'mine',
      previews: {
        mine: []
      },
      loadedSources: ['mine']
    });

    const html = await _renderReposStep();

    expect(html).toContain('No repositories found in your account yet.');
  });

  test('getPopularRepos filters noisy meta repositories and backfills sane defaults', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      statusText: 'OK',
      headers: new Map(),
      json: async () => ({
        items: [
          {
            owner: { login: 'vinta' },
            name: 'awesome-python',
            description: 'A curated list of Python frameworks',
            language: 'Python',
            stargazers_count: 100000
          },
          {
            owner: { login: 'ByteByteGoHq' },
            name: 'system-design-101',
            description: 'System design interview prep',
            language: 'Markdown',
            stargazers_count: 80000
          },
          {
            owner: { login: 'supabase' },
            name: 'supabase',
            description: 'The open source Firebase alternative',
            language: 'TypeScript',
            stargazers_count: 90000
          }
        ]
      }),
      text: async () => ''
    });

    const manager = new OnboardingManager();
    const result = await manager.getPopularRepos();

    expect(result).toHaveLength(3);
    expect(result.some(repo => `${repo.owner.login}/${repo.name}` === 'supabase/supabase')).toBe(true);
    expect(result.some(repo => `${repo.owner.login}/${repo.name}` === 'microsoft/vscode')).toBe(true);
    expect(result.some(repo => /awesome-python/i.test(`${repo.owner.login}/${repo.name}`))).toBe(false);
  });

  test('connect step shows device instructions when sign-in starts', async () => {
    global.fetch = jest.fn().mockResolvedValueOnce({
      ok: true,
      text: async () => JSON.stringify({
        device_code: 'device-code',
        user_code: 'ABCD-EFGH',
        verification_uri: 'https://github.com/login/device',
        expires_in: 900,
        interval: 0
      })
    }).mockResolvedValueOnce({
      ok: true,
      text: async () => JSON.stringify({
        error: 'authorization_pending'
      })
    });

    await renderTokenStep();

    document.getElementById('validateTokenBtn').click();
    await Promise.resolve();
    await Promise.resolve();
    await new Promise(resolve => setTimeout(resolve, 0));

    expect(document.getElementById('tokenInput').value).toBe('ABCD-EFGH');
    expect(document.getElementById('tokenStatus').textContent).toContain('ABCD-EFGH');
    expect(chrome.tabs.create).toHaveBeenCalledWith({ url: 'https://github.com/login/device' });
  });

  test('connect step handles cancelled sign-in', async () => {
    global.fetch = jest.fn()
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
          error: 'access_denied'
        })
      });

    await renderTokenStep();
    document.getElementById('validateTokenBtn').click();
    await Promise.resolve();
    await Promise.resolve();
    await new Promise(resolve => setTimeout(resolve, 0));

    expect(document.getElementById('tokenStatus').textContent).toBe('GitHub connection was cancelled');
  });

  test('connect step handles device flow errors', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('network down'));

    await renderTokenStep();

    document.getElementById('validateTokenBtn').click();
    await Promise.resolve();
    await new Promise(resolve => setTimeout(resolve, 0));

    expect(document.getElementById('tokenStatus').textContent).toBe('GitHub connection failed');
  });

  test('connect step escapes successful sign-in messages', async () => {
    global.fetch = jest.fn(async (url) => {
      if (url === 'https://github.com/login/device/code') {
        return {
          ok: true,
          text: async () => JSON.stringify({
            device_code: 'device-code',
            user_code: 'ABCD-EFGH',
            verification_uri: 'https://github.com/login/device',
            expires_in: 900,
            interval: 0
          })
        };
      }

      if (url === 'https://github.com/login/oauth/access_token') {
        return {
          ok: true,
          text: async () => JSON.stringify({
            access_token: 'oauth-token',
            token_type: 'bearer',
            scope: 'repo read:user'
          })
        };
      }

      if (url === 'https://api.github.com/user') {
        return {
          ok: true,
          json: async () => ({ login: '<img src=x onerror=alert(1)>' })
        };
      }

      return { ok: true, json: async () => ({ items: [] }) };
    });

    await renderTokenStep();

    document.getElementById('validateTokenBtn').click();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    await new Promise(resolve => setTimeout(resolve, 0));

    const tokenStatus = document.getElementById('tokenStatus');
    expect(tokenStatus.textContent).toContain('Connected as <img src=x onerror=alert(1)>');
    expect(tokenStatus.innerHTML).toContain('&lt;img src=x onerror=alert(1)&gt;');
    expect(document.getElementById('tokenInput')).toBeNull();
    expect(document.getElementById('validateTokenBtn')).toBeNull();
  });

  test('saves categories preferences during onboarding', async () => {
    // Set onboarding step to categories
    _localStorage = {
      onboarding_state: {
        currentStep: 3, // categories step
        completed: false,
        skippedSteps: [],
        data: {}
      }
    };

    // Create DOM elements the handler expects
    document.body.innerHTML = `
      <input type="checkbox" id="pullRequests" checked />
      <input type="checkbox" id="issues" />
      <input type="checkbox" id="releases" checked />
      <input type="checkbox" id="pullRequestsNotifications" checked />
      <input type="checkbox" id="issuesNotifications" />
      <input type="checkbox" id="releasesNotifications" checked />
      <button id="nextBtn" class="onboarding-btn primary">Next</button>
      <div id="onboardingView"></div>
    `;

    // Call the function that handles saving for categories
    await _handleNextStep();

    // Poll storage for categories to avoid race with other tests that might
    // call rendering or on-boarding state changes. Retry until present.
    const waitForCategories = async (timeout = 400) => {
      const start = Date.now();
      while (Date.now() - start < timeout) {
        const state = await new Promise((resolve) => {
          chrome.storage.local.get(['onboarding_state'], (res) => resolve(res.onboarding_state));
        });

        if (state && state.data && state.data.categories !== undefined) {
          return state;
        }

        await new Promise(r => setTimeout(r, 20));
      }
      return null;
    };

    const result = await waitForCategories();

    expect(result).toBeTruthy();
    expect(result.data).toBeTruthy();
    const cat = result.data.categories;
    expect(cat.pullRequests).toBe(true);
    expect(cat.issues).toBe(false);
    expect(cat.releases).toBe(true);
    expect(cat.pullRequestsNotifications).toBe(true);
    expect(cat.issuesNotifications).toBe(false);
    expect(cat.releasesNotifications).toBe(true);

    expect(chrome.storage.sync.set).toHaveBeenCalledWith({
      filters: {
        prs: true,
        issues: false,
        releases: true
      },
      notifications: {
        prs: true,
        issues: false,
        releases: true
      }
    });
  });

  test('showOnboarding hides the main feed and exitOnboarding restores it', async () => {
    _localStorage = {
      onboarding_state: {
        currentStep: 0,
        completed: false,
        skippedSteps: [],
        data: {}
      }
    };

    document.body.innerHTML = `
      <header></header>
      <div class="toolbar"></div>
      <div id="searchBox"></div>
      <div id="activityList"></div>
      <div id="onboardingView" class="hidden"></div>
      <button id="footerSkipBtn" class="hidden"></button>
    `;

    const loadActivitiesCallback = jest.fn();

    await _showOnboarding(loadActivitiesCallback);

    expect(document.getElementById('onboardingView').classList.contains('hidden')).toBe(false);
    expect(document.getElementById('activityList').classList.contains('hidden')).toBe(true);
    expect(document.querySelector('.toolbar').classList.contains('hidden')).toBe(true);
    expect(document.querySelector('header').classList.contains('hidden')).toBe(true);

    _exitOnboarding(loadActivitiesCallback);

    expect(document.getElementById('onboardingView').classList.contains('hidden')).toBe(true);
    expect(document.getElementById('activityList').classList.contains('hidden')).toBe(false);
    expect(document.querySelector('.toolbar').classList.contains('hidden')).toBe(false);
    expect(document.querySelector('header').classList.contains('hidden')).toBe(false);
    expect(loadActivitiesCallback).toHaveBeenCalled();
  });

  test('repos step loads popular repositories and reattaches add buttons', async () => {
    _localStorage = {
      githubOAuthClientId: 'Iv1.test-client-id',
      onboarding_state: {
        currentStep: 2,
        completed: false,
        skippedSteps: [],
        data: {}
      }
    };

    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      statusText: 'OK',
      headers: new Map(),
      json: async () => ({
        items: [
          {
            owner: { login: 'owner' },
            name: 'repo',
            description: 'Repository description',
            language: 'TypeScript',
            stargazers_count: 5000
          }
        ]
      }),
      text: async () => ''
    });

    document.body.innerHTML = `
      <div id="onboardingView"></div>
      <button id="footerSkipBtn" class="hidden"></button>
    `;

    await _renderOnboardingStep();
    await Promise.resolve();
    await Promise.resolve();

    expect(document.getElementById('footerSkipBtn').classList.contains('hidden')).toBe(false);
    expect(document.getElementById('repoSuggestions').innerHTML).toContain('owner/repo');
    expect(document.querySelector('.add-repo-btn').dataset.listenerAttached).toBe('true');
  });

  test('categories step disables notifications when tracking is turned off', async () => {
    _localStorage = {
      onboarding_state: {
        currentStep: 3,
        completed: false,
        skippedSteps: [],
        data: {
          categories: {
            pullRequests: true,
            pullRequestsNotifications: true
          }
        }
      }
    };

    document.body.innerHTML = `
      <div id="onboardingView"></div>
      <button id="footerSkipBtn" class="hidden"></button>
    `;

    await _renderOnboardingStep();
    await Promise.resolve();
    await Promise.resolve();

    const trackToggle = document.getElementById('pullRequests');
    const notifyToggle = document.getElementById('pullRequestsNotifications');
    const notifyLabel = notifyToggle.closest('.toggle-label');

    notifyToggle.checked = true;
    trackToggle.checked = false;
    trackToggle.dispatchEvent(new Event('change', { bubbles: true }));

    expect(notifyToggle.disabled).toBe(true);
    expect(notifyToggle.checked).toBe(false);
    expect(notifyLabel.classList.contains('disabled')).toBe(true);
  });

  test('navigation buttons move backward and finish onboarding from the shell flow', async () => {
    _localStorage = {
      onboarding_state: {
        currentStep: 2,
        completed: false,
        skippedSteps: [],
        data: {
          popularRepos: []
        }
      }
    };

    document.body.innerHTML = `
      <header class="hidden"></header>
      <div class="toolbar hidden"></div>
      <div id="activityList" class="hidden"></div>
      <div id="onboardingView"></div>
      <button id="footerSkipBtn" class="hidden"></button>
    `;

    await _renderOnboardingStep();
    document.getElementById('prevBtn').click();
    await Promise.resolve();
    await Promise.resolve();

    let storedState = await new Promise((resolve) => {
      chrome.storage.local.get(['onboarding_state'], (res) => resolve(res.onboarding_state));
    });

    expect(storedState.currentStep).toBe(1);

    _localStorage.onboarding_state.currentStep = 4;
    document.body.innerHTML = `
      <header class="hidden"></header>
      <div class="toolbar hidden"></div>
      <div id="activityList" class="hidden"></div>
      <div id="onboardingView"></div>
      <button id="footerSkipBtn" class="hidden"></button>
    `;

    const loadActivitiesCallback = jest.fn();
    await _renderOnboardingStep(loadActivitiesCallback);
    document.getElementById('finishBtn').click();
    await Promise.resolve();
    await Promise.resolve();

    storedState = await new Promise((resolve) => {
      chrome.storage.local.get(['onboarding_state'], (res) => resolve(res.onboarding_state));
    });

    expect(storedState.completed).toBe(true);
  });
});
