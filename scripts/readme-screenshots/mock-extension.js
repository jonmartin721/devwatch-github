/* global Response, structuredClone */

(function () {
  const params = new URLSearchParams(window.location.search);
  const scenario = params.get('scenario') || 'popup-feed';
  const nowIso = '2026-04-21T20:45:00-05:00';
  const now = new Date(nowIso).getTime();
  const hour = 60 * 60 * 1000;
  const minute = 60 * 1000;
  const themePreferences = {
    theme: 'dark',
    colorTheme: 'graphite'
  };

  const sampleRepos = [
    {
      fullName: 'openai/openai-python',
      owner: 'openai',
      name: 'openai-python',
      description: 'The official Python library for the OpenAI API.',
      language: 'Python',
      stars: 27000,
      url: 'https://github.com/openai/openai-python'
    },
    {
      fullName: 'vercel/next.js',
      owner: 'vercel',
      name: 'next.js',
      description: 'The React framework for production.',
      language: 'TypeScript',
      stars: 131000,
      url: 'https://github.com/vercel/next.js'
    },
    {
      fullName: 'microsoft/vscode',
      owner: 'microsoft',
      name: 'vscode',
      description: 'Visual Studio Code.',
      language: 'TypeScript',
      stars: 171000,
      url: 'https://github.com/microsoft/vscode'
    },
    {
      fullName: 'home-assistant/core',
      owner: 'home-assistant',
      name: 'core',
      description: 'Open source home automation that puts local control and privacy first.',
      language: 'Python',
      stars: 86000,
      url: 'https://github.com/home-assistant/core'
    }
  ];

  const popularRepos = [
    {
      owner: { login: 'microsoft' },
      name: 'vscode',
      full_name: 'microsoft/vscode',
      description: 'Visual Studio Code.',
      language: 'TypeScript',
      stargazers_count: 171000
    },
    {
      owner: { login: 'vercel' },
      name: 'next.js',
      full_name: 'vercel/next.js',
      description: 'The React framework for production.',
      language: 'TypeScript',
      stargazers_count: 131000
    },
    {
      owner: { login: 'tailwindlabs' },
      name: 'tailwindcss',
      full_name: 'tailwindlabs/tailwindcss',
      description: 'A utility-first CSS framework for rapid UI development.',
      language: 'TypeScript',
      stargazers_count: 86000
    },
    {
      owner: { login: 'openai' },
      name: 'openai-python',
      full_name: 'openai/openai-python',
      description: 'The official Python library for the OpenAI API.',
      language: 'Python',
      stargazers_count: 27000
    }
  ];

  const releasePayload = {
    tag_name: 'v1.0.3',
    name: 'v1.0.3',
    html_url: 'https://github.com/jonmartin721/devwatch-github/releases/tag/v1.0.3',
    published_at: '2026-04-20T20:00:00Z',
    created_at: '2026-04-20T19:20:00Z',
    body: [
      '## Highlights',
      '- Added a GitHub status card in settings so account and API budget stay visible.',
      '- Tightened popup theme boot so the first paint matches the selected theme.',
      '- Cleaned up the popup header layout for denser repo metadata.',
      '',
      '## Quality',
      '- Expanded UI tests around popup bootstrap and settings interactions.'
    ].join('\n')
  };

  const popupActivities = [
    {
      id: 'openai-pr-1',
      type: 'pr',
      repo: 'openai/openai-python',
      title: 'Ship the Responses API helper for streamed reasoning outputs',
      description: 'Adds richer streaming helpers and better retry ergonomics.',
      author: 'Ari Lerner',
      authorAvatar: 'https://avatars.githubusercontent.com/u/833947?v=4',
      createdAt: new Date(now - 17 * minute).toISOString(),
      url: 'https://github.com/openai/openai-python/pull/9999'
    },
    {
      id: 'openai-issue-1',
      type: 'issue',
      repo: 'openai/openai-python',
      title: 'Document the new tool choice fallback for assistant runs',
      description: 'Clarifies when the SDK falls back to automatic tool selection.',
      author: 'Jenny Bryan',
      authorAvatar: 'https://avatars.githubusercontent.com/u/87469?v=4',
      createdAt: new Date(now - 43 * minute).toISOString(),
      url: 'https://github.com/openai/openai-python/issues/10001'
    },
    {
      id: 'vercel-release-1',
      type: 'release',
      repo: 'vercel/next.js',
      title: 'v15.3.0',
      description: 'Routing polish, faster Turbopack refreshes, and App Router fixes.',
      author: 'Timer',
      authorAvatar: 'https://avatars.githubusercontent.com/u/14985020?v=4',
      createdAt: new Date(now - 95 * minute).toISOString(),
      url: 'https://github.com/vercel/next.js/releases/tag/v15.3.0'
    },
    {
      id: 'ha-pr-1',
      type: 'pr',
      repo: 'home-assistant/core',
      title: 'Reduce log noise from transient Bluetooth reconnects',
      description: 'Avoids paging on harmless reconnect bursts from sleepy devices.',
      author: 'Paulus Schoutsen',
      authorAvatar: 'https://avatars.githubusercontent.com/u/638318?v=4',
      createdAt: new Date(now - 2.7 * hour).toISOString(),
      url: 'https://github.com/home-assistant/core/pull/123456'
    },
    {
      id: 'vscode-issue-1',
      type: 'issue',
      repo: 'microsoft/vscode',
      title: 'Git diff editor still drops focus after inline rename',
      description: 'Regression report with a short repro and screen recording.',
      author: 'Sandy081',
      authorAvatar: 'https://avatars.githubusercontent.com/u/10746682?v=4',
      createdAt: new Date(now - 4.1 * hour).toISOString(),
      url: 'https://github.com/microsoft/vscode/issues/245678'
    }
  ];

  function clone(value) {
    if (typeof structuredClone === 'function') {
      return structuredClone(value);
    }

    return JSON.parse(JSON.stringify(value));
  }

  function scenarioData() {
    const sharedSync = {
      theme: themePreferences.theme,
      colorTheme: themePreferences.colorTheme,
      lastCheck: new Date(now - 8 * minute).toISOString(),
      filters: {
        prs: true,
        issues: true,
        releases: true
      },
      notifications: {
        prs: true,
        issues: true,
        releases: true
      },
      checkInterval: 15,
      snoozeHours: 24,
      itemExpiryHours: null,
      markReadOnSnooze: false,
      allowUnlimitedRepos: false,
      mutedRepos: [],
      snoozedRepos: [],
      pinnedRepos: ['openai/openai-python']
    };

    if (scenario === 'popup-onboarding') {
      return {
        sync: sharedSync,
        local: {
          onboarding_state: {
            currentStep: 0,
            completed: false,
            skippedSteps: [],
            data: {}
          },
          watchedRepos: [],
          activities: [],
          readItems: [],
          rateLimit: null,
          collapsedRepos: [],
          lastError: null
        },
        session: {}
      };
    }

    if (scenario === 'options-overview') {
      return {
        sync: {
          ...sharedSync,
          activeTab: 'repositories'
        },
        local: {
          onboarding_state: {
            currentStep: 4,
            completed: true,
            skippedSteps: [],
            data: {}
          },
          watchedRepos: clone(sampleRepos),
          activities: clone(popupActivities),
          readItems: ['vscode-issue-1'],
          rateLimit: {
            remaining: 4218,
            limit: 5000,
            reset: new Date(now + 41 * minute).toISOString()
          },
          githubAuthSession: {
            accessToken: 'mock-access-token',
            username: 'jonmartin721',
            authType: 'oauth_device',
            scopes: ['repo', 'read:user'],
            grantedAt: new Date(now - 19 * dayMs()).toISOString()
          },
          collapsedRepos: [],
          lastError: null
        },
        session: {}
      };
    }

    return {
      sync: sharedSync,
      local: {
        onboarding_state: {
          currentStep: 4,
          completed: true,
          skippedSteps: [],
          data: {}
        },
        watchedRepos: clone(sampleRepos),
        activities: clone(popupActivities),
        readItems: ['vscode-issue-1'],
        rateLimit: {
          remaining: 632,
          limit: 5000,
          reset: new Date(now + 26 * minute).toISOString()
        },
        collapsedRepos: [],
        lastError: null
      },
      session: {}
    };
  }

  function dayMs() {
    return 24 * hour;
  }

  const seed = scenarioData();
  localStorage.setItem('devwatch:theme-preferences', JSON.stringify(themePreferences));
  localStorage.setItem('activeTab', scenario === 'options-overview' ? 'repositories' : 'setup');

  const originalConsoleError = console.error.bind(console);
  console.error = function patchedConsoleError(...args) {
    try {
      document.documentElement.dataset.mockLastError = args
        .map((arg) => {
          if (arg instanceof Error) {
            return arg.stack || arg.message;
          }

          return typeof arg === 'string' ? arg : JSON.stringify(arg);
        })
        .join(' | ')
        .slice(0, 1000);
    } catch {
      document.documentElement.dataset.mockLastError = 'Unable to serialize console error';
    }

    originalConsoleError(...args);
  };

  window.addEventListener('error', (event) => {
    document.documentElement.dataset.mockWindowError = String(event.error?.stack || event.message || event.error || '');
  });

  window.addEventListener('unhandledrejection', (event) => {
    document.documentElement.dataset.mockRejection = String(event.reason?.stack || event.reason || '');
  });

  if (!window.matchMedia) {
    window.matchMedia = function matchMedia(query) {
      return {
        matches: query === '(prefers-color-scheme: dark)',
        media: query,
        addListener: function () {},
        removeListener: function () {},
        addEventListener: function () {},
        removeEventListener: function () {},
        dispatchEvent: function () {
          return false;
        }
      };
    };
  }

  const storageListeners = new Set();

  function createResponse(body, init) {
    return new Response(body, init);
  }

  function normalizeKeys(keys, store) {
    if (typeof keys === 'undefined' || keys === null) {
      return clone(store);
    }

    if (Array.isArray(keys)) {
      return keys.reduce((acc, key) => {
        if (Object.prototype.hasOwnProperty.call(store, key)) {
          acc[key] = clone(store[key]);
        }
        return acc;
      }, {});
    }

    if (typeof keys === 'string') {
      return Object.prototype.hasOwnProperty.call(store, keys)
        ? { [keys]: clone(store[keys]) }
        : {};
    }

    if (typeof keys === 'object') {
      return Object.keys(keys).reduce((acc, key) => {
        acc[key] = Object.prototype.hasOwnProperty.call(store, key)
          ? clone(store[key])
          : clone(keys[key]);
        return acc;
      }, {});
    }

    return {};
  }

  function finish(result, callback) {
    if (typeof callback === 'function') {
      callback(result);
      return undefined;
    }

    return Promise.resolve(result);
  }

  function emitStorageChanges(areaName, changes) {
    if (Object.keys(changes).length === 0) {
      return;
    }

    storageListeners.forEach((listener) => {
      listener(clone(changes), areaName);
    });
  }

  function createStorageArea(areaName, initialStore) {
    const store = clone(initialStore);

    return {
      get(keys, callback) {
        return finish(normalizeKeys(keys, store), callback);
      },

      set(items, callback) {
        const changes = {};

        Object.entries(items || {}).forEach(([key, value]) => {
          const oldValue = Object.prototype.hasOwnProperty.call(store, key) ? clone(store[key]) : undefined;
          store[key] = clone(value);
          changes[key] = {
            oldValue,
            newValue: clone(value)
          };
        });

        emitStorageChanges(areaName, changes);
        return finish(undefined, callback);
      },

      remove(keys, callback) {
        const keyList = Array.isArray(keys) ? keys : [keys];
        const changes = {};

        keyList.forEach((key) => {
          if (Object.prototype.hasOwnProperty.call(store, key)) {
            changes[key] = {
              oldValue: clone(store[key]),
              newValue: undefined
            };
            delete store[key];
          }
        });

        emitStorageChanges(areaName, changes);
        return finish(undefined, callback);
      },

      clear(callback) {
        const changes = Object.keys(store).reduce((acc, key) => {
          acc[key] = {
            oldValue: clone(store[key]),
            newValue: undefined
          };
          return acc;
        }, {});

        Object.keys(store).forEach((key) => {
          delete store[key];
        });

        emitStorageChanges(areaName, changes);
        return finish(undefined, callback);
      }
    };
  }

  const localStorageArea = createStorageArea('local', seed.local);
  const syncStorageArea = createStorageArea('sync', seed.sync);
  const sessionStorageArea = createStorageArea('session', seed.session);

  const originalFetch = window.fetch.bind(window);

  window.fetch = async function fetchWithMocks(input, init) {
    const requestUrl = typeof input === 'string' ? input : input.url;

    if (requestUrl.includes('/repos/jonmartin721/devwatch-github/releases/latest')) {
      return createResponse(JSON.stringify(releasePayload), {
        status: 200,
        headers: {
          'Content-Type': 'application/json'
        }
      });
    }

    if (requestUrl.includes('/search/repositories?')) {
      return createResponse(JSON.stringify({ items: popularRepos }), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'X-RateLimit-Remaining': '4218',
          'X-RateLimit-Reset': String(Math.floor((now + 41 * minute) / 1000))
        }
      });
    }

    return originalFetch(input, init);
  };

  const chromeApi = window.chrome || {};
  chromeApi.storage = {
    local: localStorageArea,
    sync: syncStorageArea,
    session: sessionStorageArea,
    onChanged: {
      addListener(listener) {
        storageListeners.add(listener);
      },
      removeListener(listener) {
        storageListeners.delete(listener);
      }
    }
  };
  chromeApi.runtime = {
    ...(chromeApi.runtime || {}),
    lastError: null,
    getURL(path) {
      const normalizedPath = String(path || '').replace(/^\/+/, '');
      return new URL(normalizedPath, window.location.origin + '/').href;
    },
    async openOptionsPage() {
      window.__mockOpenOptionsPage = true;
    },
    async sendMessage(message) {
      if (message?.action === 'checkNow') {
        return { ok: true };
      }

      return { ok: true };
    }
  };
  chromeApi.tabs = {
    ...(chromeApi.tabs || {}),
    async create(details) {
      window.__mockOpenedTab = details?.url || null;
      return { id: 1, ...details };
    }
  };

  window.chrome = chromeApi;
  globalThis.chrome = chromeApi;

  if (!navigator.clipboard || typeof navigator.clipboard.writeText !== 'function') {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        async writeText(text) {
          window.__mockClipboardText = text;
        }
      }
    });
  }

  window.confirm = function confirm() {
    return true;
  };
})();
