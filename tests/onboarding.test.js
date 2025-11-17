import { jest, describe, beforeEach, test, expect } from '@jest/globals';

// Simple mock storage to simulate chrome.storage.local for onboarding flows
let _localStorage = {};

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
    }
  },
  runtime: { sendMessage: jest.fn() },
  tabs: { create: jest.fn() }
};

// Import functions we need from popup
let handleNextStep;
import { OnboardingManager } from '../shared/onboarding.js';

describe('Onboarding - token persistence', () => {
  beforeEach(async () => {
    // Reset storage and mocks
    _localStorage = {
      onboarding_state: {
        currentStep: 1, // token step
        completed: false,
        skippedSteps: [],
        data: {
          token: { token: 'ghp_OLD', validated: true, username: 'alice' }
        }
      }
    };

    jest.clearAllMocks();
    document.body.innerHTML = '';
    // Reload modules to reset module-level onboardingManager cache
    jest.resetModules();
    ({ handleNextStep } = await import('../popup/popup.js'));
  });

  test('preserves validated flag when saving token and navigating next', async () => {
    // Setup minimal DOM expected by handleNextStep
    document.body.innerHTML = `
      <input id="tokenInput" value="ghp_NEW" />
      <div id="tokenStatus"></div>
      <button id="nextBtn" class="onboarding-btn primary"></button>
      <div id="onboardingView"></div>
    `;

    // Sanity: check onboarding manager initial state contains validated token
    const manager = new OnboardingManager();
    const dataBefore = await manager.getStepData('token');
    expect(dataBefore.validated).toBe(true);
    expect(dataBefore.username).toBe('alice');

    // Call handleNextStep which should preserve existing validated info
    await handleNextStep();

    // Read what's saved
    const result = await new Promise((resolve) => {
      chrome.storage.local.get(['onboarding_state'], (res) => resolve(res.onboarding_state));
    });

    // The token object should have been merged with the existing validated info
    expect(result).toBeTruthy();
    expect(result.data).toBeTruthy();
    expect(result.data.token.token).toBe('ghp_NEW');
    // Preserved
    expect(result.data.token.validated).toBe(true);
    expect(result.data.token.username).toBe('alice');
  });

  test('getPopularRepos uses stored token in request', async () => {
    const mockFetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      statusText: 'OK',
      headers: new Map(),
      json: async () => ({ items: [ { owner: { login: 'owner' }, name: 'repo', description: 'desc', language: 'JS', stargazers_count: 2000 } ] }),
      text: async () => ''
    });

    global.fetch = mockFetch;

    // Set a token in local storage
    _localStorage.githubToken = 'ghp_TEST_TOKEN';

    const manager = new OnboardingManager();
    // Clear any step token so that the function picks up chrome.storage.local token
    await manager.saveStepData('token', {});
    const result = await manager.getPopularRepos();

    // Ensure fetch was called with Authorization header
    expect(mockFetch).toHaveBeenCalled();
    const [, options] = mockFetch.mock.calls[0];
    expect(options.headers['Authorization']).toBe('token ghp_TEST_TOKEN');

    // Should return at least 1 repo from our mocked response
    expect(result.length).toBeGreaterThan(0);
    expect(result[0].name).toBe('repo');
  });

  test('getPopularRepos uses onboarding step token when storage missing', async () => {
    const manager = new OnboardingManager();

    // Save token inside onboarding step data, not in chrome.local
    await manager.saveStepData('token', { token: 'ghp_STEP_TOKEN' });

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
    expect(options.headers['Authorization']).toBe('token ghp_STEP_TOKEN');
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

    // Import renderReposStep dynamically from popup to avoid test ordering issues
    const { renderReposStep } = await import('../popup/popup.js');
    const html = await renderReposStep();

    expect(html).toContain('alice/fancy');

    // Restore fetch
    global.fetch = oldFetch;
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
    await handleNextStep();

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
  });
});
