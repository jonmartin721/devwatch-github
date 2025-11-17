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
        <button id="validateTokenBtn" class="validate-btn">Validate</button>
      </div>

      <div id="tokenStatus" class="token-status"></div>
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
  const popularRepos = await onboardingManager.getPopularRepos();

  return `
    <div class="onboarding-step repos-step">
      <h2>Add Repositories to Watch</h2>
      <p>Choose repositories to monitor for new activity.</p>

      <div class="popular-repos">
        <h3>Popular repositories:</h3>
        <div class="repo-suggestions">
          ${popularRepos.map(repo => `
            <div class="repo-suggestion" data-owner="${repo.owner}" data-name="${repo.name}">
              <div class="repo-info">
                <div class="repo-name">${repo.owner.login}/${repo.name}</div>
                <div class="repo-desc">${repo.description || repo.language ? `${repo.language} project` : 'Popular repository'}</div>
              </div>
              <button class="add-repo-btn" data-repo="${repo.owner.login}/${repo.name}">Add</button>
            </div>
          `).join('')}
        </div>
      </div>

      <div class="manual-repo">
        <h3>Or add a specific repository:</h3>
        <div class="manual-input-group">
          <input
            type="text"
            id="manualRepoInput"
            placeholder="owner/repository-name"
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
      <h2>Choose Your Interests</h2>
      <p>Select what types of activity you want to see in your feed and which should trigger notifications.</p>

      <div class="category-options">
        <div class="category-item">
          <div class="category-header">
            <div class="category-info">
              <div class="category-name">Pull Requests</div>
              <div class="category-desc">New and updated PRs</div>
            </div>
          </div>
          <div class="category-toggles">
            <label class="toggle-label">
              <input type="checkbox" id="pullRequests" checked>
              <span class="toggle-text">Show in feed</span>
            </label>
            <label class="toggle-label">
              <input type="checkbox" id="pullRequestsNotifications" checked>
              <span class="toggle-text">Browser notifications</span>
            </label>
          </div>
        </div>

        <div class="category-item">
          <div class="category-header">
            <div class="category-info">
              <div class="category-name">Issues</div>
              <div class="category-desc">New issues and updates</div>
            </div>
          </div>
          <div class="category-toggles">
            <label class="toggle-label">
              <input type="checkbox" id="issues" checked>
              <span class="toggle-text">Show in feed</span>
            </label>
            <label class="toggle-label">
              <input type="checkbox" id="issuesNotifications" checked>
              <span class="toggle-text">Browser notifications</span>
            </label>
          </div>
        </div>

        <div class="category-item">
          <div class="category-header">
            <div class="category-info">
              <div class="category-name">Releases</div>
              <div class="category-desc">New version releases</div>
            </div>
          </div>
          <div class="category-toggles">
            <label class="toggle-label">
              <input type="checkbox" id="releases" checked>
              <span class="toggle-text">Show in feed</span>
            </label>
            <label class="toggle-label">
              <input type="checkbox" id="releasesNotifications" checked>
              <span class="toggle-text">Browser notifications</span>
            </label>
          </div>
        </div>
      </div>

      <p class="step-note">You can change these preferences anytime in settings.</p>
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
        tokenStatus.innerHTML = '<div class="status-success">✓ Token is valid</div>';
        await onboardingManager.saveStepData('token', { token, validated: true });
        await chrome.storage.local.set({ githubToken: token });
      } else {
        tokenStatus.innerHTML = '<div class="status-error">✗ Invalid token</div>';
      }
    } catch (error) {
      tokenStatus.innerHTML = '<div class="status-error">Error validating token</div>';
    }
  });
}

function setupReposStepListeners() {
  const addButtons = document.querySelectorAll('.add-repo-btn');
  const manualInput = document.getElementById('manualRepoInput');
  const addManualBtn = document.getElementById('addManualRepoBtn');
  const repoStatus = document.getElementById('repoStatus');

  // Add suggested repos
  addButtons.forEach(btn => {
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

  // Add manual repo
  addManualBtn?.addEventListener('click', async () => {
    const repo = manualInput.value.trim();
    if (!repo) return;

    if (!repo.includes('/')) {
      repoStatus.innerHTML = '<div class="status-error">Please use format: owner/repository</div>';
      return;
    }

    try {
      // Validate repo exists
      const response = await fetch(`https://api.github.com/repos/${repo}`);
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
        repoStatus.innerHTML = '<div class="status-error">Repository not found</div>';
      }
    } catch (error) {
      repoStatus.innerHTML = '<div class="status-error">Error adding repository</div>';
    }
  });
}

