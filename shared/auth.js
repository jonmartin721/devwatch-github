import { API_CONFIG, OAUTH_CONFIG } from './config.js';
import { isValidGitHubAuthUrl } from './security.js';

function getStorageValue(area, key) {
  return new Promise((resolve) => {
    area.get([key], (result) => resolve(result?.[key] ?? null));
  });
}

function buildFormBody(params) {
  const body = new URLSearchParams();

  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      body.set(key, value);
    }
  });

  return body.toString();
}

function getOAuthHeaders() {
  return {
    'Accept': 'application/json',
    'Content-Type': 'application/x-www-form-urlencoded'
  };
}

async function parseOAuthResponse(response) {
  const text = await response.text();

  if (!text) {
    return {};
  }

  try {
    return JSON.parse(text);
  } catch (_error) {
    return Object.fromEntries(new URLSearchParams(text).entries());
  }
}

function createOAuthError(message, code, details = {}) {
  const error = new Error(message);
  error.code = code;
  Object.assign(error, details);
  return error;
}

function waitFor(ms, signal) {
  return new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      cleanup();
      resolve();
    }, ms);

    function onAbort() {
      cleanup();
      reject(createOAuthError('GitHub sign-in was cancelled.', 'aborted'));
    }

    function cleanup() {
      clearTimeout(timeoutId);
      signal?.removeEventListener('abort', onAbort);
    }

    if (signal?.aborted) {
      cleanup();
      reject(createOAuthError('GitHub sign-in was cancelled.', 'aborted'));
      return;
    }

    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

function normalizeScopes(scopeValue = '') {
  return String(scopeValue)
    .split(/[,\s]+/)
    .map(scope => scope.trim())
    .filter(Boolean);
}

function getScopeString(scopes = OAUTH_CONFIG.SCOPES) {
  return scopes.join(' ');
}

function isConfiguredClientId(clientId) {
  return Boolean(clientId);
}

async function getGitHubOAuthClientId() {
  const storageKey = OAUTH_CONFIG.CLIENT_ID_STORAGE_KEY;

  if (chrome?.storage?.local) {
    const localValue = await getStorageValue(chrome.storage.local, storageKey);
    if (typeof localValue === 'string' && localValue.trim()) {
      return localValue.trim();
    }
  }

  if (chrome?.storage?.sync) {
    const syncValue = await getStorageValue(chrome.storage.sync, storageKey);
    if (typeof syncValue === 'string' && syncValue.trim()) {
      return syncValue.trim();
    }
  }

  return OAUTH_CONFIG.CLIENT_ID;
}

async function requireGitHubOAuthClientId() {
  const clientId = await getGitHubOAuthClientId();

  if (!isConfiguredClientId(clientId)) {
    throw createOAuthError(
      'GitHub OAuth client ID is not configured. Add one before testing sign-in.',
      'client_id_missing',
      { storageKey: OAUTH_CONFIG.CLIENT_ID_STORAGE_KEY }
    );
  }

  return clientId;
}

export function createOAuthHeaders(accessToken) {
  return {
    'Authorization': `Bearer ${accessToken}`,
    'Accept': 'application/vnd.github.v3+json'
  };
}

export function createGitHubAuthSession(tokenData, user) {
  const now = new Date().toISOString();

  return {
    authType: 'oauth_device',
    accessToken: tokenData.accessToken,
    tokenType: tokenData.tokenType || 'bearer',
    scopes: tokenData.scopes || [],
    username: user?.login || '',
    userId: user?.id || null,
    grantedAt: now,
    expiresIn: tokenData.expiresIn ?? null,
    refreshToken: tokenData.refreshToken ?? null,
    refreshTokenExpiresIn: tokenData.refreshTokenExpiresIn ?? null
  };
}

