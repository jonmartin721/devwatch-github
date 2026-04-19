import { jest } from '@jest/globals';

const mockCompleteGitHubDeviceAuth = jest.fn();
const mockClearAuthSession = jest.fn(() => Promise.resolve());
const mockGetAuthSession = jest.fn(() => Promise.resolve(null));
const mockSetAuthSession = jest.fn(() => Promise.resolve());

jest.unstable_mockModule('../shared/auth.js', () => ({
  completeGitHubDeviceAuth: mockCompleteGitHubDeviceAuth
}));

jest.unstable_mockModule('../shared/storage-helpers.js', () => ({
  clearAuthSession: mockClearAuthSession,
  getAuthSession: mockGetAuthSession,
  setAuthSession: mockSetAuthSession
}));

const {
  applyStoredConnection,
  clearToken,
  connectGitHub
} = await import('../options/controllers/token-controller.js');

describe('Token Controller', () => {
  beforeEach(() => {
    document.body.innerHTML = `
      <button id="connectGitHubBtn">Connect GitHub</button>
      <button id="clearTokenBtn" class="hidden">Disconnect</button>
      <div id="deviceCodeSection" class="hidden">
        <input id="githubToken" type="text" value="" />
      </div>
      <div id="tokenStatus" class="token-status"></div>
      <input id="repoInput" />
      <button id="addRepoBtn">Add</button>
      <div id="repoHelpText"></div>
      <div id="importReposSection" class="hidden"></div>
    `;

    jest.clearAllMocks();
    global.confirm = jest.fn(() => true);
  });

  test('applyStoredConnection restores signed-out state', () => {
    applyStoredConnection(null);

    expect(document.getElementById('connectGitHubBtn').textContent).toBe('Connect GitHub');
    expect(document.getElementById('clearTokenBtn').classList.contains('hidden')).toBe(true);
    expect(document.getElementById('repoInput').disabled).toBe(true);
    expect(document.getElementById('addRepoBtn').disabled).toBe(true);
    expect(document.getElementById('repoHelpText').textContent).toContain('Connect GitHub above');
  });

  test('applyStoredConnection restores connected state', () => {
    applyStoredConnection({
      accessToken: 'oauth-token',
      username: 'octocat'
    });

    expect(document.getElementById('connectGitHubBtn').textContent).toBe('Reconnect GitHub');
    expect(document.getElementById('clearTokenBtn').classList.contains('hidden')).toBe(false);
    expect(document.getElementById('tokenStatus').textContent).toContain('octocat');
    expect(document.getElementById('repoInput').disabled).toBe(false);
    expect(document.getElementById('importReposSection').classList.contains('hidden')).toBe(false);
  });

  test('clearToken does nothing when cancelled', async () => {
    global.confirm.mockReturnValue(false);

    const result = await clearToken();

    expect(result).toBe(false);
    expect(mockClearAuthSession).not.toHaveBeenCalled();
  });

  test('clearToken clears auth state when confirmed', async () => {
    applyStoredConnection({
      accessToken: 'oauth-token',
      username: 'octocat'
    });

    const result = await clearToken();

    expect(result).toBe(true);
    expect(mockClearAuthSession).toHaveBeenCalled();
    expect(document.getElementById('clearTokenBtn').classList.contains('hidden')).toBe(true);
    expect(document.getElementById('repoInput').disabled).toBe(true);
  });

  test('connectGitHub stores auth session after a successful device flow', async () => {
    mockCompleteGitHubDeviceAuth.mockImplementation(async ({ onCode }) => {
      await onCode({ userCode: 'ABCD-EFGH' });
      return {
        user: { login: 'octocat' },
        authSession: {
          accessToken: 'oauth-token',
          username: 'octocat'
        }
      };
    });

    const result = await connectGitHub({});

    expect(result).toEqual({
      isValid: true,
      user: 'octocat',
      authSession: {
        accessToken: 'oauth-token',
        username: 'octocat'
      }
    });
    expect(mockSetAuthSession).toHaveBeenCalledWith({
      accessToken: 'oauth-token',
      username: 'octocat'
    });
    expect(document.getElementById('connectGitHubBtn').textContent).toBe('Reconnect GitHub');
    expect(document.getElementById('tokenStatus').textContent).toContain('octocat');
    expect(document.getElementById('githubToken').value).toBe('');
  });

  test('connectGitHub keeps the existing session enabled when reconnect fails', async () => {
    mockGetAuthSession.mockResolvedValueOnce({
      accessToken: 'existing-token',
      username: 'existing-user'
    });
    mockCompleteGitHubDeviceAuth.mockRejectedValueOnce(Object.assign(new Error('cancelled'), {
      code: 'access_denied'
    }));

    const result = await connectGitHub({});

    expect(result).toEqual({ isValid: false, reason: 'access_denied' });
    expect(document.getElementById('clearTokenBtn').classList.contains('hidden')).toBe(false);
    expect(document.getElementById('repoInput').disabled).toBe(false);
    expect(document.getElementById('tokenStatus').textContent).toContain('cancelled');
  });
});
