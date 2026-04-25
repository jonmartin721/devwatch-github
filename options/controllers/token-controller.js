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
  const githubImportButtons = document.querySelectorAll('.github-import-btn');

  repoInput.disabled = false;
  repoInput.placeholder = isConnected
    ? 'e.g., react, facebook/react, or GitHub URL'
    : 'e.g., react, facebook/react, GitHub URL, or public npm package';
  addRepoBtn.disabled = false;
  repoHelpText.textContent = isConnected
    ? 'Add repositories to monitor (npm package, owner/repo, or GitHub URL)'
    : 'Add public repositories manually now, or connect GitHub above to import your repos and access private ones.';
  githubImportButtons.forEach((button) => {
    button.classList.toggle('hidden', !isConnected);
  });
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

function setStatusRowVisible(isVisible) {
  const statusRow = document.querySelector('.github-connect-status-row');

  if (!statusRow) {
    return;
  }

  statusRow.classList.toggle('hidden', !isVisible);
}

function setConnectionUiMode(isConnected) {
  const connectCard = document.querySelector('.github-connect-card');
  const introText = document.getElementById('githubConnectIntroText');
  const connectedNote = document.getElementById('githubConnectConnectedNote');
  const panelHeading = document.getElementById('githubConnectPanelHeading');
  const panelCopy = document.getElementById('githubConnectPanelCopy');

  connectCard?.classList.toggle('is-connected', isConnected);

  if (introText) {
    introText.textContent = 'Authorize DevWatch once so it can pull activity for the repositories you monitor without asking for a personal access token.';
  }

  if (connectedNote) {
    connectedNote.textContent = 'You\'re all set. DevWatch keeps this browser profile connected until you disconnect or reset it.';
  }

  if (panelHeading) {
    panelHeading.textContent = isConnected
      ? 'Reconnect only if GitHub asks again'
      : 'Connect once, then just paste if GitHub asks';
  }

  if (panelCopy) {
    panelCopy.textContent = 'DevWatch opens GitHub for you and copies the verification code automatically, so the only extra step is pasting it if GitHub prompts for one.';
  }
}

function getHelpText({ isConnected = false, isWaiting = false } = {}) {
  if (isWaiting) {
    return 'Approve access in the GitHub tab, then return here. If GitHub asks for a code, just paste the one DevWatch already copied for you.';
  }

  if (isConnected) {
    return 'Your GitHub connection stays in this Chrome profile until you disconnect it or reset DevWatch. If GitHub asks for a code during reconnect, just paste the one DevWatch copies for you.';
  }

  return 'We\'ll open GitHub in a new tab and copy the code for you. If GitHub asks for one, just paste it there, approve access, and come back here.';
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
  const hasStatusMessage = Boolean(options.statusMessage);

  setConnectionUiMode(isConnected);
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
    setStatusRowVisible(true);
    return;
  }

  if (isConnected) {
    setStatus(
      username ? `Connected as ${username}` : 'GitHub is connected',
      'valid'
    );
    setStatusRowVisible(true);
  } else {
    setStatus('', '');
    setStatusRowVisible(hasStatusMessage);
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

  setConnectionUiMode(Boolean(previousSession?.accessToken));
  setRepoAccessState(Boolean(previousSession?.accessToken));
  setStatus('Starting GitHub sign-in...', 'checking');
  setStatusRowVisible(true);
  setHelpText('We\'re opening GitHub and copying the code for you. If GitHub asks for one, just paste it there, then come back here as soon as the connection is ready.');

  try {
    const result = await completeGitHubDeviceAuth({
      onCode: async ({ userCode }) => {
        setDeviceCode(userCode || '');
        const copied = navigator.clipboard?.writeText
          ? await navigator.clipboard.writeText(userCode).then(() => true).catch(() => false)
          : false;
        setStatus(
          copied
            ? `Code ${userCode} copied to your clipboard. Paste it on GitHub only if GitHub asks for it.`
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
