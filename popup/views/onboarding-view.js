import {
  createGitHubAuthSession,
  fetchGitHubUser,
  openGitHubDevicePage,
  pollForGitHubAccessToken,
  requestGitHubDeviceCode
} from '../../shared/auth.js';
import { OnboardingManager } from '../../shared/onboarding.js';
import { getAccessToken, getWatchedRepos, setAuthSession, setWatchedRepos } from '../../shared/storage-helpers.js';
import { resolveWatchedRepoInput } from '../../shared/repo-service.js';
import { CATEGORY_SETTINGS, createCategorySettings } from '../../shared/settings-schema.js';
import { escapeHtml } from '../../shared/sanitize.js';

// Create onboarding manager instance
const onboardingManager = new OnboardingManager();

function getStatusMarkup(type, message) {
  return `<div class="status-${type}">${escapeHtml(message)}</div>`;
}

async function addWatchedRepoFromInput(rawInput) {
  const githubToken = await getAccessToken();
  const existingRepos = await getWatchedRepos();
  const resolution = await resolveWatchedRepoInput(rawInput, {
    githubToken,
    existingRepos
  });

  if (!resolution.valid) {
    return resolution;
  }

  await setWatchedRepos([...existingRepos, resolution.record]);

  return {
    ...resolution,
    alreadyExists: false
  };
}

async function copyTextToClipboard(text) {
  if (!text) {
    return false;
  }

  if (navigator?.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return true;
  }

  const activeElement = document.activeElement;
  const tempInput = document.createElement('input');
  tempInput.value = text;
  tempInput.setAttribute('readonly', '');
  tempInput.style.position = 'absolute';
  tempInput.style.opacity = '0';
  document.body.appendChild(tempInput);
  tempInput.select();

  let copied = false;
  try {
    copied = document.execCommand('copy');
  } finally {
    tempInput.remove();
    activeElement?.focus?.();
  }

  return copied;
}

function createPendingDeviceAuthState(deviceCodeData) {
  const issuedAt = Date.now();
  const expiresAt = issuedAt + ((deviceCodeData.expiresIn ?? 900) * 1000);

  return {
    deviceCode: deviceCodeData.deviceCode,
    userCode: deviceCodeData.userCode,
    verificationUri: deviceCodeData.verificationUri,
    verificationUriComplete: deviceCodeData.verificationUriComplete || null,
    interval: deviceCodeData.interval ?? 5,
    expiresIn: deviceCodeData.expiresIn ?? 900,
    issuedAt,
    expiresAt
  };
}

function getPendingDeviceCodeData(tokenData) {
  const pending = tokenData?.pendingDeviceAuth;
  if (!pending?.deviceCode) {
    return null;
  }

  return {
    deviceCode: pending.deviceCode,
    userCode: pending.userCode,
    verificationUri: pending.verificationUri,
    verificationUriComplete: pending.verificationUriComplete || null,
    interval: pending.interval ?? 5,
    expiresIn: pending.expiresIn ?? 900,
    expiresAt: pending.expiresAt ?? (Date.now() + ((pending.expiresIn ?? 900) * 1000))
  };
}

async function persistConnectedTokenState(result) {
  await setAuthSession(result.authSession);
  await onboardingManager.saveStepData('token', {
    validated: true,
    username: result.user.login,
    authType: result.authSession.authType || 'oauth_device'
  });
}

