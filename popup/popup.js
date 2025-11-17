import { applyTheme, formatDate } from '../shared/utils.js';
import { getSyncItem, getFilteringSettings } from '../shared/storage-helpers.js';
import { getExcludedRepos } from '../shared/storage-helpers.js';
import { CHEVRON_DOWN_ICON, SNOOZE_ICON, CHECK_ICON, getPinIcon, createSvg } from '../shared/icons.js';
import { escapeHtml, sanitizeImageUrl } from '../shared/sanitize.js';
import { safelyOpenUrl } from '../shared/security.js';
import { showError, clearError } from '../shared/error-handler.js';
import {
  isOffline,
  showOfflineStatus,
  setupOfflineListeners,
  getCachedData,
  cacheForOffline,
  showCachedActivities
} from '../shared/offline-manager.js';
import { stateManager, useState, setState, subscribe } from '../shared/state-manager.js';
import { ActivityListRenderer } from '../shared/dom-optimizer.js';
import { OnboardingManager } from '../shared/onboarding.js';

// Legacy global variables for compatibility (will be phased out)
let collapsedRepos = new Set();
let pinnedRepos = [];

// Onboarding manager
const onboardingManager = new OnboardingManager();

/**
 * Fetch GitHub repository from npm package
 * @param {string} packageName - npm package name
 * @returns {Promise<Object>} Result object with success flag and repo or error
 */
async function fetchGitHubRepoFromNpm(packageName) {
  try {
    const response = await fetch(`https://registry.npmjs.org/${packageName}`);

    if (!response.ok) {
      if (response.status === 404) {
        return { success: false, error: `NPM package "${packageName}" not found` };
      }
      return { success: false, error: `Error fetching NPM package (${response.status})` };
    }

    const data = await response.json();

    if (!data.repository) {
      return { success: false, error: `Package "${packageName}" has no repository info` };
    }

    let repoUrl = typeof data.repository === 'string' ? data.repository : data.repository.url;

    // Extract GitHub repo from URL
    const githubMatch = repoUrl.match(/github\.com[/:]([^/]+\/[^/.]+)/);
    if (!githubMatch) {
      return { success: false, error: `Package "${packageName}" is not hosted on GitHub` };
    }

    const repo = githubMatch[1].replace(/\.git$/, '');
    return { success: true, repo };
  } catch (error) {
    return { success: false, error: 'Network error fetching NPM package' };
  }
}

// Optimized DOM renderer
let activityRenderer = null;

if (typeof document !== 'undefined') {
  document.addEventListener('DOMContentLoaded', async () => {
    try {
      // Initialize state manager first
      await stateManager.initialize();

      // Initialize optimized DOM renderer
      const activityList = document.getElementById('activityList');
      if (activityList) {
        activityRenderer = new ActivityListRenderer(activityList);
      }

      // Setup state change subscription
      subscribe((currentState, previousState) => {
        // Re-render activities when relevant state changes
        const relevantKeys = ['allActivities', 'currentFilter', 'searchQuery', 'showArchive', 'readItems'];
        const hasRelevantChanges = relevantKeys.some(key => currentState[key] !== previousState[key]);

        if (hasRelevantChanges) {
          renderActivities();
        }
      });

      // Check if onboarding is needed
      if (await onboardingManager.isInOnboarding()) {
        await showOnboarding();
      } else {
        // Show main UI elements when not in onboarding
        const header = document.querySelector('header');
        const toolbar = document.querySelector('.toolbar');
        const activityList = document.getElementById('activityList');
        if (header) header.style.display = 'flex';
        if (toolbar) toolbar.style.display = 'flex';
        if (activityList) activityList.style.display = 'block';
        
        loadActivities();
      }

      setupEventListeners();
      setupKeyboardNavigation();
      setupOfflineHandlers();
    } catch (error) {
      console.error('Failed to initialize popup:', error);
      showError('errorMessage', 'Failed to load extension data');
    }
  });
}

// Onboarding functions
async function showOnboarding() {
  const onboardingView = document.getElementById('onboardingView');
  const activityList = document.getElementById('activityList');
  const toolbar = document.querySelector('.toolbar');
  const searchBox = document.getElementById('searchBox');

  // Hide main content and show onboarding
  onboardingView.style.display = 'block';
  activityList.style.display = 'none';
  toolbar.style.display = 'none';
  searchBox.style.display = 'none';

  // Hide entire header during onboarding
  const header = document.querySelector('header');
  if (header) {
    header.style.display = 'none';
  }

  // Load current step
  await renderOnboardingStep();
}

