import { jest } from '@jest/globals';

const mockCreateTab = jest.fn();

global.chrome = {
  tabs: {
    create: mockCreateTab
  }
};

describe('GitHub OAuth helpers', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = jest.fn();
  });

  it('requests a GitHub device code', async () => {
    const { requestGitHubDeviceCode } = await import('../shared/auth.js');

    global.fetch.mockResolvedValueOnce({
      ok: true,
      text: () => Promise.resolve(JSON.stringify({
        device_code: 'device-code',
        user_code: 'ABCD-EFGH',
        verification_uri: 'https://github.com/login/device',
        verification_uri_complete: 'https://github.com/login/device?user_code=ABCD-EFGH',
        expires_in: 900,
        interval: 5
      }))
    });

    const result = await requestGitHubDeviceCode();

    expect(result).toEqual({
      deviceCode: 'device-code',
      userCode: 'ABCD-EFGH',
      verificationUri: 'https://github.com/login/device',
      verificationUriComplete: 'https://github.com/login/device?user_code=ABCD-EFGH',
      expiresIn: 900,
      interval: 5
    });
    expect(global.fetch).toHaveBeenCalledWith(
      'https://github.com/login/device/code',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'Accept': 'application/json'
        })
      })
    );
  });

  it('opens the GitHub verification page in a new tab', async () => {
    const { openGitHubDevicePage } = await import('../shared/auth.js');

    openGitHubDevicePage({
      verificationUri: 'https://github.com/login/device',
      verificationUriComplete: 'https://github.com/login/device?user_code=ABCD-EFGH'
    });

    expect(mockCreateTab).toHaveBeenCalledWith({
      url: 'https://github.com/login/device?user_code=ABCD-EFGH'
    });
  });

  it('polls until the user approves sign-in', async () => {
    const { pollForGitHubAccessToken } = await import('../shared/auth.js');

    global.fetch
      .mockResolvedValueOnce({
        ok: true,
        text: () => Promise.resolve(JSON.stringify({
          error: 'authorization_pending'
        }))
      })
      .mockResolvedValueOnce({
        ok: true,
        text: () => Promise.resolve(JSON.stringify({
          access_token: 'oauth-token',
          token_type: 'bearer',
          scope: 'repo read:user'
        }))
      });

    const result = await pollForGitHubAccessToken({
      deviceCode: 'device-code',
      expiresIn: 900,
      interval: 0
    });

    expect(result).toEqual({
      accessToken: 'oauth-token',
      tokenType: 'bearer',
      scopes: ['repo', 'read:user'],
      refreshToken: null,
      refreshTokenExpiresIn: null,
      expiresIn: null
    });
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  it('fetches the authenticated GitHub user with bearer auth', async () => {
    const { fetchGitHubUser } = await import('../shared/auth.js');

    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ login: 'octocat', id: 1 })
    });

    const result = await fetchGitHubUser('oauth-token');

    expect(result).toEqual({ login: 'octocat', id: 1 });
    expect(global.fetch).toHaveBeenCalledWith(
      'https://api.github.com/user',
      expect.objectContaining({
        headers: expect.objectContaining({
          'Authorization': 'Bearer oauth-token'
        })
      })
    );
  });
});