async function completePendingDeviceAuth(tokenData, elements, options = {}) {
  const pendingDeviceCodeData = getPendingDeviceCodeData(tokenData);
  if (!pendingDeviceCodeData) {
    return null;
  }

  const { tokenStatus, validateBtn, nextBtn } = elements;
  if (options.showCheckingStatus) {
    tokenStatus.innerHTML = getStatusMarkup('loading', 'Checking GitHub connection...');
  }
  validateBtn.disabled = true;

  try {
    const tokenDataResult = await pollForGitHubAccessToken(pendingDeviceCodeData);
    const user = await fetchGitHubUser(tokenDataResult.accessToken);
    const result = {
      tokenData: tokenDataResult,
      user,
      authSession: createGitHubAuthSession(tokenDataResult, user)
    };

    await persistConnectedTokenState(result);

    tokenStatus.innerHTML = getStatusMarkup('success', `Connected as ${result.user.login}`);
    validateBtn.textContent = 'Connected';
    if (nextBtn) {
      nextBtn.disabled = false;
    }

    return result;
  } catch (error) {
    if (error?.code === 'authorization_pending') {
      return null;
    }

    if (error?.code === 'access_denied' || error?.code === 'expired_token') {
      await onboardingManager.saveStepData('token', {
        validated: false,
        authType: 'oauth_device'
      });
    }

    throw error;
  }
}

function renderRepoSuggestion(repo) {
  const rawOwner = repo?.owner?.login || 'unknown';
  const rawName = repo?.name || 'unknown';
  const owner = escapeHtml(rawOwner);
  const name = escapeHtml(rawName);
  const description = escapeHtml(repo?.description || `${repo?.language || 'Popular'} project worth watching`);
  const language = escapeHtml(repo?.language || '');
  const repoFullName = `${rawOwner}/${rawName}`;
  const stars = Number.isFinite(repo?.stargazers_count)
    ? repo.stargazers_count.toLocaleString()
    : '';

  return `
    <div class="repo-suggestion" data-owner="${owner}" data-name="${name}">
      <div class="repo-info">
        <div class="repo-name">
          <span class="repo-owner">${owner}</span>/<span class="repo-name-text">${name}</span>
        </div>
        <div class="repo-desc">${description}</div>
        <div class="repo-meta">
          ${language ? `<span class="repo-language">${language}</span>` : ''}
          ${stars ? `<span class="repo-stars"><svg class="svg-inline" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>${stars}</span>` : ''}
        </div>
      </div>
      <button class="add-repo-btn" data-repo="${escapeHtml(repoFullName)}">+</button>
    </div>
  `;
}

/**
 * Onboarding view functions for popup
 * Handles the multi-step onboarding wizard for first-time users
 */

export async function showOnboarding(loadActivitiesCallback) {
  const onboardingView = document.getElementById('onboardingView');
  const activityList = document.getElementById('activityList');
  const toolbar = document.querySelector('.toolbar');
  const searchBox = document.getElementById('searchBox');

  // Hide main content and show onboarding
  if (onboardingView) {
    onboardingView.classList.remove('hidden');
    onboardingView.style.display = 'block';
  }
  if (activityList) activityList.style.display = 'none';
  if (toolbar) toolbar.style.display = 'none';
  if (searchBox) searchBox.style.display = 'none';

  // Hide entire header during onboarding
  const header = document.querySelector('header');
  if (header) {
    header.style.display = 'none';
  }

  // Load current step
  await renderOnboardingStep(loadActivitiesCallback);
}