async function renderOnboardingStep() {
  const onboardingView = document.getElementById('onboardingView');
  const currentStep = await onboardingManager.getCurrentStep();
  const progress = await onboardingManager.getProgress();
  console.log('Rendering onboarding step:', currentStep, 'Progress:', progress);

  let stepContent = '';

  // Progress bar - only show if not on welcome step
  if (progress.showProgress) {
    stepContent = `
      <div class="onboarding-progress">
        <div class="progress-bar">
          <div class="progress-fill" style="width: ${progress.percentage}%"></div>
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
      console.log('Rendering welcome step');
      stepContent += renderWelcomeStep();
      break;
    case 'token':
      console.log('Rendering token step');
      stepContent += await renderTokenStep();
      break;
    case 'repos':
      console.log('Rendering repos step');
      stepContent += await renderReposStep();
      break;
    case 'categories':
      console.log('Rendering categories step');
      stepContent += await renderCategoriesStep();
      break;
    case 'complete':
      console.log('Rendering complete step');
      stepContent += renderCompleteStep();
      break;
    default:
      console.log('Unknown step:', currentStep);
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

  // Add event listeners for this step
  setupOnboardingStepListeners(currentStep);

  // Show/hide footer skip button based on onboarding step
  const footerSkipBtn = document.getElementById('footerSkipBtn');
  if (footerSkipBtn) {
    // Show skip button for steps 1-3 (token, repos, categories) only
    footerSkipBtn.style.display = (progress.showProgress && currentStep !== 'complete') ? 'block' : 'none';
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
  console.log('Token step - retrieved data:', tokenData);

  // Check if we already have a validated token
  let statusHtml = '';
  let buttonDisabled = '';
  let buttonText = 'Validate';

  if (tokenData && tokenData.validated && tokenData.username) {
    statusHtml = `<div class="status-success">✓ Token is valid! Logged in as ${tokenData.username}</div>`;
    buttonDisabled = 'disabled';
    buttonText = 'Validated';
    console.log('Token step - showing validated with username');
  } else if (tokenData && tokenData.validated) {
    statusHtml = '<div class="status-success">✓ Token is valid!</div>';
    buttonDisabled = 'disabled';
    buttonText = 'Validated';
    console.log('Token step - showing validated without username');
  } else {
    console.log('Token step - not validated, showing validate button');
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
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
      </svg>
      Your token is stored securely and only used for GitHub API access.
    </p>
  `;
}

async function renderReposStep() {
  console.log('🔍 [DEBUG] renderReposStep() called');

  console.log('🔍 [DEBUG] Checking for saved popular repos...');
  const saved = await onboardingManager.getStepData('popularRepos');
  console.log('🔍 [DEBUG] Saved repos data:', {
    hasSaved: !!saved,
    isArray: Array.isArray(saved),
    length: Array.isArray(saved) ? saved.length : 0,
    savedData: saved
  });

  const hasSavedRepos = Array.isArray(saved) && saved.length > 0;
  console.log('🔍 [DEBUG] Has saved repos:', hasSavedRepos);

  let popularRepos;
  if (hasSavedRepos) {
    popularRepos = saved;
    console.log('🔍 [DEBUG] Using saved popular repos:', popularRepos.length);
  } else {
    console.log('🔍 [DEBUG] No saved repos, fetching fresh repos...');
    popularRepos = await onboardingManager.getPopularRepos();
  }

  console.log('🔍 [DEBUG] Final popular repos for rendering:', {
    isNull: popularRepos === null,
    isUndefined: popularRepos === undefined,
    isArray: Array.isArray(popularRepos),
    length: Array.isArray(popularRepos) ? popularRepos.length : 0,
    data: popularRepos
  });

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
                    ${repo.stargazers_count ? `<span class="repo-stars"><svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" style="vertical-align: text-bottom; margin-right: 4px;"><path d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z"/></svg>${repo.stargazers_count.toLocaleString()}</span>` : ''}
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

async function setupOnboardingStepListeners(currentStep) {
  // Navigation buttons
  const prevBtn = document.getElementById('prevBtn');
  const nextBtn = document.getElementById('nextBtn');
  const finishBtn = document.getElementById('finishBtn');

  prevBtn?.addEventListener('click', async () => {
    await onboardingManager.previousStep();
    await renderOnboardingStep();
  });

  nextBtn?.addEventListener('click', async () => {
    await handleNextStep();
  });

  finishBtn?.addEventListener('click', async () => {
    await onboardingManager.completeOnboarding();
    exitOnboarding();
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
        console.log('Token validation - saving data:', tokenData);
        tokenStatus.innerHTML = `<div class="status-success">✓ Token is valid! Logged in as ${username}</div>`;
        await onboardingManager.saveStepData('token', tokenData);
        // Persist the token first so any calls which read chrome.storage.local
        // can rely on the token being present. This reduces the chance of
        // unauthenticated fetches or hitting rate limits when prefetching.
        await chrome.storage.local.set({ githubToken: token });
        console.log('🔍 [DEBUG] Starting prefetch of popular repos after successful token validation...');
        try {
          const popular = await onboardingManager.getPopularRepos();
          console.log('🔍 [DEBUG] Prefetch completed. Popular repos:', {
            isArray: Array.isArray(popular),
            length: Array.isArray(popular) ? popular.length : 0,
            data: popular
          });

          if (Array.isArray(popular) && popular.length > 0) {
            await onboardingManager.saveStepData('popularRepos', popular);
            console.log('🔍 [DEBUG] Popular repos saved to step data');
          } else {
            console.warn('🔍 [DEBUG] No popular repos to save after prefetch');
          }
        } catch (prefetchError) {
          console.error('🔍 [DEBUG] Failed to prefetch popular repos:', prefetchError);
          console.error('🔍 [DEBUG] Prefetch error stack:', prefetchError.stack);
        }
      } else {
        tokenStatus.innerHTML = '<div class="status-error">✗ Invalid token</div>';
      }
    } catch (error) {
      tokenStatus.innerHTML = '<div class="status-error">Error validating token</div>';
    }
  });
}

