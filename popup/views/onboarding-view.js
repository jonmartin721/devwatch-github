import { fetchGitHubRepoFromNpm } from '../../shared/api/npm-api.js';
import { OnboardingManager } from '../../shared/onboarding.js';
import { getToken, setToken } from '../../shared/storage-helpers.js';
import { createHeaders } from '../../shared/github-api.js';

// Create onboarding manager instance
const onboardingManager = new OnboardingManager();

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
  const nextButtonText = isTokenStep ? 'Next' : (isFinalStep ? 'Get Started' : 'Next');
  const nextButtonDisabled = isTokenStep ? 'disabled' : '';

  stepContent += `
    <div class="onboarding-nav">
      ${progress.current >= 1 ? '<button id="prevBtn" class="onboarding-btn secondary">Previous</button>' : '<div></div>'}
      <div class="nav-center"></div>
      ${!isFinalStep ? `<button id="nextBtn" class="onboarding-btn primary" ${nextButtonDisabled}>${nextButtonText}</button>` : '<button id="finishBtn" class="onboarding-btn primary">Get Started</button>'}
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
      <h2>Welcome to GitHub DevWatch!</h2>
      <p>Monitor your favorite repositories and never miss important activity.</p>
      <div class="feature-list">
        <div class="feature-item">
          <span class="feature-icon">
            <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
              <path d="M10 2a6 6 0 00-6 6v3.586l-.707.707A1 1 0 004 14h12a1 1 0 00.707-1.707L16 11.586V8a6 6 0 00-6-6zM10 18a3 3 0 01-3-3h6a3 3 0 01-3 3z"/>
            </svg>
          </span>
          <span>Browser notifications for new activity</span>
        </div>
        <div class="feature-item">
          <span class="feature-icon">
            <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
              <path fill-rule="evenodd" d="M3 3a1 1 0 000 2v8a2 2 0 002 2h2.586l-1.293 1.293a1 1 0 101.414 1.414L10 15.414l2.293 2.293a1 1 0 001.414-1.414L12.414 15H15a2 2 0 002-2V5a1 1 0 100-2H3zm11.707 4.293a1 1 0 00-1.414-1.414L10 9.172 8.707 7.879a1 1 0 00-1.414 0l-2 2a1 1 0 101.414 1.414L8 10l1.293 1.293a1 1 0 001.414 0l4-4z" clip-rule="evenodd"/>
            </svg>
          </span>
          <span>Regular activity updates from watched repositories</span>
        </div>
        <div class="feature-item">
          <span class="feature-icon">
            <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
              <path fill-rule="evenodd" d="M11.49 3.17c-.38-1.56-2.6-1.56-2.98 0a1.532 1.532 0 01-2.286.948c-1.372-.836-2.942.734-2.106 2.106.54.886.061 2.042-.947 2.287-1.561.379-1.561 2.6 0 2.978a1.532 1.532 0 01.947 2.287c-.836 1.372.734 2.942 2.106 2.106a1.532 1.532 0 012.287.947c.379 1.561 2.6 1.561 2.978 0a1.533 1.533 0 012.287-.947c1.372.836 2.942-.734 2.106-2.106a1.533 1.533 0 01.947-2.287c1.561-.379 1.561-2.6 0-2.978a1.532 1.532 0 01-.947-2.287c.836-1.372-.734-2.942-2.106-2.106a1.532 1.532 0 01-2.287-.947zM10 13a3 3 0 100-6 3 3 0 000 6z" clip-rule="evenodd"/>
            </svg>
          </span>
          <span>Customizable filters and preferences</span>
        </div>
      </div>
      <p class="step-description">Let's get you set up with GitHub repository monitoring.</p>
    </div>
  `;
}

