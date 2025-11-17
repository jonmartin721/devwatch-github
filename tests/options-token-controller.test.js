import { jest, describe, test, beforeEach, expect } from '@jest/globals';

const { clearToken, validateToken } = await import('../options/controllers/token-controller.js');

describe('Token Controller', () => {
  beforeEach(() => {
    document.body.innerHTML = `
      <input id="githubToken" type="password" value="test-token" />
      <div id="tokenStatus" class="token-status"></div>
      <button id="clearTokenBtn" style="display: block;">Clear</button>
      <input id="repoInput" />
      <button id="addRepoBtn">Add</button>
      <div id="repoHelpText"></div>
      <div id="importReposSection" style="display: block;"></div>
    `;

    global.chrome = {
      storage: {
        sync: {
          get: jest.fn(() => Promise.resolve({})),
          set: jest.fn(() => Promise.resolve())
        }
      }
    };

    global.confirm = jest.fn(() => true);
    global.fetch = jest.fn();
  });

  test('clearToken does nothing when cancelled', async () => {
    global.confirm.mockReturnValue(false);

    await clearToken();

    expect(document.getElementById('githubToken').value).toBe('test-token');
  });

  test('validateToken handles valid token', async () => {
    global.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({ login: 'testuser' })
    });

    const toastManager = {};
    await validateToken('test-token', toastManager);

    const statusEl = document.getElementById('tokenStatus');
    expect(statusEl.textContent).toContain('testuser');
  });

  test('validateToken handles invalid token', async () => {
    global.fetch.mockResolvedValue({
      ok: false,
      status: 401
    });

    const toastManager = {};
    await validateToken('bad-token', toastManager);

    const statusEl = document.getElementById('tokenStatus');
    expect(statusEl.textContent).toContain('Invalid');
  });
});