export async function renderOnboardingStep(loadActivitiesCallback) {
  const onboardingView = document.getElementById('onboardingView');
  const currentStep = await onboardingManager.getCurrentStep();
  const progress = await onboardingManager.getProgress();

  let stepContent = '';

  // Progress bar - only show if not on welcome step
  if (progress.showProgress) {
    stepContent = `
      <div class="onboarding-progress">
        <div class="progress-bar">
          <div class="progress-fill"></div>
        </div>
        <div class="progress-text">Step ${progress.current} of ${progress.total}</div>
      </div>
      <div class="onboarding-content">
    `;
  } else {
    stepContent = '<div class="onboarding-content">';
  }

  // Render current step content
  switch (currentStep) {
    case 'welcome':
      stepContent += renderWelcomeStep();
      break;
    case 'token':
      stepContent += await renderTokenStep();
      break;
    case 'repos':
      stepContent += await renderReposStep();
      break;
    case 'categories':
      stepContent += await renderCategoriesStep();
      break;
    case 'complete':
      stepContent += renderCompleteStep();
      break;
    default:
      stepContent += '<p>Error: Unknown step</p>';
  }

  stepContent += '</div>';

  // Navigation buttons
  const isFinalStep = progress.current === progress.total;
  const isTokenStep = currentStep === 'token';
  const nextButtonText = isTokenStep ? 'Continue' : (isFinalStep ? 'Open Feed' : 'Next');
  const nextButtonDisabled = isTokenStep ? 'disabled' : '';

  stepContent += `
    <div class="onboarding-nav">
      ${progress.current >= 1 ? '<button id="prevBtn" class="onboarding-btn secondary">Previous</button>' : '<div></div>'}
      <div class="nav-center"></div>
      ${!isFinalStep ? `<button id="nextBtn" class="onboarding-btn primary" ${nextButtonDisabled}>${nextButtonText}</button>` : '<button id="finishBtn" class="onboarding-btn primary">Open Feed</button>'}
    </div>
  `;

  onboardingView.innerHTML = stepContent;

  // Set progress bar width programmatically (CSP-compliant)
  if (progress.showProgress) {
    const progressFill = onboardingView.querySelector('.progress-fill');
    if (progressFill) {
      progressFill.style.width = `${progress.percentage}%`;
    }
  }

  // Add event listeners for this step
  setupOnboardingStepListeners(currentStep, loadActivitiesCallback);

  // Show/hide footer skip button based on onboarding step
  const footerSkipBtn = document.getElementById('footerSkipBtn');
  if (footerSkipBtn) {
    // Show skip button for repos and categories steps only (token is required)
    const showSkip = progress.showProgress && currentStep !== 'complete' && currentStep !== 'token';
    if (showSkip) {
      footerSkipBtn.classList.remove('hidden');
      footerSkipBtn.style.display = 'block';
    } else {
      footerSkipBtn.classList.add('hidden');
      footerSkipBtn.style.display = 'none';
    }
  }
}

function renderWelcomeStep() {
  return `
    <div class="onboarding-step welcome-step">
      <div class="step-icon">
        <img src="../icons/icon128.png" alt="GitHub DevWatch Icon" width="64" height="64">
      </div>
      <h2>Stay on top of the repos that matter.</h2>
      <p>DevWatch keeps pull requests, issues, and releases in one compact review queue.</p>
      <div class="feature-list">
        <div class="feature-item">
          <span class="feature-icon">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>
            </svg>
          </span>
          <span>Browser notifications for new activity</span>
        </div>
        <div class="feature-item">
          <span class="feature-icon">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
            </svg>
          </span>
          <span>Regular activity updates from watched repositories</span>
        </div>
        <div class="feature-item">
          <span class="feature-icon">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/>
            </svg>
          </span>
          <span>Customizable filters and preferences</span>
        </div>
      </div>
      <p class="step-description">A quick setup and your watchlist is ready.</p>
    </div>
  `;
}

async function renderTokenStep() {
  const tokenData = await onboardingManager.getStepData('token');

  let statusHtml = '';
  let buttonDisabled = '';
  let buttonText = 'Connect GitHub';
  const safeUserCode = escapeHtml(tokenData?.userCode || '');

  if (tokenData && tokenData.validated && tokenData.username) {
    statusHtml = getStatusMarkup('success', `Connected as ${tokenData.username}`);
    buttonDisabled = 'disabled';
    buttonText = 'Connected';
  } else if (tokenData && tokenData.validated) {
    statusHtml = getStatusMarkup('success', 'GitHub is connected');
    buttonDisabled = 'disabled';
    buttonText = 'Connected';
  } else if (tokenData?.userCode) {
    statusHtml = getStatusMarkup('loading', `Enter ${tokenData.userCode} on GitHub to finish connecting.`);
  }

  return `
    <div class="onboarding-step token-step">
      <h2>Connect your GitHub account</h2>
      <p>We'll open GitHub in a new tab and keep the device code ready here for you.</p>

      <div class="token-instructions">
        <h3>Quick setup</h3>
        <ol>
          <li>Click <strong>Connect GitHub</strong></li>
          <li>Approve access on the GitHub page that opens</li>
          <li>Come back here once GitHub says you're done</li>
        </ol>
      </div>

      <div class="token-input-group">
        <div class="token-code-stack">
          <input
            type="text"
            id="tokenInput"
            placeholder="Verification code appears here"
            class="token-input"
            autocomplete="off"
            value="${safeUserCode}"
            readonly
          >
          <p class="token-copy-hint">Click the code to select it, or use Copy.</p>
        </div>
        <button id="copyTokenCodeBtn" class="copy-code-btn" ${safeUserCode ? '' : 'disabled'}>Copy</button>
        <button id="validateTokenBtn" class="validate-btn" ${buttonDisabled}>${buttonText}</button>
      </div>

      <div id="tokenStatus" class="token-status">${statusHtml}</div>
    </div>

    <p class="security-note">
      <svg class="info-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
      </svg>
      Your GitHub session stays in Chrome session storage for the current browser session only. It's used for GitHub API access and is cleared when the browser session ends.
    </p>
  `;
}