async function renderTokenStep() {
  const tokenUrl = onboardingManager.getGitHubTokenUrl();
  const tokenData = await onboardingManager.getStepData('token');

  // Check if we already have a validated token
  let statusHtml = '';
  let buttonDisabled = '';
  let buttonText = 'Validate';

  if (tokenData && tokenData.validated && tokenData.username) {
    statusHtml = `<div class="status-success">✓ Token is valid! Logged in as ${tokenData.username}</div>`;
    buttonDisabled = 'disabled';
    buttonText = 'Validated';
  } else if (tokenData && tokenData.validated) {
    statusHtml = '<div class="status-success">✓ Token is valid!</div>';
    buttonDisabled = 'disabled';
    buttonText = 'Validated';
  }

  return `
    <div class="onboarding-step token-step">
      <h2>Add your GitHub Token</h2>
      <p>We need a GitHub token to access repository activity.</p>

      <div class="token-instructions">
        <h3>Quick setup:</h3>
        <ol>
          <li><a href="${tokenUrl}" target="_blank" class="token-link">Create a GitHub token</a></li>
          <li>Copy the generated token</li>
          <li>Paste it below</li>
        </ol>
      </div>

      <div class="token-input-group">
        <input
          type="password"
          id="tokenInput"
          placeholder="ghp_YourTokenHere"
          class="token-input"
          autocomplete="off"
          value="${tokenData.token || ''}"
        >
        <button id="validateTokenBtn" class="validate-btn" ${buttonDisabled}>${buttonText}</button>
      </div>

      <div id="tokenStatus" class="token-status">${statusHtml}</div>
    </div>

    <p class="security-note">
      <svg class="info-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"/>
      </svg>
      Your token is encrypted with AES-GCM encryption and stored securely on your device. It's only used for GitHub API access and never shared.
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
      <h2>Add Repositories to Watch</h2>

      <div class="popular-repos">
        <h3>Popular repositories:</h3>
        <div class="repo-suggestions" id="repoSuggestions">
          ${popularRepos && popularRepos.length > 0 ?
            popularRepos.map(repo => `
              <div class="repo-suggestion" data-owner="${repo.owner.login}" data-name="${repo.name}">
                <div class="repo-info">
                  <div class="repo-name">
                    <span class="repo-owner">${repo.owner.login}</span>/<span class="repo-name-text">${repo.name}</span>
                  </div>
                  <div class="repo-desc">${repo.description || `${repo.language || 'Popular'} project`}</div>
                  <div class="repo-meta">
                    ${repo.language ? `<span class="repo-language">${repo.language}</span>` : ''}
                    ${repo.stargazers_count ? `<span class="repo-stars"><svg class="svg-inline" width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z"/></svg>${repo.stargazers_count.toLocaleString()}</span>` : ''}
                  </div>
                </div>
                <button class="add-repo-btn" data-repo="${repo.owner.login}/${repo.name}">+</button>
              </div>
            `).join('') :
            '<div class="repo-loading" id="repoLoading">Loading popular repositories...</div>'
          }
        </div>
      </div>

      <div class="manual-repo">
        <h3>Or add a specific repository:</h3>
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
      <h2>Choose What to Track</h2>
      <p class="step-subtitle">Select categories and notification preferences</p>

      <div class="categories-list">
        <div class="category-item" data-category="pullRequests">
          <div class="category-icon pr-icon">
            <svg width="20" height="20" viewBox="0 0 16 16" fill="currentColor">
              <path d="M1.5 3.25a2.25 2.25 0 1 1 3 2.122v5.256a2.251 2.251 0 1 1-1.5 0V5.372A2.25 2.25 0 0 1 1.5 3.25Zm5.677-.177L9.573.677A.25.25 0 0 1 10 .854V2.5h1A2.5 2.5 0 0 1 13.5 5v5.628a2.251 2.251 0 1 1-1.5 0V5a1 1 0 0 0-1-1h-1v1.646a.25.25 0 0 1-.427.177L7.177 3.427a.25.25 0 0 1 0-.354ZM3.75 2.5a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5Zm0 9.5a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5Zm8.25.75a.75.75 0 1 0 1.5 0 .75.75 0 0 0-1.5 0Z"/>
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
            <svg width="20" height="20" viewBox="0 0 16 16" fill="currentColor">
              <path d="M8 9.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Z"/>
              <path d="M8 0a8 8 0 1 1 0 16A8 8 0 0 1 8 0ZM1.5 8a6.5 6.5 0 1 0 13 0 6.5 6.5 0 0 0-13 0Z"/>
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
            <svg width="20" height="20" viewBox="0 0 16 16" fill="currentColor">
              <path d="M1 3.5c0-.626.292-1.165.7-1.59.406-.422.956-.767 1.579-1.041C4.525.32 6.195 0 8 0c1.805 0 3.475.32 4.722.869.622.274 1.172.62 1.578 1.04.408.426.7.965.7 1.591v9c0 .626-.292 1.165-.7 1.59-.406.422-.956.767-1.579 1.041C11.476 15.68 9.806 16 8 16c-1.805 0-3.475-.32-4.721-.869-.623-.274-1.173-.62-1.579-1.04-.408-.426-.7-.965-.7-1.591Zm1.5 0c0 .133.058.318.282.551.227.237.591.483 1.101.707C4.898 5.205 6.353 5.5 8 5.5c1.646 0 3.101-.295 4.118-.742.508-.224.873-.471 1.1-.708.224-.232.282-.417.282-.55 0-.133-.058-.318-.282-.551-.227-.237-.591-.483-1.101-.707C11.102 1.795 9.647 1.5 8 1.5c-1.646 0-3.101.295-4.118.742-.508.224-.873.471-1.1.708-.224.232-.282.417-.282.55Zm0 4.5c0 .133.058.318.282.551.227.237.591.483 1.101.707C4.898 9.705 6.353 10 8 10c1.646 0 3.101-.295 4.118-.742.508-.224.873-.471 1.1-.708.224-.232.282-.417.282-.55V5.724c-.241.15-.503.286-.779.407C11.395 6.711 9.77 7 8 7c-1.771 0-3.395-.29-4.721-.869A6.31 6.31 0 0 1 2.5 5.724ZM2.282 12.551C2.058 12.318 2 12.133 2 12v-2.276c.241.15.503.286.779.407C4.105 10.711 5.73 11 7.5 11h1c1.771 0 3.395-.29 4.721-.869.276-.12.538-.257.779-.407V12c0 .133-.058.318-.282.551-.227.237-.591.483-1.101.707C11.602 13.705 10.147 14 8.5 14h-1c-1.646 0-3.101-.295-4.118-.742-.508-.224-.873-.471-1.1-.708Z"/>
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

      <p class="step-note">You can change these in settings anytime.</p>
    </div>
  `;
}

