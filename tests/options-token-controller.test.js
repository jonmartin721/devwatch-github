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

    // Chrome mocks are provided by setup.js
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
    const result = await validateToken('test-token', toastManager);

    const statusEl = document.getElementById('tokenStatus');
    expect(statusEl.textContent).toContain('testuser');
    expect(result).toEqual({ isValid: true, user: 'testuser' });
  });

  test('validateToken skips UI updates for stale responses', async () => {
    global.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({ login: 'stale-user' })
    });

    document.getElementById('tokenStatus').textContent = 'Checking...';
    document.getElementById('tokenStatus').className = 'token-status checking';
    document.getElementById('clearTokenBtn').style.display = 'none';

    const toastManager = { isManualTokenEntry: true };
    const result = await validateToken('stale-token', toastManager, {
      shouldApplyResult: () => false
    });

    expect(result).toEqual({ isValid: true, user: 'stale-user' });
    expect(document.getElementById('tokenStatus').textContent).toBe('Checking...');
    expect(document.getElementById('tokenStatus').className).toBe('token-status checking');
    expect(document.getElementById('clearTokenBtn').style.display).toBe('none');
    expect(toastManager.lastValidToken).toBeUndefined();
  });

  test('validateToken handles invalid token', async () => {
    global.fetch.mockResolvedValue({
      ok: false,
      status: 401
    });

    const toastManager = {};
    const result = await validateToken('bad-token', toastManager);

    const statusEl = document.getElementById('tokenStatus');
    expect(statusEl.textContent).toContain('Invalid');
    expect(result).toEqual({ isValid: false, reason: 'invalid' });
  });

  test('validateToken skips stale invalid-token UI updates', async () => {
    global.fetch.mockResolvedValue({
      ok: false,
      status: 401
    });

    document.getElementById('tokenStatus').textContent = 'Checking...';
    document.getElementById('tokenStatus').className = 'token-status checking';
    document.getElementById('clearTokenBtn').style.display = 'block';

    const toastManager = {};
    const result = await validateToken('stale-bad-token', toastManager, {
      shouldApplyResult: () => false
    });

    expect(result).toEqual({ isValid: false, reason: 'invalid' });
    expect(document.getElementById('tokenStatus').textContent).toBe('Checking...');
    expect(document.getElementById('tokenStatus').className).toBe('token-status checking');
    expect(document.getElementById('clearTokenBtn').style.display).toBe('block');
    expect(toastManager.lastInvalidToken).toBeUndefined();
  });
  test('clearToken clears all fields when confirmed', async () => {
    global.confirm.mockReturnValue(true);

    const tokenInput = document.getElementById('githubToken');
    const statusEl = document.getElementById('tokenStatus');
    const clearBtn = document.getElementById('clearTokenBtn');
    const repoInput = document.getElementById('repoInput');
    const addBtn = document.getElementById('addRepoBtn');
    const importSection = document.getElementById('importReposSection');

    await clearToken();

    expect(tokenInput.value).toBe('');
    expect(statusEl.textContent).toBe('');
    expect(clearBtn.style.display).toBe('none');
    expect(repoInput.disabled).toBe(true);
    expect(addBtn.disabled).toBe(true);
    expect(importSection.style.display).toBe('none');
  });

  test('validateToken handles other HTTP errors', async () => {
    global.fetch.mockResolvedValue({
      ok: false,
      status: 500
    });

    const toastManager = {};
    const result = await validateToken('token', toastManager);

    const statusEl = document.getElementById('tokenStatus');
    expect(statusEl.textContent).toContain('Error (500)');
    expect(statusEl.className).toContain('invalid');
    expect(result).toEqual({ isValid: false, reason: 'http', status: 500 });
  });

  test('validateToken skips stale API error UI updates', async () => {
    global.fetch.mockResolvedValue({
      ok: false,
      status: 500
    });

    document.getElementById('tokenStatus').textContent = 'Checking...';
    document.getElementById('tokenStatus').className = 'token-status checking';
    document.getElementById('clearTokenBtn').style.display = 'block';

    const toastManager = {};
    const result = await validateToken('stale-token', toastManager, {
      shouldApplyResult: () => false
    });

    expect(result).toEqual({ isValid: false, reason: 'http', status: 500 });
    expect(document.getElementById('tokenStatus').textContent).toBe('Checking...');
    expect(document.getElementById('tokenStatus').className).toBe('token-status checking');
    expect(document.getElementById('clearTokenBtn').style.display).toBe('block');
    expect(toastManager.lastApiError).toBeUndefined();
  });

  test('validateToken handles network errors', async () => {
    global.fetch.mockRejectedValue(new Error('Network error'));

    const toastManager = {};
    const result = await validateToken('token', toastManager);

    const statusEl = document.getElementById('tokenStatus');
    expect(statusEl.textContent).toContain('Network error');
    expect(statusEl.className).toContain('invalid');
    expect(result).toEqual({ isValid: false, reason: 'network' });
  });

  test('validateToken skips stale network-error UI updates', async () => {
    global.fetch.mockRejectedValue(new Error('Network error'));

    document.getElementById('tokenStatus').textContent = 'Checking...';
    document.getElementById('tokenStatus').className = 'token-status checking';
    document.getElementById('clearTokenBtn').style.display = 'block';

    const toastManager = {};
    const result = await validateToken('stale-token', toastManager, {
      shouldApplyResult: () => false
    });

    expect(result).toEqual({ isValid: false, reason: 'network' });
    expect(document.getElementById('tokenStatus').textContent).toBe('Checking...');
    expect(document.getElementById('tokenStatus').className).toBe('token-status checking');
    expect(document.getElementById('clearTokenBtn').style.display).toBe('block');
  });

  test('validateToken shows success toast only on first validation', async () => {
    global.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({ login: 'testuser' })
    });

    const toastManager = { isManualTokenEntry: true };

    await validateToken('new-token', toastManager);
    expect(toastManager.lastValidToken).toBe('new-token');

    // Second validation with same token shouldn't show toast
    await validateToken('new-token', toastManager);
  });

  test('validateToken shows error toast only once per token', async () => {
    global.fetch.mockResolvedValue({
      ok: false,
      status: 401
    });

    const toastManager = {};

    await validateToken('bad-token', toastManager);
    expect(toastManager.lastInvalidToken).toBe('bad-token');
  });

  test('validateToken shows API error toast only once per status', async () => {
    global.fetch.mockResolvedValue({
      ok: false,
      status: 500
    });

    const toastManager = {};

    await validateToken('token', toastManager);
    expect(toastManager.lastApiError).toBe(500);
  });

  test('validateToken enables import section on valid token', async () => {
    global.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({ login: 'testuser' })
    });

    const toastManager = {};
    const importSection = document.getElementById('importReposSection');
    importSection.classList.add('hidden');

    await validateToken('token', toastManager);

    expect(importSection.classList.contains('hidden')).toBe(false);
    expect(importSection.style.display).toBe('block');
  });

  test('validateToken disables import section on invalid token', async () => {
    global.fetch.mockResolvedValue({
      ok: false,
      status: 401
    });

    const toastManager = {};
    const importSection = document.getElementById('importReposSection');

    await validateToken('token', toastManager);

    expect(importSection.classList.contains('hidden')).toBe(true);
    expect(importSection.style.display).toBe('none');
  });
});