export async function renderReposStep() {
  const saved = await onboardingManager.getStepData('popularRepos');
  const hasSavedRepos = Array.isArray(saved) && saved.length > 0;

  let popularRepos;
  if (hasSavedRepos) {
    popularRepos = saved;
  } else {
    popularRepos = await onboardingManager.getPopularRepos();
  }

  return `
    <div class="onboarding-step repos-step">
      <h2>Build your watchlist</h2>

      <div class="popular-repos">
        <h3>Popular repositories</h3>
        <div class="repo-suggestions" id="repoSuggestions">
          ${popularRepos && popularRepos.length > 0 ?
            popularRepos.map(renderRepoSuggestion).join('') :
            '<div class="repo-loading" id="repoLoading">Loading popular repositories...</div>'
          }
        </div>
      </div>

      <div class="manual-repo">
        <h3>Or add one directly</h3>
        <div class="manual-input-group">
          <input
            type="text"
            id="manualRepoInput"
            placeholder="owner/repo, github.com/owner/repo, or npm package name"
            class="repo-input"
          >
          <button id="addManualRepoBtn" class="add-btn">Add</button>
        </div>
      </div>

      <div id="repoStatus" class="repo-status"></div>
    </div>
  `;
}

function renderCategoriesStep() {
  return `
    <div class="onboarding-step categories-step">
      <h2>Choose what shows up</h2>
      <p class="step-subtitle">Pick activity types and notification behavior</p>

      <div class="categories-list">
        <div class="category-item" data-category="pullRequests">
          <div class="category-icon pr-icon">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="18" cy="18" r="3"/><circle cx="6" cy="6" r="3"/><path d="M13 6h3a2 2 0 0 1 2 2v7"/><line x1="6" x2="6" y1="9" y2="21"/>
            </svg>
          </div>
          <div class="category-info">
            <h3>Pull Requests</h3>
            <p>New PRs and updates</p>
          </div>
          <div class="category-controls">
            <label class="toggle-label">
              <span>Track</span>
              <input type="checkbox" id="pullRequests" class="toggle-checkbox" checked>
              <span class="toggle-switch"></span>
            </label>
            <label class="toggle-label">
              <span>Notify</span>
              <input type="checkbox" id="pullRequestsNotifications" class="toggle-checkbox">
              <span class="toggle-switch"></span>
            </label>
          </div>
        </div>

        <div class="category-item" data-category="issues">
          <div class="category-icon issues-icon">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="1"/>
            </svg>
          </div>
          <div class="category-info">
            <h3>Issues</h3>
            <p>New issues and comments</p>
          </div>
          <div class="category-controls">
            <label class="toggle-label">
              <span>Track</span>
              <input type="checkbox" id="issues" class="toggle-checkbox" checked>
              <span class="toggle-switch"></span>
            </label>
            <label class="toggle-label">
              <span>Notify</span>
              <input type="checkbox" id="issuesNotifications" class="toggle-checkbox">
              <span class="toggle-switch"></span>
            </label>
          </div>
        </div>

        <div class="category-item" data-category="releases">
          <div class="category-icon releases-icon">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="m7.5 4.27 9 5.15"/><path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/><path d="m3.3 7 8.7 5 8.7-5"/><path d="M12 22V12"/>
            </svg>
          </div>
          <div class="category-info">
            <h3>Releases</h3>
            <p>New version releases</p>
          </div>
          <div class="category-controls">
            <label class="toggle-label">
              <span>Track</span>
              <input type="checkbox" id="releases" class="toggle-checkbox" checked>
              <span class="toggle-switch"></span>
            </label>
            <label class="toggle-label">
              <span>Notify</span>
              <input type="checkbox" id="releasesNotifications" class="toggle-checkbox">
              <span class="toggle-switch"></span>
            </label>
          </div>
        </div>
      </div>

      <p class="step-note">You can fine-tune everything later in settings.</p>
    </div>
  `;
}