function setupCategoriesStepListeners() {
  // Categories are handled in handleNextStep
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

      // Save token to onboarding data
      await onboardingManager.saveStepData('token', { token });
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
  onboardingView.style.display = 'none';
  activityList.style.display = 'block';
  toolbar.style.display = 'flex';
  header.style.display = 'flex';

  // Hide footer skip button when exiting onboarding
  const footerSkipBtn = document.getElementById('footerSkipBtn');
  if (footerSkipBtn) {
    footerSkipBtn.style.display = 'none';
  }

  // Load normal activities
  loadActivities();
}

function setupEventListeners() {
  document.getElementById('refreshBtn').addEventListener('click', handleRefresh);
  document.getElementById('darkModeBtn').addEventListener('click', toggleDarkMode);
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

  // Load theme preference
  getSyncItem('theme', 'system').then(theme => {
    applyTheme(theme);
    updateDarkModeIcon();
  });

  }

async function toggleDarkMode() {
  // Toggle between: system -> light -> dark -> system
  const currentTheme = await getSyncItem('theme', 'system');
  let newTheme;

  if (currentTheme === 'system') {
    newTheme = 'light';
  } else if (currentTheme === 'light') {
    newTheme = 'dark';
  } else {
    newTheme = 'system';
  }

  chrome.storage.sync.set({ theme: newTheme });
  applyTheme(newTheme);
  updateDarkModeIcon();
}

async function updateDarkModeIcon() {
  const btn = document.getElementById('darkModeBtn');
  if (!btn) return; // Early return if button doesn't exist (test environment)

  const systemIcon = btn.querySelector('.system-icon');
  const moonIcon = btn.querySelector('.moon-icon');
  const sunIcon = btn.querySelector('.sun-icon');

  const currentTheme = await getSyncItem('theme', 'system');

  // Hide all icons first
  if (systemIcon) systemIcon.style.display = 'none';
  if (moonIcon) moonIcon.style.display = 'none';
  if (sunIcon) sunIcon.style.display = 'none';

  if (currentTheme === 'system') {
    if (systemIcon) systemIcon.style.display = 'block';
  } else if (currentTheme === 'dark') {
    if (sunIcon) sunIcon.style.display = 'block';
  } else {
    if (moonIcon) moonIcon.style.display = 'block';
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

    // Check if user has 0 repositories
    chrome.storage.sync.get(['repos'], async (result) => {
      const repos = result.repos || [];
      const hasZeroRepos = repos.length === 0;

      const optionsText = hasZeroRepos
        ? `<a href="#" id="optionsLink" class="options-link">options</a>`
        : 'options';

      const fullMessage = `Go to ${optionsText} to watch more repositories.`;

      list.innerHTML = `
        <div class="empty-state">
          <p>${emptyMessage}</p>
          <small>${fullMessage}</small>
        </div>
      `;

      // Add click listener for options link if it exists
      if (hasZeroRepos) {
        const optionsLink = document.getElementById('optionsLink');
        if (optionsLink) {
          optionsLink.addEventListener('click', async (e) => {
            e.preventDefault();

            // Open options page with hash and query parameter
            const optionsUrl = chrome.runtime.getURL('options/options.html#repositories?showAdd=true');
            await chrome.tabs.create({ url: optionsUrl });
          });
        }
      }
    });
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
  toggleSearch,
  toggleArchive
};