async function loadPopularRepos() {
  const repoLoading = document.getElementById('repoLoading');
  const repoSuggestions = document.getElementById('repoSuggestions');

  try {
    console.log('🔍 [DEBUG] Loading popular repos dynamically...');
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
              ${repo.stargazers_count ? `<span class="repo-stars"><svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" style="vertical-align: text-bottom; margin-right: 4px;"><path d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z"/></svg>${repo.stargazers_count.toLocaleString()}</span>` : ''}
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
  } catch (error) {
    console.error('🔍 [DEBUG] Failed to load popular repos:', error);
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
      btn.disabled = true;
      btn.textContent = 'Added ✓';

      // Save repo to storage
      const result = await chrome.storage.sync.get(['repos']);
      const repos = result.repos || [];
      if (!repos.includes(repo)) {
        repos.push(repo);
        await chrome.storage.sync.set({ repos });
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
      const tokenResult = await chrome.storage.local.get(['githubToken']);
      const githubToken = tokenResult.githubToken;

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
        const result = await chrome.storage.sync.get(['repos']);
        const repos = result.repos || [];
        if (!repos.includes(repo)) {
          repos.push(repo);
          await chrome.storage.sync.set({ repos });
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

async function handleNextStep() {
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
        } catch (prefetchError) {
          console.warn('Failed to prefetch popular repos in handleNextStep', prefetchError);
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

function exitOnboarding() {
  const onboardingView = document.getElementById('onboardingView');
  const activityList = document.getElementById('activityList');
  const toolbar = document.querySelector('.toolbar');
  const header = document.querySelector('header');

  // Show main content and hide onboarding
  if (onboardingView) onboardingView.style.display = 'none';
  if (activityList) activityList.style.display = 'block';
  if (toolbar) toolbar.style.display = 'flex';
  if (header) header.style.display = 'flex';

  // Hide footer skip button when exiting onboarding
  const footerSkipBtn = document.getElementById('footerSkipBtn');
  if (footerSkipBtn) {
    footerSkipBtn.style.display = 'none';
  }

  // Load normal activities
  loadActivities();
}

function setupEventListeners() {
  console.log('🌙 Setting up event listeners...');

  const darkModeBtn = document.getElementById('darkModeBtn');
  console.log('🌙 Dark mode button found during setup:', !!darkModeBtn);

  document.getElementById('refreshBtn').addEventListener('click', handleRefresh);

  if (darkModeBtn) {
    darkModeBtn.addEventListener('click', (e) => {
      console.log('🌙 Dark mode button clicked!', e);
      toggleDarkMode();
    });
    console.log('🌙 Dark mode click listener attached');
  } else {
    console.log('🌙 ERROR: Dark mode button not found during setup!');
  }

  document.getElementById('settingsLink').addEventListener('click', () => {
    chrome.runtime.openOptionsPage();
  });
  document.getElementById('helpBtn').addEventListener('click', () => {
    chrome.tabs.create({ url: 'https://github.com/jonmartin721/devwatch-github#readme' });
  });

  // Footer skip setup button
  const footerSkipBtn = document.getElementById('footerSkipBtn');
  if (footerSkipBtn) {
    footerSkipBtn.addEventListener('click', async () => {
      await onboardingManager.completeOnboarding();
      exitOnboarding();
    });
  }

  // Toolbar buttons
  document.getElementById('searchBtn').addEventListener('click', toggleSearch);
  document.getElementById('archiveBtn').addEventListener('click', toggleArchive);

  // Search input
  document.getElementById('searchInput').addEventListener('input', (e) => {
    setState({ searchQuery: e.target.value.toLowerCase() });
  });

  document.querySelectorAll('.filter-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
      e.target.classList.add('active');
      setState({ currentFilter: e.target.dataset.type });
    });
  });

  // Load theme preference - detect system theme on first load
  getSyncItem('theme', null).then(savedTheme => {
    let theme = savedTheme;

    // If no saved theme, detect system preference
    if (theme === null) {
      theme = window.matchMedia('(prefers-color-scheme: dark)') ? 'dark' : 'light';
      // Save the detected system theme as the user's preference
      chrome.storage.sync.set({ theme });
    }

    console.log('🌙 Initial theme from storage:', savedTheme, 'Using theme:', theme);
    applyTheme(theme);
    // Add a small delay to ensure DOM is ready before updating icons
    setTimeout(() => {
      console.log('🌙 About to call updateDarkModeIcon() during init...');
      updateDarkModeIcon();
    }, 50);
  });

  }

async function toggleDarkMode() {
  console.log('🌙 toggleDarkMode() called');

  // Toggle between light and dark
  const currentTheme = await getSyncItem('theme', 'light');
  const newTheme = currentTheme === 'dark' ? 'light' : 'dark';

  console.log('🌙 Theme toggle:', currentTheme, '->', newTheme);

  chrome.storage.sync.set({ theme: newTheme });
  applyTheme(newTheme);
  updateDarkModeIcon();
}

async function updateDarkModeIcon() {
  console.log('🌙 updateDarkModeIcon() called');

  const btn = document.getElementById('darkModeBtn');
  console.log('🌙 Button found:', !!btn);
  if (!btn) return; // Early return if button doesn't exist (test environment)

  const systemIcon = btn.querySelector('.system-icon');
  const moonIcon = btn.querySelector('.moon-icon');
  const sunIcon = btn.querySelector('.sun-icon');
  console.log('🌙 Icons found - System:', !!systemIcon, 'Moon:', !!moonIcon, 'Sun:', !!sunIcon);

  const currentTheme = await getSyncItem('theme', 'light');
  console.log('🌙 Current theme from storage:', currentTheme);

  // Hide system icon (not currently used)
  if (systemIcon) {
    systemIcon.style.display = 'none';
    systemIcon.style.visibility = 'hidden';
  }

  // Show moon icon in light mode (to toggle to dark), sun icon in dark mode (to toggle to light)
  if (moonIcon) {
    const moonDisplay = currentTheme === 'dark' ? 'none' : 'block';
    const moonVisibility = currentTheme === 'dark' ? 'hidden' : 'visible';
    moonIcon.style.display = moonDisplay;
    moonIcon.style.visibility = moonVisibility;
    console.log('🌙 Moon icon set to display:', moonDisplay, 'visibility:', moonVisibility);
  } else {
    console.log('🌙 Moon icon not found!');
  }

  if (sunIcon) {
    const sunDisplay = currentTheme === 'dark' ? 'block' : 'none';
    const sunVisibility = currentTheme === 'dark' ? 'visible' : 'hidden';
    sunIcon.style.display = sunDisplay;
    sunIcon.style.visibility = sunVisibility;
    console.log('🌙 Sun icon set to display:', sunDisplay, 'visibility:', sunVisibility);
  } else {
    console.log('🌙 Sun icon not found!');
  }
}

async function handleRefresh() {
  const btn = document.getElementById('refreshBtn');
  btn.disabled = true;
  btn.classList.add('spinning');

  try {
    clearError('errorMessage');
    await chrome.runtime.sendMessage({ action: 'checkNow' });
    await loadActivities();
  } catch (error) {
    showError('errorMessage', error, null, { action: 'refresh activities' }, 5000);
  } finally {
    btn.disabled = false;
    btn.classList.remove('spinning');

    // Add completion animation
    btn.classList.add('refresh-complete');
    setTimeout(() => {
      btn.classList.remove('refresh-complete');
    }, 400);
  }
}

async function loadActivities() {
  const list = document.getElementById('activityList');

  // Check offline status first
  if (isOffline()) {
    list.innerHTML = '<div class="loading" role="status" aria-live="polite">Loading cached data...</div>';
    showOfflineStatus('errorMessage', true);

    try {
      const cachedActivities = await getCachedData('activities_cache');
      const cachedReadItems = await getCachedData('readItems_cache');
      const { mutedRepos, snoozedRepos } = await getFilteringSettings();

      if (cachedActivities) {
        // Filter out muted and snoozed repos using shared utilities
        const excludedRepos = getExcludedRepos(mutedRepos, snoozedRepos);
        const filteredActivities = cachedActivities.filter(a => !excludedRepos.has(a.repo));

        // Update state with cached data
        await setState({
          allActivities: filteredActivities,
          readItems: cachedReadItems || []
        }, { persist: false }); // Don't persist cached data to storage

        // Show cached indicator
        showCachedActivities(filteredActivities);
        renderActivities();
        return;
      } else {
        list.innerHTML = `
          <div class="empty-state">
            <div class="offline-empty">
              <div class="offline-icon">📡</div>
              <p>No cached data available</p>
              <small>Check your connection and try again</small>
            </div>
          </div>
        `;
        return;
      }
    } catch (error) {
      list.innerHTML = '<div class="empty-state"><p>Unable to load cached data</p></div>';
      showError('errorMessage', error, null, { action: 'load cached activities' }, 0);
      return;
    }
  }

  // Online mode - proceed normally
  list.innerHTML = '<div class="loading" role="status" aria-live="polite">Loading...</div>';
  showOfflineStatus('errorMessage', false);
  clearError('errorMessage');

  try {
    const data = await chrome.storage.local.get(['activities', 'readItems', 'rateLimit', 'lastError', 'collapsedRepos']);
    const settings = await getFilteringSettings();
    pinnedRepos = await getSyncItem('pinnedRepos', []);

    // Load collapsed state
    collapsedRepos = new Set(data.collapsedRepos || []);

    // Filter out muted and snoozed repos using shared utilities
    const excludedRepos = getExcludedRepos(settings.mutedRepos, settings.snoozedRepos);
    const filteredActivities = (data.activities || []).filter(a => !excludedRepos.has(a.repo));

    // Update state manager with loaded data
    await setState({
      allActivities: filteredActivities,
      readItems: data.readItems || []
    });

    // Cache the loaded data for offline use
    await cacheForOffline('activities_cache', filteredActivities, 3600000); // 1 hour
    await cacheForOffline('readItems_cache', data.readItems || [], 3600000);

    renderActivities();
    updateRateLimit(data.rateLimit);
    updateLastUpdated();
    if (data.lastError) {
      showStoredError(data.lastError);
    }
  } catch (error) {
    list.innerHTML = '<div class="empty-state"><p>Unable to load activities</p></div>';
    showError('errorMessage', error, null, { action: 'load activities' }, 0);
  }
}

function updateLastUpdated() {
  const now = new Date();
  const timeString = now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  document.getElementById('lastUpdated').textContent = `Updated ${timeString}`;
}

function updateRateLimit(rateLimit) {
  const rateLimitInfo = document.getElementById('rateLimitInfo');

  // Only show rate limit when remaining <= 1000
  if (!rateLimit || rateLimit.remaining > 1000) {
    rateLimitInfo.textContent = '';
    rateLimitInfo.style.display = 'none';
    return;
  }

  // Show in yellow warning when low
  rateLimitInfo.innerHTML = `
    <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" style="vertical-align: text-bottom; margin-right: 4px;">
      <path d="M6.457 1.047c.659-1.234 2.427-1.234 3.086 0l6.082 11.378A1.75 1.75 0 0114.082 15H1.918a1.75 1.75 0 01-1.543-2.575zm1.763.707a.25.25 0 00-.44 0L1.698 13.132a.25.25 0 00.22.368h12.164a.25.25 0 00.22-.368zm.53 3.996v2.5a.75.75 0 11-1.5 0v-2.5a.75.75 0 111.5 0zM9 11a1 1 0 11-2 0 1 1 0 012 0z"/>
    </svg>
    ${rateLimit.remaining}/${rateLimit.limit} API calls remaining
  `;
  rateLimitInfo.style.color = '#f0ad4e'; // Yellow/orange warning color
  rateLimitInfo.style.display = 'block';

  // Show when rate limit resets
  if (rateLimit.reset) {
    const resetDate = new Date(rateLimit.reset);
    const now = new Date();
    const minutesUntilReset = Math.ceil((resetDate - now) / 60000);

    if (minutesUntilReset > 0) {
      rateLimitInfo.textContent += ` (resets in ${minutesUntilReset}m)`;
    }
  }
}

function showStoredError(lastError) {
  if (!lastError || Date.now() - lastError.timestamp > 60000) {
    clearError('errorMessage');
    return;
  }

  // Use the enhanced error notification system with sanitized error message
  const error = new Error(lastError.message);
  const context = lastError.repo ? { repo: lastError.repo } : {};
  showError('errorMessage', error, null, context, 10000);
}

// Renders the filtered activity list using ActivityListRenderer for efficient DOM updates
function renderActivities() {
  const list = document.getElementById('activityList');
  const state = useState();
  const filtered = stateManager.getFilteredActivities();

  if (filtered.length === 0) {
    let emptyMessage = 'No recent activity';
    if (!state.showArchive) emptyMessage = 'No new activity';
    if (state.searchQuery) emptyMessage = 'No matching activity';

    // Always make "options" a link to add repos section
    const optionsText = `<a href="#" id="optionsLink" class="options-link">options</a>`;
    const fullMessage = `Go to ${optionsText} to watch more repositories.`;

    list.innerHTML = `
      <div class="empty-state">
        <p>${emptyMessage}</p>
        <small>${fullMessage}</small>
      </div>
    `;

    // Add click listener for options link
    const optionsLink = document.getElementById('optionsLink');
    if (optionsLink) {
      optionsLink.addEventListener('click', async (e) => {
        e.preventDefault();

        // Open options page with hash and query parameter
        const optionsUrl = chrome.runtime.getURL('options/options.html#repositories?showAdd=true');
        await chrome.tabs.create({ url: optionsUrl });
      });
    }
    return;
  }

  // Use optimized renderer if available, fallback to legacy rendering
  if (activityRenderer) {
    const unreadCount = filtered.filter(a => !state.readItems.includes(a.id)).length;
    const repoCount = new Set(filtered.map(a => a.repo)).size;

    // Render with optimized renderer
    activityRenderer.render(filtered, {
      groupByRepo: true,
      maxItems: 50
    });

    // Add header with action buttons
    const header = `
      <div class="list-header">
        <span>${unreadCount > 0 ? `${unreadCount} unread` : ''}</span>
        <div class="header-actions">
          ${repoCount > 1 ? `<button id="collapseAllBtn" class="text-btn">Collapse all</button>` : ''}
          ${unreadCount > 0 ? `<button id="markAllReadBtn" class="text-btn">Mark all as read</button>` : ''}
        </div>
      </div>
    `;

    // Prepend header to the container
    const existingHeader = list.querySelector('.list-header');
    if (!existingHeader) {
      list.insertAdjacentHTML('afterbegin', header);
    }

    // Event listeners are already attached in the DOM generation
    return;
  }

  // Fallback to legacy rendering if renderer not available
  legacyRenderActivities(filtered, state);
}

/**
 * Legacy rendering function as fallback
 */
function legacyRenderActivities(filtered, state) {
  const list = document.getElementById('activityList');

  const unreadCount = filtered.filter(a => !state.readItems.includes(a.id)).length;
  const repoCount = new Set(filtered.map(a => a.repo)).size;
  const allCollapsed = repoCount > 0 && collapsedRepos.size === repoCount;

  const header = `
    <div class="list-header">
      <span>${unreadCount > 0 ? `${unreadCount} unread` : ''}</span>
      <div class="header-actions">
        ${repoCount > 1 ? `<button id="collapseAllBtn" class="text-btn">${allCollapsed ? 'Expand all' : 'Collapse all'}</button>` : ''}
        ${unreadCount > 0 ? `<button id="markAllReadBtn" class="text-btn">Mark all as read</button>` : ''}
      </div>
    </div>
  `;

  // Group activities by repository
  const grouped = groupByRepo(filtered);

  let htmlContent = header;

  // Render each repo group
  Object.keys(grouped).forEach(repo => {
    const activities = grouped[repo];
    const repoUnreadCount = activities.filter(a => !state.readItems.includes(a.id)).length;
    const isCollapsed = collapsedRepos.has(repo);
    const isPinned = pinnedRepos.includes(repo);

    htmlContent += `
      <div class="repo-group-header ${isPinned ? 'pinned' : ''}" data-repo="${repo}">
        <div class="repo-group-title">
          <button class="repo-collapse-btn" data-repo="${repo}" title="${isCollapsed ? 'Expand' : 'Collapse'}" aria-label="${isCollapsed ? 'Expand' : 'Collapse'} ${repo} activities">
            ${createSvg(CHEVRON_DOWN_ICON, 12, 12, `chevron ${isCollapsed ? 'collapsed' : ''}`)}
          </button>
          <span class="repo-group-name">${repo}</span>
        </div>
        <div class="repo-group-actions">
          <button class="repo-pin-btn ${isPinned ? 'pinned' : ''}" data-repo="${repo}" title="${isPinned ? 'Unpin repository' : 'Pin repository'}" aria-label="${isPinned ? 'Unpin' : 'Pin'} ${repo} repository">
            ${getPinIcon(isPinned)}
          </button>
          ${repoUnreadCount > 0 ? `<span class="repo-unread-count">${repoUnreadCount}</span>` : ''}
          <button class="repo-snooze-btn" data-repo="${repo}" title="Snooze this repository" aria-label="Snooze ${repo} repository">
            ${createSvg(SNOOZE_ICON, 14, 14)}
          </button>
        </div>
      </div>
      <div class="repo-activities ${isCollapsed ? 'collapsed' : ''}" data-repo="${repo}">
    `;

    htmlContent += activities.map(activity => renderActivityItem(activity)).join('');
    htmlContent += '</div>';
  });

  list.innerHTML = htmlContent;

  // Event listeners
  document.getElementById('markAllReadBtn')?.addEventListener('click', handleMarkAllRead);
  document.getElementById('collapseAllBtn')?.addEventListener('click', handleCollapseAll);

  // Header click listeners for expand/collapse
  list.querySelectorAll('.repo-group-header').forEach(header => {
    header.addEventListener('click', (e) => {
      // Don't trigger if clicking on buttons
      if (e.target.closest('.repo-snooze-btn')) {
        return;
      }

      const repo = header.dataset.repo;
      toggleRepoCollapse(repo);
    });
  });

  // Collapse button listeners
  list.querySelectorAll('.repo-collapse-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const repo = btn.dataset.repo;
      toggleRepoCollapse(repo);
    });
  });

  // Pin button listeners
  list.querySelectorAll('.repo-pin-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const repo = btn.dataset.repo;
      togglePinRepo(repo);
    });
  });

  // Snooze button listeners
  list.querySelectorAll('.repo-snooze-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const repo = btn.dataset.repo;
      snoozeRepo(repo);
    });
  });

  list.querySelectorAll('.activity-item').forEach(item => {
    const content = item.querySelector('.activity-content');
    content.addEventListener('click', async () => {
      const id = item.dataset.id;
      const url = item.dataset.url;
      markAsRead(id);

      // Validate URL before opening to prevent javascript: and data: URLs
      const opened = await safelyOpenUrl(url);
      if (!opened) {
        showError('errorMessage', new Error('Invalid URL detected'), null, { action: 'open link' }, 3000);
      }
    });

    item.querySelectorAll('.action-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const action = btn.dataset.action;
        const id = item.dataset.id;

        if (action === 'mark-read') {
          markAsReadWithAnimation(id, item);
        }
      });
    });
  });
}