function renderCompleteStep() {
  return `
    <div class="onboarding-step complete-step">
      <div class="step-icon">
        <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/>
        </svg>
      </div>
      <h2>You're All Set!</h2>
      <p>GitHub DevWatch is now configured and ready to help you stay updated.</p>

      <div class="next-steps">
        <h3>What's next?</h3>
        <div class="tips-grid">
          <div class="tip-item">
            <div class="tip-icon">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
              </svg>
            </div>
            <div class="tip-content">
              <strong>Pin important repos</strong>
              <p>You can pin repositories to prioritize them at the top of your feed</p>
            </div>
          </div>

          <div class="tip-item">
            <div class="tip-icon">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M8.7 3A6 6 0 0 1 18 8a21.3 21.3 0 0 0 .6 5"/><path d="M17 17H3s3-2 3-9a4.67 4.67 0 0 1 .3-1.7"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/><line x1="2" x2="22" y1="2" y2="22"/>
              </svg>
            </div>
            <div class="tip-content">
              <strong>Mute or snooze repos</strong>
              <p>Mute noisy repositories permanently, or snooze them temporarily</p>
            </div>
          </div>

          <div class="tip-item">
            <div class="tip-icon">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="m12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83Z"/><path d="m22.54 12.43-10 4.58a2 2 0 0 1-1.66 0l-9.4-4.3"/><path d="m22.54 16.43-10 4.58a2 2 0 0 1-1.66 0l-9.4-4.3"/>
              </svg>
            </div>
            <div class="tip-content">
              <strong>Import starred/watched repos</strong>
              <p>Quickly import repositories you've starred or are watching on GitHub</p>
            </div>
          </div>

          <div class="tip-item">
            <div class="tip-icon">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>
              </svg>
            </div>
            <div class="tip-content">
              <strong>Filter and search</strong>
              <p>Use the search bar to filter through your activity feed quickly</p>
            </div>
          </div>

          <div class="tip-item">
            <div class="tip-icon">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <rect width="20" height="5" x="2" y="3" rx="1"/><path d="M4 8v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8"/><path d="M10 12h4"/>
              </svg>
            </div>
            <div class="tip-content">
              <strong>Use the archive</strong>
              <p>Archive old activity to keep your feed clean and focused on recent updates</p>
            </div>
          </div>
        </div>
      </div>

      <div class="final-tips">
        <p><strong>Pro tip:</strong> You can always restart this setup from the settings page if you want to make changes.</p>
      </div>
    </div>
  `;
}

export async function setupOnboardingStepListeners(currentStep, loadActivitiesCallback) {
  // Navigation buttons
  const prevBtn = document.getElementById('prevBtn');
  const nextBtn = document.getElementById('nextBtn');
  const finishBtn = document.getElementById('finishBtn');

  prevBtn?.addEventListener('click', async () => {
    await onboardingManager.previousStep();
    await renderOnboardingStep(loadActivitiesCallback);
  });

  nextBtn?.addEventListener('click', async () => {
    await handleNextStep();
  });

  finishBtn?.addEventListener('click', async () => {
    await onboardingManager.completeOnboarding();
    exitOnboarding(loadActivitiesCallback);
  });

  if (currentStep === 'token') {
    const tokenData = await onboardingManager.getStepData('token');
    if (nextBtn) {
      nextBtn.disabled = !tokenData?.validated;
    }
  }

  // Step-specific listeners
  switch (currentStep) {
    case 'token':
      setupTokenStepListeners();
      break;
    case 'repos':
      setupReposStepListeners();
      break;
    case 'categories':
      setupCategoriesStepListeners();
      break;
  }
}

