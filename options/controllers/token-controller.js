import { completeGitHubDeviceAuth } from '../../shared/auth.js';
import {
  clearAuthSession,
  getAuthSession,
  setAuthSession
} from '../../shared/storage-helpers.js';
import { OAUTH_CONFIG } from '../../shared/config.js';
import { NotificationManager } from '../../shared/ui/notification-manager.js';

const notifications = NotificationManager.getInstance();

function setRepoAccessState(isConnected) {
  const repoInput = document.getElementById('repoInput');
  const addRepoBtn = document.getElementById('addRepoBtn');
  const repoHelpText = document.getElementById('repoHelpText');
  const importSection = document.getElementById('importReposSection');

  repoInput.disabled = !isConnected;
  repoInput.placeholder = isConnected
    ? 'e.g., react, facebook/react, or GitHub URL'
    : 'Connect GitHub to add repositories';
  addRepoBtn.disabled = !isConnected;
  repoHelpText.textContent = isConnected
    ? 'Add repositories to monitor (npm package, owner/repo, or GitHub URL)'
    : 'Connect GitHub above to start adding repositories';
  importSection.classList.toggle('hidden', !isConnected);
}

function setDeviceCode(userCode = '') {
  const deviceCodeInput = document.getElementById('githubToken');
  const deviceCodeSection = document.getElementById('deviceCodeSection');

  if (!deviceCodeInput || !deviceCodeSection) {
    return;
  }

  deviceCodeInput.value = userCode;
  deviceCodeSection.classList.toggle('hidden', !userCode);
}

function setHelpText(message = '') {
  const helpEl = document.getElementById('token-help');

  if (!helpEl) {
    return;
  }

  helpEl.textContent = message;
}

function getHelpText({ isConnected = false, isWaiting = false } = {}) {
  if (isWaiting) {
    return 'Approve access in the GitHub tab, then return here. We copied the code to your clipboard in case GitHub asks for it.';
  }

  if (isConnected) {
    return 'Reconnect any time if your session expires or if you want to switch accounts.';
  }

  return 'We\'ll open GitHub in a new tab and copy your code to the clipboard so it\'s ready if GitHub asks for it. Then come back here and DevWatch will finish connecting.';
}

function setStatus(message = '', statusClass = '') {
  const statusEl = document.getElementById('tokenStatus');

  if (!statusEl) {
    return;
  }

  statusEl.textContent = message;
  statusEl.className = `token-status${statusClass ? ` ${statusClass}` : ''}`;
}

export function applyStoredConnection(authSession, options = {}) {
  const connectBtn = document.getElementById('connectGitHubBtn');
  const clearBtn = document.getElementById('clearTokenBtn');
  const isConnected = Boolean(authSession?.accessToken);
  const username = authSession?.username;

  setRepoAccessState(isConnected);
  setDeviceCode(options.userCode || '');
  setHelpText(options.helpText || getHelpText({
    isConnected,
    isWaiting: options.statusClass === 'checking'
  }));

  if (connectBtn) {
    connectBtn.disabled = false;
    connectBtn.textContent = isConnected ? 'Reconnect GitHub' : 'Connect GitHub';
  }

  if (clearBtn) {
    clearBtn.classList.toggle('hidden', !isConnected);
  }

  if (options.statusMessage) {
    setStatus(options.statusMessage, options.statusClass);
    return;
  }

  if (isConnected) {
    setStatus(
      username ? `Connected as ${username}` : 'GitHub is connected',
      'valid'
    );
  } else {
    setStatus('', '');
  }
}

export async function clearToken() {
  if (!confirm('Disconnect GitHub from DevWatch?')) {
    return false;
  }

  await clearAuthSession();

  applyStoredConnection(null);
  notifications.info('GitHub disconnected');
  return true;
}

function getErrorMessage(error) {
  switch (error?.code) {
    case 'client_id_missing':
      return 'GitHub OAuth client ID is not configured for this build yet.';
    case 'access_denied':
      return 'GitHub sign-in was cancelled before access was granted.';
    case 'expired_token':
      return 'The GitHub sign-in code expired. Start again to reconnect.';
    case 'aborted':
      return 'GitHub sign-in was cancelled.';
    default:
      return 'GitHub sign-in failed. Try again in a moment.';
  }
}

export async function connectGitHub(_toastManager) {
  const previousSession = await getAuthSession();
  const connectBtn = document.getElementById('connectGitHubBtn');
  let nextButtonLabel = previousSession?.accessToken ? 'Reconnect GitHub' : 'Connect GitHub';

  if (connectBtn) {
    connectBtn.disabled = true;
    connectBtn.textContent = 'Waiting for GitHub...';
  }

  setRepoAccessState(Boolean(previousSession?.accessToken));
  setStatus('Starting GitHub sign-in...', 'checking');
  setHelpText('We\'re opening GitHub and copying your code to the clipboard so it\'s ready if GitHub asks for it. Come back here as soon as GitHub says the connection is ready.');

  try {
    const result = await completeGitHubDeviceAuth({
      onCode: async ({ userCode }) => {
        setDeviceCode(userCode || '');
        const copied = navigator.clipboard?.writeText
          ? await navigator.clipboard.writeText(userCode).then(() => true).catch(() => false)
          : false;
        setStatus(
          copied
            ? `Code ${userCode} copied to clipboard in case GitHub asks for it.`
            : `If GitHub asks for a code, enter ${userCode}.`,
          'checking'
        );
        setHelpText(getHelpText({ isWaiting: true }));
      }
    });

    await setAuthSession(result.authSession);

    applyStoredConnection(result.authSession);
    nextButtonLabel = 'Reconnect GitHub';
    notifications.success(`Connected to GitHub as ${result.user.login}`);
    return { isValid: true, user: result.user.login, authSession: result.authSession };
  } catch (error) {
    applyStoredConnection(previousSession, {
      statusMessage: getErrorMessage(error),
      statusClass: 'invalid'
    });

    if (previousSession?.accessToken) {
      notifications.warning(getErrorMessage(error));
    } else {
      notifications.error(getErrorMessage(error));
    }

    return { isValid: false, reason: error?.code || 'auth_failed' };
  } finally {
    if (connectBtn) {
      connectBtn.disabled = false;
      connectBtn.textContent = nextButtonLabel;
    }
  }
}

export function getDisconnectHelpUrl() {
  return OAUTH_CONFIG.AUTHORIZED_APPS_URL;
}