function markAsReadWithAnimation(id, itemElement) {
  // Add removing animation class
  itemElement.classList.add('removing');

  // Wait for animation to complete, then mark as read
  setTimeout(() => {
    markAsRead(id);
    renderActivities();
  }, 300); // Match CSS transition duration
}

function toggleSearch() {
  const searchBox = document.getElementById('searchBox');
  const searchBtn = document.getElementById('searchBtn');
  const searchInput = document.getElementById('searchInput');

  if (searchBox.style.display === 'none' || !searchBox.style.display) {
    searchBox.style.display = 'block';
    searchBtn.classList.add('active');
    searchInput.focus();
  } else {
    searchBox.style.display = 'none';
    searchBtn.classList.remove('active');
    setState({ searchQuery: '' });
    searchInput.value = '';
    renderActivities();
  }
}

function toggleArchive() {
  const archiveBtn = document.getElementById('archiveBtn');
  const currentState = useState().showArchive;
  setState({ showArchive: !currentState });
  archiveBtn.classList.toggle('active', !currentState);
  renderActivities();
}

function renderActivityItem(activity) {
  const state = useState();
  const isRead = state.readItems.includes(activity.id);

  // Sanitize all user-generated content to prevent XSS
  const sanitizedTitle = escapeHtml(activity.title);
  const sanitizedAuthor = escapeHtml(activity.author);
  const sanitizedRepo = escapeHtml(activity.repo);
  const sanitizedType = escapeHtml(activity.type);
  const sanitizedAvatar = sanitizeImageUrl(activity.authorAvatar);

  return `
    <div class="activity-item ${isRead ? 'read' : 'unread'}" data-id="${escapeHtml(activity.id)}" data-url="${escapeHtml(activity.url)}">
      <img src="${sanitizedAvatar}" class="activity-avatar" alt="${sanitizedAuthor}">
      <div class="activity-content">
        <div class="activity-header">
          <span class="activity-type ${sanitizedType}">${sanitizedType}</span>
          <span class="activity-repo">${sanitizedRepo}</span>
        </div>
        <div class="activity-title">${sanitizedTitle}</div>
        <div class="activity-meta">
          by ${sanitizedAuthor} • ${formatDate(activity.createdAt)}
        </div>
      </div>
      <div class="activity-actions">
        <button class="action-btn mark-read-btn" data-action="mark-read" title="Mark as done" aria-label="Mark ${sanitizedTitle} as done">
          ${createSvg(CHECK_ICON, 16, 16)}
        </button>
      </div>
    </div>
  `;
}