function renderCompleteStep() {
  return `
    <div class="onboarding-step complete-step">
      <div class="step-icon">
        <svg width="64" height="64" viewBox="0 0 64 64" fill="currentColor">
          <circle cx="32" cy="32" r="24" fill="#0366d6"/>
          <path d="M32 8C18.7 8 8 18.7 8 32s10.7 24 24 24 24-10.7 24-24S45.3 8 32 8zm0 4c11 0 20 9 20 20s-9 20-20 20-20-9-20-20 9-20 20-20z"/>
          <path d="M24 32l8 8 16-16" stroke="currentColor" stroke-width="4" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </div>
      <h2>You're All Set!</h2>
      <p>GitHub DevWatch is now configured and ready to help you stay updated.</p>

      <div class="next-steps">
        <h3>What's next?</h3>
        <div class="tips-grid">
          <div class="tip-item">
            <div class="tip-icon">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
              </svg>
            </div>
            <div class="tip-content">
              <strong>Pin important repos</strong>
              <p>You can pin repositories to prioritize them at the top of your feed</p>
            </div>
          </div>

          <div class="tip-item">
            <div class="tip-icon">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M6 18L18 6M6 6l12 12"/>
                <circle cx="9" cy="9" r="2"/>
                <circle cx="15" cy="15" r="2"/>
              </svg>
            </div>
            <div class="tip-content">
              <strong>Mute or snooze repos</strong>
              <p>Mute noisy repositories permanently, or snooze them temporarily</p>
            </div>
          </div>

          <div class="tip-item">
            <div class="tip-icon">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M12 2L2 7l10 5 10-5-10-5z"/>
                <path d="M2 17l10 5 10-5"/>
                <path d="M2 12l10 5 10-5"/>
              </svg>
            </div>
            <div class="tip-content">
              <strong>Import starred/watched repos</strong>
              <p>Quickly import repositories you've starred or are watching on GitHub</p>
            </div>
          </div>

          <div class="tip-item">
            <div class="tip-icon">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="11" cy="11" r="8"/>
                <path d="M21 21l-4.35-4.35"/>
              </svg>
            </div>
            <div class="tip-content">
              <strong>Filter and search</strong>
              <p>Use the search bar to filter through your activity feed quickly</p>
            </div>
          </div>

          <div class="tip-item">
            <div class="tip-icon">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M1 4v16h22V4H1zm8 2H3v2h6V6zm0 4H3v2h6v-2zm0 4H3v2h6v-2zm8 8H9v2h8v-2zm0-4H9v2h8v-2zm0-4H9v2h8v-2zm0-4H9v2h8V6z"/>
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

  // Token validation logic
  if (currentStep === 'token') {
    const tokenInput = document.getElementById('tokenInput');

    // Initial validation state
    const validateTokenInput = () => {
      const token = tokenInput?.value?.trim();
      const isValid = token && token.length > 10 && (token.startsWith('ghp_') || token.startsWith('github_pat_') || token.length >= 20);

      if (nextBtn) {
        nextBtn.disabled = !isValid;
      }

      return isValid;
    };

    // Add input listener for real-time validation
    tokenInput?.addEventListener('input', validateTokenInput);

    // Initial validation
    validateTokenInput();
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
  const validateBtn = document.getElementById('validateTokenBtn');
  const tokenStatus = document.getElementById('tokenStatus');

  validateBtn?.addEventListener('click', async () => {
    const token = tokenInput.value.trim();
    if (!token) {
      tokenStatus.innerHTML = '<div class="status-error">Please enter a token</div>';
      return;
    }

    tokenStatus.innerHTML = '<div class="status-loading">Validating token...</div>';

    try {
      // Test the token by making a simple API call
      const response = await fetch('https://api.github.com/user', {
        headers: {
          'Authorization': `token ${token}`
        }
      });

      if (response.ok) {
        const userData = await response.json();
        const username = userData.login;
        const tokenData = { token, validated: true, username };
        tokenStatus.innerHTML = `<div class="status-success">✓ Token is valid! Logged in as ${username}</div>`;
        await onboardingManager.saveStepData('token', tokenData);
        // Persist the token first so any calls which read it
        // can rely on the token being present. This reduces the chance of
        // unauthenticated fetches or hitting rate limits when prefetching.
        await setToken(token);
        try {
          const popular = await onboardingManager.getPopularRepos();
          if (Array.isArray(popular) && popular.length > 0) {
            await onboardingManager.saveStepData('popularRepos', popular);
          }
        } catch (_prefetchError) {
          // Silently handle prefetch errors - not critical
        }
      } else {
        tokenStatus.innerHTML = '<div class="status-error">✗ Invalid token</div>';
      }
    } catch (_error) {
      tokenStatus.innerHTML = '<div class="status-error">Error validating token</div>';
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
      repoSuggestions.innerHTML = popularRepos.map(repo => `
        <div class="repo-suggestion" data-owner="${repo.owner.login}" data-name="${repo.name}">
          <div class="repo-info">
            <div class="repo-name">
              <span class="repo-owner">${repo.owner.login}</span>/<span class="repo-name-text">${repo.name}</span>
            </div>
            <div class="repo-desc">${repo.description || `${repo.language || 'Popular'} project`}</div>
            <div class="repo-meta">
              ${repo.language ? `<span class="repo-language">${repo.language}</span>` : ''}
              ${repo.stargazers_count ? `<span class="repo-stars"><svg class="svg-inline" width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z"/></svg>${repo.stargazers_count.toLocaleString()}</span>` : ''}
            </div>
          </div>
          <button class="add-repo-btn" data-repo="${repo.owner.login}/${repo.name}">+</button>
        </div>
      `).join('');

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
        // Fetch full repo metadata from GitHub API
        const token = await getToken();
        const headers = createHeaders(token);
        const response = await fetch(`https://api.github.com/repos/${repo}`, { headers });

        if (response.ok) {
          const data = await response.json();

          // Save repo to storage with full metadata
          const result = await chrome.storage.sync.get(['watchedRepos']);
          const repos = result.watchedRepos || [];

          // Check if repo already exists
          const repoExists = repos.some(r => r.fullName === repo);

          if (!repoExists) {
            repos.push({
              fullName: data.full_name,
              name: data.name,
              description: data.description || 'No description provided',
              language: data.language || 'Unknown',
              stars: data.stargazers_count || 0,
              forks: data.forks_count || 0,
              updatedAt: data.updated_at,
              addedAt: new Date().toISOString()
            });
            await chrome.storage.sync.set({ watchedRepos: repos });
          }

          // Show success state
          btn.classList.remove('loading');
          btn.classList.add('added');
          btn.disabled = true;
          btn.innerHTML = '<svg width="18" height="18" viewBox="0 0 16 16" fill="currentColor"><path d="M13.78 4.22a.75.75 0 010 1.06l-7.25 7.25a.75.75 0 01-1.06 0L2.22 9.28a.75.75 0 011.06-1.06L6 10.94l6.72-6.72a.75.75 0 011.06 0z"/></svg>';
        } else {
          // Handle error
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
    let repo = manualInput.value.trim();
    if (!repo) return;

    repoStatus.innerHTML = '<div class="status-loading">Validating repository...</div>';

    try {
      // Get token for API calls
      const githubToken = await getToken();

      // Parse GitHub URL if provided
      const urlMatch = repo.match(/github\.com\/([^/]+\/[^/]+)/);
      if (urlMatch) {
        repo = urlMatch[1].replace(/\.git$/, '');
        manualInput.value = repo; // Update input to show parsed format
      }
      // Check if it might be an NPM package (no slash or scoped package)
      else if (!repo.includes('/') || repo.startsWith('@')) {
        const npmResult = await fetchGitHubRepoFromNpm(repo);
        if (npmResult.success) {
          repo = npmResult.repo;
          manualInput.value = repo; // Update input to show GitHub repo
        } else {
          repoStatus.innerHTML = `<div class="status-error">${npmResult.error}</div>`;
          return;
        }
      }

      // Validate owner/repo format
      if (!repo.includes('/') || repo.split('/').length !== 2 || !repo.split('/')[0] || !repo.split('/')[1]) {
        repoStatus.innerHTML = '<div class="status-error">Invalid format. Use: owner/repo, GitHub URL, or npm package</div>';
        return;
      }

      // Validate repo exists on GitHub
      const headers = {
        'Accept': 'application/vnd.github.v3+json'
      };

      if (githubToken) {
        headers['Authorization'] = `token ${githubToken}`;
      }

      const response = await fetch(`https://api.github.com/repos/${repo}`, { headers });

      if (response.ok) {
        const data = await response.json();

        const result = await chrome.storage.sync.get(['watchedRepos']);
        const repos = result.watchedRepos || [];
        const repoExists = repos.some(r => r.fullName === repo);
        if (!repoExists) {
          repos.push({
            fullName: data.full_name,
            name: data.name,
            description: data.description || 'No description provided',
            language: data.language || 'Unknown',
            stars: data.stargazers_count || 0,
            forks: data.forks_count || 0,
            updatedAt: data.updated_at,
            addedAt: new Date().toISOString()
          });
          await chrome.storage.sync.set({ watchedRepos: repos });
        }
        manualInput.value = '';
        repoStatus.innerHTML = '<div class="status-success">✓ Repository added</div>';
      } else {
        if (response.status === 404) {
          repoStatus.innerHTML = '<div class="status-error">Repository not found on GitHub</div>';
        } else if (response.status === 403) {
          repoStatus.innerHTML = '<div class="status-error">GitHub API rate limit exceeded. Try again later.</div>';
        } else {
          repoStatus.innerHTML = `<div class="status-error">Error validating repository (${response.status})</div>`;
        }
      }
    } catch (error) {
      console.error('Error adding repository:', error);
      repoStatus.innerHTML = '<div class="status-error">Network error. Please check your connection.</div>';
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
    ['pullRequests', 'issues', 'releases'].forEach(k => {
      const trackCheckbox = document.getElementById(k);
      const notifyCheckbox = document.getElementById(`${k}Notifications`);
      const notifyLabel = notifyCheckbox?.closest('.toggle-label');

      if (trackCheckbox && notifyCheckbox) {
        // Set saved values (default: track=true, notify=false)
        trackCheckbox.checked = saved[k] !== undefined ? saved[k] : true;
        notifyCheckbox.checked = saved[`${k}Notifications`] !== undefined ? saved[`${k}Notifications`] : false;

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
      const tokenInput = document.getElementById('tokenInput');
      const token = tokenInput?.value?.trim();

      if (!token) {
        // Show error and prevent navigation
        const tokenStatus = document.getElementById('tokenStatus');
        if (tokenStatus) {
          tokenStatus.textContent = 'Please enter a GitHub token to continue.';
          tokenStatus.className = 'token-status error';
        }
        tokenInput?.focus();
        return; // Prevent navigation
      }

      // Preserve existing validation status when saving token data
      // This ensures that if the token was previously validated, returning to
      // the token step will still show the success message.
      const existing = await onboardingManager.getStepData('token') || {};
      await onboardingManager.saveStepData('token', { ...existing, token });
      // If token was validated, prefetch popular repos so step 2 shows them quickly
      const validated = existing.validated;
      if (validated) {
        try {
          const popular = await onboardingManager.getPopularRepos();
          if (Array.isArray(popular) && popular.length > 0) {
            await onboardingManager.saveStepData('popularRepos', popular);
          }
        } catch (_prefetchError) {
          // Silently fail - user can still manually search for repos
        }
      }
      break;
    }
    case 'categories': {
      const pullRequests = document.getElementById('pullRequests')?.checked || false;
      const issues = document.getElementById('issues')?.checked || false;
      const releases = document.getElementById('releases')?.checked || false;
      const pullRequestsNotifications = document.getElementById('pullRequestsNotifications')?.checked || false;
      const issuesNotifications = document.getElementById('issuesNotifications')?.checked || false;
      const releasesNotifications = document.getElementById('releasesNotifications')?.checked || false;

      await onboardingManager.saveStepData('categories', {
        pullRequests,
        issues,
        releases,
        pullRequestsNotifications,
        issuesNotifications,
        releasesNotifications
      });

      // Save to settings
      await chrome.storage.sync.set({
        showPullRequests: pullRequests,
        showIssues: issues,
        showReleases: releases,
        pullRequestsNotifications,
        issuesNotifications,
        releasesNotifications
      });
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