function setupTokenStepListeners() {
  const tokenInput = document.getElementById('tokenInput');
  const copyTokenCodeBtn = document.getElementById('copyTokenCodeBtn');
  const validateBtn = document.getElementById('validateTokenBtn');
  const tokenStatus = document.getElementById('tokenStatus');
  const nextBtn = document.getElementById('nextBtn');
  const tokenElements = { tokenInput, validateBtn, tokenStatus, nextBtn };

  tokenInput?.addEventListener('click', () => {
    tokenInput.select();
  });

  tokenInput?.addEventListener('focus', () => {
    tokenInput.select();
  });

  copyTokenCodeBtn?.addEventListener('click', async () => {
    const userCode = tokenInput?.value?.trim();
    if (!userCode) {
      return;
    }

    try {
      const copied = await copyTextToClipboard(userCode);
      if (copied) {
        tokenStatus.innerHTML = getStatusMarkup('success', `Copied ${userCode}. Paste it into GitHub to finish connecting.`);
      }
    } catch (_error) {
      tokenStatus.innerHTML = getStatusMarkup('error', 'Could not copy the code automatically. Select it manually.');
    }
  });

  // Resume the device flow if the popup was closed while GitHub was waiting
  // for approval in another tab.
  void (async () => {
    const existingTokenData = await onboardingManager.getStepData('token');
    if (!existingTokenData?.validated && existingTokenData?.pendingDeviceAuth) {
      tokenInput.value = existingTokenData.userCode || existingTokenData.pendingDeviceAuth.userCode || '';
      if (copyTokenCodeBtn) {
        copyTokenCodeBtn.disabled = !tokenInput.value;
      }

      try {
        await completePendingDeviceAuth(existingTokenData, tokenElements, {
          showCheckingStatus: true
        });
      } catch (error) {
        tokenStatus.innerHTML = getStatusMarkup('error',
          error?.code === 'client_id_missing'
            ? 'GitHub OAuth client ID is not configured for this build.'
            : error?.code === 'access_denied'
              ? 'GitHub connection was cancelled'
              : error?.code === 'expired_token'
                ? 'GitHub connection expired. Start again.'
                : 'GitHub connection failed'
        );
        validateBtn.disabled = false;
        validateBtn.textContent = 'Connect GitHub';
      }
    }
  })();

  validateBtn?.addEventListener('click', async () => {
    validateBtn.disabled = true;
    tokenStatus.innerHTML = getStatusMarkup('loading', 'Starting GitHub connection...');

    try {
      const deviceCodeData = await requestGitHubDeviceCode();
      const pendingDeviceAuth = createPendingDeviceAuthState(deviceCodeData);

      tokenInput.value = deviceCodeData.userCode || '';
      if (copyTokenCodeBtn) {
        copyTokenCodeBtn.disabled = !tokenInput.value;
      }

      const copied = await copyTextToClipboard(deviceCodeData.userCode).catch(() => false);
      tokenStatus.innerHTML = getStatusMarkup('loading',
        copied
          ? `Code ${deviceCodeData.userCode} copied to clipboard — paste it on the GitHub page that opens.`
          : `Enter ${deviceCodeData.userCode} on GitHub to finish connecting.`
      );

      await onboardingManager.saveStepData('token', {
        userCode: deviceCodeData.userCode,
        validated: false,
        authType: 'oauth_device',
        pendingDeviceAuth
      });

      openGitHubDevicePage(deviceCodeData);
      const result = await completePendingDeviceAuth({
        userCode: deviceCodeData.userCode,
        validated: false,
        authType: 'oauth_device',
        pendingDeviceAuth
      }, tokenElements, {
        showCheckingStatus: false
      });

      if (result) {
        try {
          const popular = await onboardingManager.getPopularRepos();
          if (Array.isArray(popular) && popular.length > 0) {
            await onboardingManager.saveStepData('popularRepos', popular);
          }
        } catch (_prefetchError) {
          // Silently handle prefetch errors - not critical
        }
      }
    } catch (error) {
      tokenStatus.innerHTML = getStatusMarkup('error',
        error?.code === 'client_id_missing'
          ? 'GitHub OAuth client ID is not configured for this build.'
          : error?.code === 'access_denied'
            ? 'GitHub connection was cancelled'
            : error?.code === 'expired_token'
              ? 'GitHub connection expired. Start again.'
            : 'GitHub connection failed'
      );
      validateBtn.disabled = false;
      validateBtn.textContent = 'Connect GitHub';
    }
  });
}