function groupByTime(activities) {
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterdayStart = new Date(todayStart - 24 * 60 * 60 * 1000);
  const weekStart = new Date(todayStart - 7 * 24 * 60 * 60 * 1000);

  const groups = {
    today: [],
    yesterday: [],
    thisWeek: [],
    older: []
  };

  activities.forEach(activity => {
    const date = new Date(activity.createdAt);
    if (date >= todayStart) {
      groups.today.push(activity);
    } else if (date >= yesterdayStart) {
      groups.yesterday.push(activity);
    } else if (date >= weekStart) {
      groups.thisWeek.push(activity);
    } else {
      groups.older.push(activity);
    }
  });

  return groups;
}

function groupByRepo(activities) {
  const groups = {};

  activities.forEach(activity => {
    if (!groups[activity.repo]) {
      groups[activity.repo] = [];
    }
    groups[activity.repo].push(activity);
  });

  // Sort repos: pinned first, then by most recent activity
  const sortedGroups = {};
  Object.keys(groups)
    .sort((a, b) => {
      const aIsPinned = pinnedRepos.includes(a);
      const bIsPinned = pinnedRepos.includes(b);

      // Pinned repos come first
      if (aIsPinned && !bIsPinned) return -1;
      if (!aIsPinned && bIsPinned) return 1;

      // If both pinned or both not pinned, sort by most recent activity
      const latestA = new Date(groups[a][0].createdAt);
      const latestB = new Date(groups[b][0].createdAt);
      return latestB - latestA;
    })
    .forEach(repo => {
      // Sort activities within each repo by newest first
      groups[repo].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
      sortedGroups[repo] = groups[repo];
    });

  return sortedGroups;
}

