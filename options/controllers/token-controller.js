import { createHeaders } from '../../shared/github-api.js';
import { clearToken as clearStoredToken } from '../../shared/storage-helpers.js';
import { NotificationManager } from '../../shared/ui/notification-manager.js';

const notifications = NotificationManager.getInstance();

export async function clearToken() {
  if (!confirm('Are you sure you want to clear your GitHub token?')) {
    return;
  }

  document.getElementById('githubToken').value = '';
  document.getElementById('tokenStatus').textContent = '';
  document.getElementById('tokenStatus').className = 'token-status';
  document.getElementById('clearTokenBtn').style.display = 'none';

  const repoInput = document.getElementById('repoInput');
  repoInput.disabled = true;
  repoInput.placeholder = 'Enter a valid GitHub token to add repositories';
  document.getElementById('addRepoBtn').disabled = true;
  document.getElementById('repoHelpText').textContent = 'Add a valid GitHub token above to start adding repositories';

  document.getElementById('importReposSection').style.display = 'none';

  await clearStoredToken();

  notifications.info('GitHub token cleared successfully');
}

export async function validateToken(token, toastManager, options = {}) {
  const statusEl = document.getElementById('tokenStatus');
  const shouldApplyResult = options.shouldApplyResult ?? (() => true);

  try {
    const response = await fetch('https://api.github.com/user', {
      headers: createHeaders(token)
    });

    if (response.ok) {
      const user = await response.json();
      if (!shouldApplyResult()) {
        return { isValid: true, user: user.login };
      }

      statusEl.textContent = `✓ Valid (${user.login})`;
      statusEl.className = 'token-status valid';
      document.getElementById('clearTokenBtn').style.display = 'block';

      const repoInput = document.getElementById('repoInput');
      repoInput.disabled = false;
      repoInput.placeholder = 'e.g., react, facebook/react, or GitHub URL';
      document.getElementById('addRepoBtn').disabled = false;
      document.getElementById('repoHelpText').textContent = 'Add repositories to monitor (npm package, owner/repo, or GitHub URL)';

      const importSection = document.getElementById('importReposSection');
      importSection.classList.remove('hidden');
      importSection.style.display = 'block';

      if (!toastManager.lastValidToken || toastManager.lastValidToken !== token) {
        if (toastManager.isManualTokenEntry) {
          notifications.success(`GitHub token validated successfully for user: ${user.login}`);
        }
        toastManager.lastValidToken = token;
      }

      toastManager.isManualTokenEntry = false;
      return { isValid: true, user: user.login };
    } else if (response.status === 401) {
      if (!shouldApplyResult()) {
        return { isValid: false, reason: 'invalid' };
      }

      statusEl.textContent = '✗ Invalid token';
      statusEl.className = 'token-status invalid';
      document.getElementById('clearTokenBtn').style.display = 'none';

      const repoInput = document.getElementById('repoInput');
      repoInput.disabled = true;
      repoInput.placeholder = 'Enter a valid GitHub token to add repositories';
      document.getElementById('addRepoBtn').disabled = true;
      document.getElementById('repoHelpText').textContent = 'Invalid token. Please check your GitHub token and try again.';

      const importSection = document.getElementById('importReposSection');
      importSection.classList.add('hidden');
      importSection.style.display = 'none';

      if (!toastManager.lastInvalidToken || toastManager.lastInvalidToken !== token) {
        notifications.error('Invalid GitHub token. Please check your token and try again.');
        toastManager.lastInvalidToken = token;
      }
      return { isValid: false, reason: 'invalid' };
    } else {
      if (!shouldApplyResult()) {
        return { isValid: false, reason: 'http', status: response.status };
      }

      statusEl.textContent = `✗ Error (${response.status})`;
      statusEl.className = 'token-status invalid';
      document.getElementById('clearTokenBtn').style.display = 'none';

      const repoInput = document.getElementById('repoInput');
      repoInput.disabled = true;
      repoInput.placeholder = 'Enter a valid GitHub token to add repositories';
      document.getElementById('addRepoBtn').disabled = true;
      document.getElementById('repoHelpText').textContent = 'GitHub API error. Please try again later.';

      const importSection = document.getElementById('importReposSection');
      importSection.classList.add('hidden');
      importSection.style.display = 'none';

      if (!toastManager.lastApiError || toastManager.lastApiError !== response.status) {
        notifications.error(`GitHub API error (${response.status}). Please try again later.`);
        toastManager.lastApiError = response.status;
      }
      return { isValid: false, reason: 'http', status: response.status };
    }
  } catch (_error) {
    if (!shouldApplyResult()) {
      return { isValid: false, reason: 'network' };
    }

    statusEl.textContent = '✗ Network error';
    statusEl.className = 'token-status invalid';
    document.getElementById('clearTokenBtn').style.display = 'none';

    const repoInput = document.getElementById('repoInput');
    repoInput.disabled = true;
    repoInput.placeholder = 'Enter a valid GitHub token to add repositories';
    document.getElementById('addRepoBtn').disabled = true;
    document.getElementById('repoHelpText').textContent = 'Network error. Please check your connection and try again.';

    document.getElementById('importReposSection').style.display = 'none';

    notifications.error('Network error while validating token. Please check your connection and try again.');
    return { isValid: false, reason: 'network' };
  }
}