async function loadPopularRepos() {
  const repoLoading = document.getElementById('repoLoading');
  const repoSuggestions = document.getElementById('repoSuggestions');

  try {
    const popularRepos = await onboardingManager.getPopularRepos();

    if (popularRepos && popularRepos.length > 0) {
      // Success: render the repos
      repoSuggestions.innerHTML = popularRepos.map(renderRepoSuggestion).join('');

      // Re-attach event listeners to new buttons
      attachRepoButtonListeners();
    } else {
      // No repos found
      repoLoading.innerHTML = 'No popular repositories available. Please add repositories manually below.';
      repoLoading.className = 'repo-loading repo-error';
    }
  } catch (_error) {
    repoLoading.innerHTML = 'Failed to load popular repositories. Please add repositories manually below.';
    repoLoading.className = 'repo-loading repo-error';
  }
}

function attachRepoButtonListeners() {
  const addButtons = document.querySelectorAll('.add-repo-btn:not([data-listener-attached])');

  addButtons.forEach(btn => {
    btn.dataset.listenerAttached = 'true';
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const repo = btn.dataset.repo;

      // Add loading state
      btn.classList.add('loading');
      btn.textContent = '...';

      try {
        const result = await addWatchedRepoFromInput(repo);

        if (result.valid || result.reason === 'duplicate') {
          btn.classList.remove('loading');
          btn.classList.add('added');
          btn.disabled = true;
          btn.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>';
        } else {
          btn.classList.remove('loading');
          btn.textContent = '✗';
          setTimeout(() => {
            btn.textContent = '+';
          }, 2000);
        }
      } catch (error) {
        console.error('Error adding repository:', error);
        btn.classList.remove('loading');
        btn.textContent = '✗';
        setTimeout(() => {
          btn.textContent = '+';
        }, 2000);
      }
    });
  });
}

function setupReposStepListeners() {
  // Handle loading state for popular repos
  const repoLoading = document.getElementById('repoLoading');

  if (repoLoading && !document.querySelector('.repo-suggestion')) {
    // We're in loading state, try to fetch repos
    loadPopularRepos();
  }

  const manualInput = document.getElementById('manualRepoInput');
  const addManualBtn = document.getElementById('addManualRepoBtn');
  const repoStatus = document.getElementById('repoStatus');

  // Attach listeners to all repo buttons (including ones added dynamically)
  attachRepoButtonListeners();

  // Add manual repo
  const addManualRepo = async () => {
    const repo = manualInput.value.trim();
    if (!repo) return;

    repoStatus.innerHTML = getStatusMarkup('loading', 'Validating repository...');

    try {
      const result = await addWatchedRepoFromInput(repo);

      if (result.valid || result.reason === 'duplicate') {
        manualInput.value = '';
        repoStatus.innerHTML = getStatusMarkup('success', '✓ Repository added');
      } else {
        repoStatus.innerHTML = getStatusMarkup('error', result.error || 'Repository validation failed');
      }
    } catch (error) {
      console.error('Error adding repository:', error);
      repoStatus.innerHTML = getStatusMarkup('error', 'Network error. Please check your connection.');
    }
  };

  // Add click listener to button
  addManualBtn?.addEventListener('click', addManualRepo);

  // Add Enter key listener to input
  manualInput?.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      addManualRepo();
    }
  });
}