async function toggleRepoCollapse(repo) {
  if (collapsedRepos.has(repo)) {
    collapsedRepos.delete(repo);
  } else {
    collapsedRepos.add(repo);
  }

  // Save collapsed state
  await chrome.storage.local.set({ collapsedRepos: Array.from(collapsedRepos) });

  // Re-render
  renderActivities();
}

async function togglePinRepo(repo) {
  try {
    const isCurrentlyPinned = pinnedRepos.includes(repo);

    if (isCurrentlyPinned) {
      // Unpin the repo
      pinnedRepos = pinnedRepos.filter(r => r !== repo);
    } else {
      // Pin the repo
      pinnedRepos.push(repo);
    }

    // Save to storage
    await chrome.storage.sync.set({ pinnedRepos });

    // Re-render activities to show updated pin state
    renderActivities();
  } catch (error) {
    showError('errorMessage', error, null, { action: 'toggle pin repository', repo }, 3000);
  }
}

async function snoozeRepo(repo) {
  try {
    // Get snooze duration from settings
    const settings = await chrome.storage.sync.get(['snoozeHours', 'snoozedRepos']);
    const snoozeHours = settings.snoozeHours || 1;
    const snoozedRepos = settings.snoozedRepos || [];

    // Calculate expiration time
    const expiresAt = Date.now() + (snoozeHours * 60 * 60 * 1000);

    // Check if repo is already snoozed and update, otherwise add new
    const existingIndex = snoozedRepos.findIndex(s => s.repo === repo);
    if (existingIndex >= 0) {
      snoozedRepos[existingIndex].expiresAt = expiresAt;
    } else {
      snoozedRepos.push({ repo, expiresAt });
    }

    // Save to storage
    await chrome.storage.sync.set({ snoozedRepos });

    // Reload activities to reflect the snooze
    await loadActivities();
  } catch (error) {
    showError('errorMessage', error, null, { action: 'snooze repository', repo }, 3000);
  }
}