export async function requestGitHubDeviceCode() {
  const clientId = await requireGitHubOAuthClientId();

  const response = await fetch(OAUTH_CONFIG.DEVICE_CODE_URL, {
    method: 'POST',
    headers: getOAuthHeaders(),
    body: buildFormBody({
      client_id: clientId,
      scope: getScopeString()
    })
  });

  const data = await parseOAuthResponse(response);

  if (!response.ok) {
    throw createOAuthError(
      data.error_description || 'GitHub sign-in could not be started.',
      data.error || 'device_code_failed',
      { status: response.status }
    );
  }

  return {
    deviceCode: data.device_code,
    userCode: data.user_code,
    verificationUri: data.verification_uri || OAUTH_CONFIG.DEVICE_VERIFY_URL,
    verificationUriComplete: data.verification_uri_complete || null,
    expiresIn: data.expires_in,
    interval: data.interval ?? 5
  };
}

export function openGitHubDevicePage(deviceCodeData) {
  const targetUrl = deviceCodeData.verificationUriComplete || deviceCodeData.verificationUri || OAUTH_CONFIG.DEVICE_VERIFY_URL;

  if (!isValidGitHubAuthUrl(targetUrl)) {
    throw createOAuthError(
      'GitHub sign-in returned an unexpected verification URL.',
      'invalid_verification_url'
    );
  }

  if (chrome?.tabs?.create) {
    chrome.tabs.create({ url: targetUrl });
  }

  return targetUrl;
}

export async function pollForGitHubAccessToken(deviceCodeData, options = {}) {
  const clientId = await requireGitHubOAuthClientId();
  const { signal, onPoll } = options;
  const expiresAt = deviceCodeData.expiresAt ?? (Date.now() + ((deviceCodeData.expiresIn ?? 900) * 1000));
  let intervalMs = (deviceCodeData.interval ?? 5) * 1000;

  while (Date.now() < expiresAt) {
    onPoll?.({
      expiresAt,
      intervalMs,
      remainingMs: Math.max(0, expiresAt - Date.now())
    });

    const response = await fetch(OAUTH_CONFIG.ACCESS_TOKEN_URL, {
      method: 'POST',
      headers: getOAuthHeaders(),
      body: buildFormBody({
        client_id: clientId,
        device_code: deviceCodeData.deviceCode,
        grant_type: 'urn:ietf:params:oauth:grant-type:device_code'
      }),
      signal
    });

    const data = await parseOAuthResponse(response);

    if (data.access_token) {
      return {
        accessToken: data.access_token,
        tokenType: data.token_type || 'bearer',
        scopes: normalizeScopes(data.scope),
        refreshToken: data.refresh_token || null,
        refreshTokenExpiresIn: data.refresh_token_expires_in ?? null,
        expiresIn: data.expires_in ?? null
      };
    }

    switch (data.error) {
      case 'authorization_pending':
        await waitFor(intervalMs, signal);
        continue;
      case 'slow_down':
        intervalMs += 5000;
        await waitFor(intervalMs, signal);
        continue;
      case 'access_denied':
        throw createOAuthError('GitHub sign-in was denied.', 'access_denied');
      case 'expired_token':
        throw createOAuthError('GitHub sign-in code expired. Start again to reconnect.', 'expired_token');
      default:
        throw createOAuthError(
          data.error_description || 'GitHub sign-in failed while waiting for approval.',
          data.error || 'poll_failed',
          { status: response.status }
        );
    }
  }

  throw createOAuthError('GitHub sign-in code expired. Start again to reconnect.', 'expired_token');
}

export async function fetchGitHubUser(accessToken) {
  const response = await fetch(`${API_CONFIG.GITHUB_API_BASE}/user`, {
    headers: createOAuthHeaders(accessToken)
  });

  if (!response.ok) {
    throw createOAuthError('Could not load the GitHub account after sign-in.', 'user_fetch_failed', {
      status: response.status
    });
  }

  return response.json();
}

export async function completeGitHubDeviceAuth(options = {}) {
  const deviceCodeData = await requestGitHubDeviceCode();

  options.onCode?.(deviceCodeData);
  openGitHubDevicePage(deviceCodeData);

  const tokenData = await pollForGitHubAccessToken(deviceCodeData, {
    signal: options.signal,
    onPoll: options.onPoll
  });
  const user = await fetchGitHubUser(tokenData.accessToken);

  return {
    deviceCodeData,
    tokenData,
    user,
    authSession: createGitHubAuthSession(tokenData, user)
  };
}