function setupCategoriesStepListeners() {
  (async () => {
    const saved = await onboardingManager.getStepData('categories') || {};

    // Populate saved values and set up dependency logic
    CATEGORY_SETTINGS.forEach(({ onboardingTrackId, onboardingNotifyId }) => {
      const trackCheckbox = document.getElementById(onboardingTrackId);
      const notifyCheckbox = document.getElementById(onboardingNotifyId);
      const notifyLabel = notifyCheckbox?.closest('.toggle-label');

      if (trackCheckbox && notifyCheckbox) {
        // Set saved values (default: track=true, notify=false)
        trackCheckbox.checked = saved[onboardingTrackId] !== undefined ? saved[onboardingTrackId] : true;
        notifyCheckbox.checked = saved[onboardingNotifyId] !== undefined ? saved[onboardingNotifyId] : false;

        // Initial state: disable notify if track is unchecked
        if (!trackCheckbox.checked) {
          notifyCheckbox.disabled = true;
          notifyCheckbox.checked = false;
          notifyLabel?.classList.add('disabled');
        }

        // Add event listener to track checkbox
        trackCheckbox.addEventListener('change', () => {
          if (!trackCheckbox.checked) {
            // Disable and uncheck notify when track is disabled
            notifyCheckbox.disabled = true;
            notifyCheckbox.checked = false;
            notifyLabel?.classList.add('disabled');
          } else {
            // Enable notify when track is enabled
            notifyCheckbox.disabled = false;
            notifyLabel?.classList.remove('disabled');
          }
        });
      }
    });
  })();
}

export async function handleNextStep() {
  const currentStep = await onboardingManager.getCurrentStep();

  // Save step data before proceeding
  switch (currentStep) {
    case 'token': {
      const existing = await onboardingManager.getStepData('token') || {};
      if (!existing.validated) {
        const tokenStatus = document.getElementById('tokenStatus');
        if (tokenStatus) {
          tokenStatus.textContent = 'Connect GitHub before continuing.';
          tokenStatus.className = 'token-status error';
        }
        document.getElementById('validateTokenBtn')?.focus();
        return;
      }
      break;
    }
    case 'categories': {
      const stepData = {};
      const filters = {};
      const notifications = {};

      CATEGORY_SETTINGS.forEach(({ key, onboardingTrackId, onboardingNotifyId }) => {
        const trackingEnabled = document.getElementById(onboardingTrackId)?.checked || false;
        const notificationsEnabled = document.getElementById(onboardingNotifyId)?.checked || false;

        stepData[onboardingTrackId] = trackingEnabled;
        stepData[onboardingNotifyId] = notificationsEnabled;
        filters[key] = trackingEnabled;
        notifications[key] = notificationsEnabled;
      });

      await onboardingManager.saveStepData('categories', stepData);
      await chrome.storage.sync.set(createCategorySettings(filters, notifications));
      break;
    }
  }

  await onboardingManager.nextStep();
  await renderOnboardingStep();
}

export function exitOnboarding(loadActivitiesCallback) {
  const onboardingView = document.getElementById('onboardingView');
  const activityList = document.getElementById('activityList');
  const toolbar = document.querySelector('.toolbar');
  const header = document.querySelector('header');

  // Show main content and hide onboarding
  if (onboardingView) {
    onboardingView.classList.add('hidden');
    onboardingView.style.display = 'none';
  }
  if (activityList) activityList.style.display = 'block';
  if (toolbar) toolbar.style.display = 'flex';
  if (header) header.style.display = 'flex';

  // Hide footer skip button when exiting onboarding
  const footerSkipBtn = document.getElementById('footerSkipBtn');
  if (footerSkipBtn) {
    footerSkipBtn.classList.add('hidden');
    footerSkipBtn.style.display = 'none';
  }

  // Load normal activities
  if (loadActivitiesCallback) {
    loadActivitiesCallback();
  }
}