async function toggleReadState(id) {
  const state = useState();
  const isRead = state.readItems.includes(id);
  const action = isRead ? 'markAsUnread' : 'markAsRead';

  try {
    await chrome.runtime.sendMessage({ action, id });
    if (isRead) {
      const newReadItems = state.readItems.filter(item => item !== id);
      setState({ readItems: newReadItems });
    } else {
      const newReadItems = [...state.readItems, id];
      setState({ readItems: newReadItems });
    }
    renderActivities();
  } catch (error) {
    showError('errorMessage', error, null, { action: 'toggle read state' }, 3000);
  }
}

async function markAsRead(id) {
  const state = useState();
  if (state.readItems.includes(id)) return;

  try {
    await chrome.runtime.sendMessage({ action: 'markAsRead', id });
    const newReadItems = [...state.readItems, id];
    setState({ readItems: newReadItems });
  } catch (error) {
    showError('errorMessage', error, null, { action: 'mark as read' }, 3000);
  }
}

async function handleMarkAllRead() {
  try {
    await chrome.runtime.sendMessage({ action: 'markAllAsRead' });
    const state = useState();
    const newReadItems = state.allActivities.map(a => a.id);
    setState({ readItems: newReadItems });
    renderActivities();
  } catch (error) {
    showError('errorMessage', error, null, { action: 'mark all as read' }, 3000);
  }
}

async function handleCollapseAll() {
  const state = useState();
  const grouped = groupByRepo(state.allActivities);
  const allRepos = Object.keys(grouped);
  const allCollapsed = collapsedRepos.size === allRepos.length;

  if (allCollapsed) {
    // Expand all
    collapsedRepos.clear();
  } else {
    // Collapse all
    allRepos.forEach(repo => collapsedRepos.add(repo));
  }

  // Save and re-render
  await chrome.storage.local.set({ collapsedRepos: Array.from(collapsedRepos) });
  renderActivities();
}

function setupKeyboardNavigation() {
  const searchBox = document.getElementById('searchBox');

  // Handle keyboard shortcuts
  document.addEventListener('keydown', (e) => {
    // Only handle shortcuts when not in input fields
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
      return;
    }

    switch (e.key) {
      case 'r':
      case 'R':
        if (!e.ctrlKey && !e.metaKey) {
          e.preventDefault();
          handleRefresh();
        }
        break;
      case 's':
      case 'S':
        if (!e.ctrlKey && !e.metaKey) {
          e.preventDefault();
          toggleSearch();
        }
        break;
      case 'a':
      case 'A':
        if (!e.ctrlKey && !e.metaKey) {
          e.preventDefault();
          toggleArchive();
        }
        break;
      case 'Escape':
        if (searchBox && searchBox.style.display !== 'none') {
          toggleSearch();
        }
        break;
    }
  });

  // Enhanced tab navigation for filter buttons
  const filterButtons = document.querySelectorAll('.filter-btn');
  filterButtons.forEach((btn, index) => {
    btn.addEventListener('keydown', (e) => {
      switch (e.key) {
        case 'ArrowRight':
        case 'ArrowDown': {
          e.preventDefault();
          const nextIndex = (index + 1) % filterButtons.length;
          filterButtons[nextIndex].focus();
          filterButtons[nextIndex].click();
          break;
        }
        case 'ArrowLeft':
        case 'ArrowUp': {
          e.preventDefault();
          const prevIndex = (index - 1 + filterButtons.length) % filterButtons.length;
          filterButtons[prevIndex].focus();
          filterButtons[prevIndex].click();
          break;
        }
        case 'Enter':
        case ' ':
          e.preventDefault();
          btn.click();
          break;
      }
    });
  });

  // Update ARIA attributes when filters change
  const originalRenderActivities = renderActivities;
  const wrappedRenderActivities = function() {
    originalRenderActivities();

    // Update ARIA selected states
    filterButtons.forEach(btn => {
      const isActive = btn.classList.contains('active');
      btn.setAttribute('aria-selected', isActive.toString());
      btn.setAttribute('tabindex', isActive ? '0' : '-1');
    });
  };

  // Replace the original function with the wrapped version
  window.renderActivities = wrappedRenderActivities;
  Object.defineProperty(window, 'renderActivities', {
    value: wrappedRenderActivities,
    writable: true,
    configurable: true
  });
}

function setupOfflineHandlers() {
  // Handle offline/online events
  setupOfflineListeners(
    // When coming back online
    () => {
      showOfflineStatus('errorMessage', false);
      setTimeout(() => {
        loadActivities();
      }, 1000);
    },
    // When going offline
    () => {
      showOfflineStatus('errorMessage', true);
    }
  );

  // Store original handleRefresh for offline-aware handling
  const originalHandleRefresh = window.handleRefresh || handleRefresh;

  // Override handleRefresh with offline check
  window.handleRefresh = async function() {
    if (isOffline()) {
      showError('errorMessage', new Error('Cannot refresh while offline'), null, { action: 'refresh activities' }, 3000);
      return;
    }
    return originalHandleRefresh.call(this);
  };
}

// Export functions for testing
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    loadActivities,
    renderActivities,
    groupByTime,
    groupByRepo,
    renderReposStep,
    toggleRepoCollapse,
    togglePinRepo,
    snoozeRepo,
    toggleDarkMode,
    updateDarkModeIcon,
    updateRateLimit,
    showError,
    toggleReadState,
    markAsRead,
    markAsReadWithAnimation,
    handleMarkAllRead,
    handleCollapseAll,
    toggleSearch,
    toggleArchive
  };
}

// ES6 exports for tests
export {
  loadActivities,
  renderActivities,
  groupByTime,
  groupByRepo,
  toggleRepoCollapse,
  togglePinRepo,
  snoozeRepo,
  toggleDarkMode,
  updateDarkModeIcon,
  updateRateLimit,
  showError,
  toggleReadState,
  markAsRead,
  markAsReadWithAnimation,
  handleMarkAllRead,
  handleCollapseAll,
  renderReposStep,
  handleNextStep,
  toggleSearch,
  toggleArchive
};
