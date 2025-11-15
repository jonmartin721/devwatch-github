import { applyTheme, showStatusMessage } from '../shared/utils.js';
import { getSyncItem, getToken, setToken, clearToken as clearStoredToken } from '../shared/storage-helpers.js';
import { createHeaders } from '../shared/github-api.js';
import { STAR_ICON, createSvg, getMuteIcon } from '../shared/icons.js';
import { escapeHtml } from '../shared/sanitize.js';

const state = {
  watchedRepos: [],
  mutedRepos: [],
  currentPage: 1,
  reposPerPage: 10,
  searchQuery: ''
};

if (typeof document !== 'undefined') {
  document.addEventListener('DOMContentLoaded', async () => {
    await loadSettings();
    setupEventListeners();
    setupThemeListener();
  });
}

function setupThemeListener() {
  // Listen for system theme changes
  const darkModeQuery = window.matchMedia('(prefers-color-scheme: dark)');
  darkModeQuery.addEventListener('change', async () => {
    const theme = await getSyncItem('theme', 'system');
    if (theme === 'system') {
      applyTheme(theme);
    }
  });
}

function setupEventListeners() {
  document.getElementById('addRepoBtn').addEventListener('click', addRepo);
  document.getElementById('clearTokenBtn').addEventListener('click', clearToken);

  // Import repos buttons
  document.getElementById('importWatchedBtn').addEventListener('click', () => openImportModal('watched'));
  document.getElementById('importStarredBtn').addEventListener('click', () => openImportModal('starred'));
  document.getElementById('importParticipatingBtn').addEventListener('click', () => openImportModal('participating'));
  document.getElementById('importMineBtn').addEventListener('click', () => openImportModal('mine'));

  // Import/Export settings buttons
  document.getElementById('importBtn').addEventListener('click', () => {
    document.getElementById('importFileInput').click();
  });
  document.getElementById('importFileInput').addEventListener('change', handleImportFile);
  document.getElementById('exportBtn').addEventListener('click', exportSettings);

  document.getElementById('repoInput').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      addRepo();
    }
  });

  // Search functionality
  document.getElementById('repoSearch').addEventListener('input', (e) => {
    state.searchQuery = e.target.value.toLowerCase();
    state.currentPage = 1; // Reset to first page when searching
    renderRepoList();
  });

  // Pagination controls
  document.getElementById('prevPage').addEventListener('click', () => {
    if (state.currentPage > 1) {
      state.currentPage--;
      renderRepoList();
    }
  });

  document.getElementById('nextPage').addEventListener('click', () => {
    const filteredRepos = getFilteredRepos();
    const totalPages = Math.ceil(filteredRepos.length / state.reposPerPage);
    if (state.currentPage < totalPages) {
      state.currentPage++;
      renderRepoList();
    }
  });

  // Validate and auto-save token on input
  let tokenValidationTimeout;
  document.getElementById('githubToken').addEventListener('input', (e) => {
    clearTimeout(tokenValidationTimeout);
    const token = e.target.value.trim();

    if (!token) {
      document.getElementById('tokenStatus').textContent = '';
      document.getElementById('tokenStatus').className = 'token-status';
      document.getElementById('clearTokenBtn').style.display = 'none';
      return;
    }

    document.getElementById('tokenStatus').textContent = 'Checking...';
    document.getElementById('tokenStatus').className = 'token-status checking';

    tokenValidationTimeout = setTimeout(async () => {
      await validateToken(token);
      // Auto-save token after validation
      if (token) {
        await setToken(token);
      }
    }, 500);
  });

  // Auto-save theme changes
  document.querySelectorAll('input[name="theme"]').forEach(radio => {
    radio.addEventListener('change', async (e) => {
      const theme = e.target.value;
      await chrome.storage.sync.set({ theme });
      applyTheme(theme);
      showMessage('Theme updated', 'success');
    });
  });

  // Auto-save check interval changes
  document.querySelectorAll('input[name="checkInterval"]').forEach(radio => {
    radio.addEventListener('change', async (e) => {
      const interval = parseInt(e.target.value);
      await chrome.storage.sync.set({ checkInterval: interval });

      // Update alarm with new interval
      chrome.runtime.sendMessage({
        action: 'updateInterval',
        interval: interval
      });

      showMessage('Check interval updated', 'success');
    });
  });

  // Auto-save snooze duration changes
  document.querySelectorAll('input[name="snoozeHours"]').forEach(radio => {
    radio.addEventListener('change', async (e) => {
      const snoozeHours = parseInt(e.target.value);
      await chrome.storage.sync.set({ snoozeHours });
      showMessage('Snooze duration updated', 'success');
    });
  });

  // Auto-save filter and notification changes
  ['filterPrs', 'filterIssues', 'filterReleases', 'notifyPrs', 'notifyIssues', 'notifyReleases'].forEach(id => {
    document.getElementById(id).addEventListener('change', async (e) => {
      const target = e.target;

      // Handle notification toggle logic
      if (target.id.startsWith('notify')) {
        const category = target.id.replace('notify', '').toLowerCase();
        const filterId = `filter${category.charAt(0).toUpperCase() + category.slice(1)}`;
        const filterToggle = document.getElementById(filterId);

        // If trying to enable notifications but category is disabled, disable the notification
        if (target.checked && !filterToggle.checked) {
          target.checked = false;
          showMessage(`Enable "Show in feed" for ${category} first`, 'error');
          return;
        }
      }

      // Handle filter toggle logic - disable notifications if filter is disabled
      if (target.id.startsWith('filter')) {
        const category = target.id.replace('filter', '').toLowerCase();
        const notifyId = `notify${category.charAt(0).toUpperCase() + category.slice(1)}`;
        const notifyToggle = document.getElementById(notifyId);

        // If disabling filter, also disable notifications
        if (!target.checked && notifyToggle.checked) {
          notifyToggle.checked = false;
        }
      }

      const filters = {
        prs: document.getElementById('filterPrs').checked,
        issues: document.getElementById('filterIssues').checked,
        releases: document.getElementById('filterReleases').checked
      };
      const notifications = {
        prs: document.getElementById('notifyPrs').checked,
        issues: document.getElementById('notifyIssues').checked,
        releases: document.getElementById('notifyReleases').checked
      };
      await chrome.storage.sync.set({ filters, notifications });
      updateNotificationToggleStates();
      showMessage('Settings updated', 'success');
    });
  });

  // Import modal event listeners
  document.getElementById('closeImportModal').addEventListener('click', closeImportModal);
  document.getElementById('cancelImportBtn').addEventListener('click', closeImportModal);
  document.getElementById('confirmImportBtn').addEventListener('click', importSelectedRepos);

  document.getElementById('selectAllImport').addEventListener('change', (e) => {
    const checkboxes = document.querySelectorAll('.import-repo-checkbox:not(:disabled)');
    checkboxes.forEach(cb => cb.checked = e.target.checked);
    updateSelectedCount();
  });

  document.getElementById('importRepoSearch').addEventListener('input', filterImportRepos);

  // Close modal when clicking outside
  document.getElementById('importModal').addEventListener('click', (e) => {
    if (e.target.id === 'importModal') {
      closeImportModal();
    }
  });
}

function updateNotificationToggleStates() {
  // Update notification toggle states based on filter states
  const categories = ['prs', 'issues', 'releases'];

  categories.forEach(category => {
    const filterId = `filter${category.charAt(0).toUpperCase() + category.slice(1)}`;
    const notifyId = `notify${category.charAt(0).toUpperCase() + category.slice(1)}`;
    const filterToggle = document.getElementById(filterId);
    const notifyToggle = document.getElementById(notifyId);
    const notifyToggleLabel = notifyToggle.closest('.notification-toggle');

    if (filterToggle && notifyToggle && notifyToggleLabel) {
      if (filterToggle.checked) {
        // Category is enabled, notification toggle is active
        notifyToggleLabel.classList.remove('disabled');
        notifyToggle.disabled = false;
      } else {
        // Category is disabled, notification toggle is disabled
        notifyToggleLabel.classList.add('disabled');
        notifyToggle.disabled = true;
        // Make sure notification is also unchecked when disabled
        if (notifyToggle.checked) {
          notifyToggle.checked = false;
        }
      }
    }
  });
}

async function clearToken() {
  if (!confirm('Are you sure you want to clear your GitHub token?')) {
    return;
  }

  document.getElementById('githubToken').value = '';
  document.getElementById('tokenStatus').textContent = '';
  document.getElementById('tokenStatus').className = 'token-status';
  document.getElementById('clearTokenBtn').style.display = 'none';

  // Disable repo input when token is cleared
  document.getElementById('repoInput').disabled = true;
  document.getElementById('addRepoBtn').disabled = true;

  // Hide import section when token is cleared
  document.getElementById('importReposSection').style.display = 'none';

  // Clear token from secure storage
  await clearStoredToken();
  showMessage('Token cleared', 'success');
}

async function validateToken(token) {
  const statusEl = document.getElementById('tokenStatus');

  try {
    const response = await fetch('https://api.github.com/user', {
      headers: createHeaders(token)
    });

    if (response.ok) {
      const user = await response.json();
      statusEl.textContent = `✓ Valid (${user.login})`;
      statusEl.className = 'token-status valid';
      document.getElementById('clearTokenBtn').style.display = 'block';

      // Enable repo input when token is valid
      document.getElementById('repoInput').disabled = false;
      document.getElementById('addRepoBtn').disabled = false;
      document.getElementById('repoHelpText').textContent = 'Add repositories to monitor (npm package, owner/repo, or GitHub URL)';

      // Show import section when token is valid
      document.getElementById('importReposSection').style.display = 'block';
    } else if (response.status === 401) {
      statusEl.textContent = '✗ Invalid token';
      statusEl.className = 'token-status invalid';
      document.getElementById('clearTokenBtn').style.display = 'none';

      // Disable repo input when token is invalid
      document.getElementById('repoInput').disabled = true;
      document.getElementById('addRepoBtn').disabled = true;

      // Hide import section when token is invalid
      document.getElementById('importReposSection').style.display = 'none';
    } else {
      statusEl.textContent = `✗ Error (${response.status})`;
      statusEl.className = 'token-status invalid';
      document.getElementById('clearTokenBtn').style.display = 'none';

      // Disable repo input on error
      document.getElementById('repoInput').disabled = true;
      document.getElementById('addRepoBtn').disabled = true;

      // Hide import section on error
      document.getElementById('importReposSection').style.display = 'none';
    }
  } catch (error) {
    statusEl.textContent = '✗ Network error';
    statusEl.className = 'token-status invalid';
    document.getElementById('clearTokenBtn').style.display = 'none';

    // Disable repo input on network error
    document.getElementById('repoInput').disabled = true;
    document.getElementById('addRepoBtn').disabled = true;

    // Hide import section on network error
    document.getElementById('importReposSection').style.display = 'none';
  }
}

async function loadSettings() {
  try {
    // Get token from secure local storage (with automatic migration)
    const githubToken = await getToken();

    const settings = await chrome.storage.sync.get([
      'watchedRepos',
      'mutedRepos',
      'checkInterval',
      'snoozeHours',
      'filters',
      'notifications',
      'theme'
    ]);

    // Load and apply theme first
    const theme = settings.theme || 'system';
    applyTheme(theme);

    if (githubToken) {
      document.getElementById('githubToken').value = githubToken;
      document.getElementById('clearTokenBtn').style.display = 'block';
      // Validate existing token
      validateToken(githubToken);
    }

    state.watchedRepos = settings.watchedRepos || [];
    state.mutedRepos = settings.mutedRepos || [];

    // Migrate old string format to new object format
    if (githubToken && state.watchedRepos.some(r => typeof r === 'string')) {
      await migrateRepoFormat(githubToken);
    }

    renderRepoList();

    if (settings.checkInterval) {
      const intervalRadio = document.getElementById(`interval-${settings.checkInterval}`);
      if (intervalRadio) {
        intervalRadio.checked = true;
      }
    }

    if (settings.snoozeHours) {
      const snoozeRadio = document.getElementById(`snooze-${settings.snoozeHours}`);
      if (snoozeRadio) {
        snoozeRadio.checked = true;
      }
    }

    if (settings.filters) {
      document.getElementById('filterPrs').checked = settings.filters.prs !== false;
      document.getElementById('filterIssues').checked = settings.filters.issues !== false;
      document.getElementById('filterReleases').checked = settings.filters.releases !== false;
    }

    if (settings.notifications) {
      document.getElementById('notifyPrs').checked = settings.notifications.prs !== false;
      document.getElementById('notifyIssues').checked = settings.notifications.issues !== false;
      document.getElementById('notifyReleases').checked = settings.notifications.releases !== false;
    }

    // Set theme radio button
    const themeRadio = document.getElementById(`theme-${theme}`);
    if (themeRadio) {
      themeRadio.checked = true;
    }

    // Update notification toggle states after loading settings
    updateNotificationToggleStates();
  } catch (error) {
    showMessage('Error loading settings', 'error');
  }
}

async function migrateRepoFormat() {
  let needsMigration = false;
  const oldRepos = state.watchedRepos.filter(r => typeof r === 'string');

  if (oldRepos.length > 0) {
    needsMigration = true;
    console.log(`Migrating ${oldRepos.length} repositories to new format...`);

    for (const repoName of oldRepos) {
      try {
        const result = await validateRepo(repoName);
        if (result.valid) {
          // Replace string with object
          const index = state.watchedRepos.findIndex(r => r === repoName);
          if (index !== -1) {
            state.watchedRepos[index] = result.metadata;
          }
        }
      } catch (error) {
        console.error(`Failed to migrate ${repoName}:`, error);
      }
    }
  }

  // Add addedAt to repos that don't have it (set to now to avoid old notifications)
  const reposWithoutAddedAt = state.watchedRepos.filter(r => typeof r === 'object' && !r.addedAt);
  if (reposWithoutAddedAt.length > 0) {
    needsMigration = true;
    const now = new Date().toISOString();
    reposWithoutAddedAt.forEach(repo => {
      repo.addedAt = now;
    });
  }

  if (needsMigration) {
    // Save migrated repos
    await chrome.storage.sync.set({ watchedRepos: state.watchedRepos });
    console.log('Migration complete');
  }
}

async function addRepo() {
  const input = document.getElementById('repoInput');
  const statusEl = document.getElementById('repoValidationStatus');
  const errorEl = document.getElementById('repoError');
  let repo = input.value.trim();

  // Clear previous error state
  input.classList.remove('error');
  errorEl.textContent = '';

  if (!repo) {
    return;
  }

  // Check if we've hit the 50 repo limit
  if (state.watchedRepos.length >= 50) {
    showRepoError('Maximum of 50 repositories allowed');
    statusEl.className = 'repo-validation-status error';
    return;
  }

  // Show checking indicator
  statusEl.className = 'repo-validation-status checking';

  // Parse GitHub URL if provided
  const urlMatch = repo.match(/github\.com\/([^/]+\/[^/]+)/);
  if (urlMatch) {
    repo = urlMatch[1].replace(/\.git$/, '');
    input.value = repo; // Update input to show parsed format
  }
  // Check if it might be an NPM package (no slash or scoped package)
  else if (!repo.includes('/') || repo.startsWith('@')) {
    const npmResult = await fetchGitHubRepoFromNpm(repo);
    if (npmResult.success) {
      repo = npmResult.repo;
      input.value = repo; // Update input to show GitHub repo
    } else {
      showRepoError(npmResult.error);
      statusEl.className = 'repo-validation-status error';
      return;
    }
  }

  // Validate owner/repo format
  if (!repo.match(/^[\w-]+\/[\w-]+$/)) {
    showRepoError('Invalid format. Use: owner/repo, GitHub URL, or npm package');
    statusEl.className = 'repo-validation-status error';
    return;
  }

  if (state.watchedRepos.includes(repo)) {
    showRepoError('Repository already added');
    statusEl.className = 'repo-validation-status error';
    return;
  }

  // Validate repo exists on GitHub and fetch metadata
  const validationResult = await validateRepo(repo);

  if (!validationResult.valid) {
    showRepoError(validationResult.error);
    statusEl.className = 'repo-validation-status error';
    return;
  }

  // Check if already added (by fullName)
  if (state.watchedRepos.some(r => (typeof r === 'string' ? r : r.fullName) === validationResult.metadata.fullName)) {
    showRepoError('Repository already added');
    statusEl.className = 'repo-validation-status error';
    return;
  }

  // Show success indicator
  statusEl.className = 'repo-validation-status success';

  state.watchedRepos.push(validationResult.metadata);

  // Reset to last page to show the newly added repo
  const totalPages = Math.ceil(state.watchedRepos.length / state.reposPerPage);
  state.currentPage = totalPages;

  renderRepoList();

  // Auto-save
  await chrome.storage.sync.set({ watchedRepos: state.watchedRepos });
  showRepoMessage('Repository added', 'success');

  // Clear input and success indicator after brief delay
  setTimeout(() => {
    input.value = '';
    statusEl.className = 'repo-validation-status';
  }, 800);
}

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

function showRepoError(message) {
  const input = document.getElementById('repoInput');
  const statusEl = document.getElementById('repoValidationStatus');
  const errorEl = document.getElementById('repoError');

  input.classList.add('error');
  statusEl.className = 'repo-validation-status error';
  errorEl.textContent = message;

  // Remove error class after animation
  setTimeout(() => {
    input.classList.remove('error');
  }, 500);
}

async function validateRepo(repo) {
  try {
    const githubToken = await getSyncItem('githubToken');
    const headers = githubToken ? createHeaders(githubToken) : {
      'Accept': 'application/vnd.github.v3+json'
    };

    const response = await fetch(`https://api.github.com/repos/${repo}`, { headers });

    if (response.ok) {
      const data = await response.json();

      // Fetch latest release
      let latestRelease = null;
      try {
        const releaseResponse = await fetch(`https://api.github.com/repos/${repo}/releases/latest`, { headers });
        if (releaseResponse.ok) {
          const releaseData = await releaseResponse.json();
          latestRelease = {
            version: releaseData.tag_name,
            publishedAt: releaseData.published_at
          };
        }
      } catch (e) {
        // No releases or error fetching - that's ok
      }

      return {
        valid: true,
        metadata: {
          fullName: data.full_name,
          description: data.description || 'No description provided',
          language: data.language || 'Unknown',
          stars: data.stargazers_count,
          forks: data.forks_count,
          updatedAt: data.updated_at,
          latestRelease,
          addedAt: new Date().toISOString()
        }
      };
    } else if (response.status === 404) {
      return { valid: false, error: `Repository "${repo}" not found` };
    } else if (response.status === 403) {
      return { valid: false, error: 'Rate limit exceeded' };
    } else if (response.status === 401) {
      return { valid: false, error: 'Invalid token' };
    } else {
      return { valid: false, error: `Error (${response.status})` };
    }
  } catch (error) {
    return { valid: false, error: 'Network error' };
  }
}

async function removeRepo(repoFullName) {
  state.watchedRepos = state.watchedRepos.filter(r => {
    const fullName = typeof r === 'string' ? r : r.fullName;
    return fullName !== repoFullName;
  });

  // Adjust current page if we deleted the last item on a page
  const totalPages = Math.ceil(state.watchedRepos.length / state.reposPerPage);
  if (state.currentPage > totalPages && state.currentPage > 1) {
    state.currentPage = totalPages;
  }

  renderRepoList();

  // Auto-save
  await chrome.storage.sync.set({ watchedRepos: state.watchedRepos });
  showRepoMessage('Repository removed', 'success');
}

function getFilteredRepos() {
  if (!state.searchQuery) {
    return state.watchedRepos;
  }

  return state.watchedRepos.filter(repo => {
    const fullName = typeof repo === 'string' ? repo : repo.fullName;
    const description = typeof repo === 'string' ? '' : repo.description;
    const language = typeof repo === 'string' ? '' : repo.language;

    return fullName.toLowerCase().includes(state.searchQuery) ||
           description.toLowerCase().includes(state.searchQuery) ||
           language.toLowerCase().includes(state.searchQuery);
  });
}

function formatNumber(num) {
  if (num >= 1000000) {
    return (num / 1000000).toFixed(1) + 'M';
  } else if (num >= 1000) {
    return (num / 1000).toFixed(1) + 'k';
  }
  return num.toString();
}

// Local formatDate for options page (different from popup's formatDate)
function formatDateLocal(dateString) {
  const date = new Date(dateString);
  const now = new Date();
  const diffTime = Math.abs(now - date);
  const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return 'today';
  if (diffDays === 1) return 'yesterday';
  if (diffDays < 7) return `${diffDays} days ago`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;
  if (diffDays < 365) return `${Math.floor(diffDays / 30)} months ago`;
  return `${Math.floor(diffDays / 365)} years ago`;
}

function renderRepoList() {
  const list = document.getElementById('repoList');
  const searchContainer = document.getElementById('repoSearchContainer');
  const paginationControls = document.getElementById('paginationControls');

  if (state.watchedRepos.length === 0) {
    list.innerHTML = '<p class="help-text">No repositories added yet</p>';
    searchContainer.style.display = 'none';
    paginationControls.style.display = 'none';
    return;
  }

  // Show search if we have repos
  searchContainer.style.display = state.watchedRepos.length > 0 ? 'block' : 'none';

  const filteredRepos = getFilteredRepos();

  if (filteredRepos.length === 0) {
    list.innerHTML = '<p class="help-text">No repositories match your search</p>';
    paginationControls.style.display = 'none';
    return;
  }

  // Calculate pagination
  const totalPages = Math.ceil(filteredRepos.length / state.reposPerPage);
  const startIndex = (state.currentPage - 1) * state.reposPerPage;
  const endIndex = startIndex + state.reposPerPage;
  const reposToDisplay = filteredRepos.slice(startIndex, endIndex);

  // Show/hide pagination based on number of repos
  if (filteredRepos.length > state.reposPerPage) {
    paginationControls.style.display = 'flex';
    document.getElementById('prevPage').disabled = state.currentPage === 1;
    document.getElementById('nextPage').disabled = state.currentPage === totalPages;
    document.getElementById('pageInfo').textContent = `Page ${state.currentPage} of ${totalPages}`;
  } else {
    paginationControls.style.display = 'none';
  }

  list.innerHTML = reposToDisplay.map(repo => {
    // Handle both old string format and new object format
    if (typeof repo === 'string') {
      const isMuted = state.mutedRepos.includes(repo);
      const sanitizedRepo = escapeHtml(repo);
      return `
        <li class="repo-item ${isMuted ? 'muted' : ''}">
          <div class="repo-content">
            <div class="repo-name">${sanitizedRepo}</div>
            <div class="repo-description">Legacy format - remove and re-add to see details</div>
          </div>
          <div class="repo-actions">
            <button class="mute-btn ${isMuted ? 'muted' : ''}" data-repo="${sanitizedRepo}" title="${isMuted ? 'Unmute notifications' : 'Mute notifications'}">
              ${getMuteIcon(isMuted)}
            </button>
            <button class="danger" data-repo="${sanitizedRepo}">Remove</button>
          </div>
        </li>
      `;
    }

    const { fullName, description, language, stars, updatedAt, latestRelease } = repo;
    const isMuted = state.mutedRepos.includes(fullName);

    // Sanitize all user-generated content to prevent XSS
    const sanitizedFullName = escapeHtml(fullName);
    const sanitizedDescription = escapeHtml(description || '');
    const sanitizedLanguage = escapeHtml(language || '');
    const sanitizedReleaseVersion = latestRelease ? escapeHtml(latestRelease.version) : '';

    return `
      <li class="repo-item ${isMuted ? 'muted' : ''}">
        <div class="repo-content">
          <div class="repo-name">${sanitizedFullName}</div>
          <div class="repo-description">${sanitizedDescription}</div>
          <div class="repo-meta">
            <span class="meta-item">${createSvg(STAR_ICON, 16, 16, 'star-icon')}${formatNumber(stars)}</span>
            ${sanitizedLanguage ? `<span class="meta-item">${sanitizedLanguage}</span>` : ''}
            ${latestRelease ? `<span class="meta-item">Latest: ${sanitizedReleaseVersion}</span>` : ''}
            <span class="meta-item">Updated ${formatDateLocal(updatedAt)}</span>
          </div>
        </div>
        <div class="repo-actions">
          <button class="mute-btn ${isMuted ? 'muted' : ''}" data-repo="${sanitizedFullName}" title="${isMuted ? 'Unmute notifications' : 'Mute notifications'}">
            ${getMuteIcon(isMuted)}
          </button>
          <button class="danger" data-repo="${sanitizedFullName}">Remove</button>
        </div>
      </li>
    `;
  }).join('');

  list.querySelectorAll('.mute-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const repo = btn.dataset.repo;
      const isMuted = state.mutedRepos.includes(repo);
      toggleMuteRepo(repo, !isMuted);
    });
  });

  list.querySelectorAll('button.danger').forEach(btn => {
    btn.addEventListener('click', () => {
      removeRepo(btn.dataset.repo);
    });
  });
}

async function toggleMuteRepo(repoFullName, mute) {
  if (mute) {
    if (!state.mutedRepos.includes(repoFullName)) {
      state.mutedRepos.push(repoFullName);
    }
  } else {
    state.mutedRepos = state.mutedRepos.filter(r => r !== repoFullName);
  }

  // Auto-save and re-render
  await chrome.storage.sync.set({ mutedRepos: state.mutedRepos });
  renderRepoList();
  showRepoMessage(mute ? 'Repository muted' : 'Repository unmuted', 'success');
}

function showMessage(text, type) {
  showStatusMessage('statusMessage', text, type);
}

function showRepoMessage(text, type) {
  showStatusMessage('repoStatusMessage', text, type);
}

// Import repositories functionality
let importModalState = {
  type: null, // 'watched', 'starred', 'participating'
  repos: [],
  filteredRepos: []
};

async function openImportModal(type) {
  const token = await getToken();
  if (!token) {
    showRepoMessage('Please add a GitHub token first', 'error');
    return;
  }

  importModalState.type = type;
  const modal = document.getElementById('importModal');
  const title = document.getElementById('importModalTitle');

  // Set title based on type
  const titles = {
    watched: 'Import Watched Repositories',
    starred: 'Import Starred Repositories',
    participating: 'Import Participating Repositories',
    mine: 'Import My Repositories'
  };

  title.textContent = titles[type] || 'Import Repositories';

  // Show modal and loading state
  modal.classList.add('show');
  document.getElementById('importLoadingState').style.display = 'flex';
  document.getElementById('importReposList').style.display = 'none';
  document.getElementById('importErrorState').style.display = 'none';

  try {
    // Fetch repos from GitHub
    const repos = await fetchReposFromGitHub(type, token);

    // Filter out already added repos
    const alreadyAdded = new Set(
      state.watchedRepos.map(r => (typeof r === 'string' ? r : r.fullName).toLowerCase())
    );

    importModalState.repos = repos.map(repo => ({
      ...repo,
      isAdded: alreadyAdded.has(repo.fullName.toLowerCase())
    }));

    importModalState.filteredRepos = [...importModalState.repos];

    // Show repos list
    document.getElementById('importLoadingState').style.display = 'none';
    document.getElementById('importReposList').style.display = 'block';
    renderImportReposList();
  } catch (error) {
    document.getElementById('importLoadingState').style.display = 'none';
    document.getElementById('importErrorState').style.display = 'block';
    document.getElementById('importErrorMessage').textContent = error.message || 'Failed to fetch repositories';
  }
}

async function fetchReposFromGitHub(type, token) {
  const headers = createHeaders(token);
  let allRepos = [];
  let page = 1;
  const perPage = 100;

  // Determine API endpoint based on type
  const endpoints = {
    watched: 'https://api.github.com/user/subscriptions',
    starred: 'https://api.github.com/user/starred',
    participating: 'https://api.github.com/user/repos?affiliation=collaborator,organization_member&sort=pushed',
    mine: 'https://api.github.com/user/repos?type=all&sort=updated'
  };

  const url = endpoints[type];
  if (!url) {
    throw new Error(`Invalid import type: ${type}`);
  }

  // Fetch all pages
  let hasMorePages = true;
  while (hasMorePages) {
    const response = await fetch(`${url}${url.includes('?') ? '&' : '?'}per_page=${perPage}&page=${page}`, {
      headers
    });

    if (!response.ok) {
      if (response.status === 401) {
        throw new Error('Invalid GitHub token');
      } else if (response.status === 403) {
        throw new Error('Rate limit exceeded or insufficient permissions');
      } else {
        throw new Error(`GitHub API error: ${response.status}`);
      }
    }

    const repos = await response.json();
    if (repos.length === 0) {
      hasMorePages = false;
      break;
    }

    // Transform to our format
    const transformed = repos.map(repo => ({
      fullName: repo.full_name,
      description: repo.description || 'No description provided',
      language: repo.language || 'Unknown',
      stars: repo.stargazers_count || 0,
      forks: repo.forks_count || 0,
      updatedAt: repo.updated_at || repo.pushed_at
    }));

    allRepos.push(...transformed);

    // Check if there are more pages
    const linkHeader = response.headers.get('Link');
    if (!linkHeader || !linkHeader.includes('rel="next"')) {
      hasMorePages = false;
    } else {
      page++;
    }
  }

  return allRepos;
}

function closeImportModal() {
  document.getElementById('importModal').classList.remove('show');
  document.getElementById('importRepoSearch').value = '';
  importModalState = { type: null, repos: [], filteredRepos: [] };
}

function renderImportReposList() {
  const container = document.getElementById('importReposContainer');
  const countEl = document.getElementById('importRepoCount');

  countEl.textContent = importModalState.filteredRepos.length;

  if (importModalState.filteredRepos.length === 0) {
    container.innerHTML = '<p style="text-align: center; color: var(--text-secondary); padding: 20px;">No repositories found</p>';
    return;
  }

  container.innerHTML = importModalState.filteredRepos.map(repo => {
    const checkboxId = `import-${repo.fullName.replace(/\//g, '-')}`;
    const isDisabled = repo.isAdded;

    return `
      <div class="import-repo-item">
        <input type="checkbox"
               class="import-repo-checkbox"
               id="${checkboxId}"
               data-repo='${JSON.stringify(repo)}'
               ${isDisabled ? 'disabled' : ''}
               onchange="updateSelectedCount()">
        <div class="import-repo-info">
          <div class="import-repo-name">${escapeHtml(repo.fullName)}</div>
          <div class="import-repo-description">${escapeHtml(repo.description)}</div>
          <div class="import-repo-meta">
            ${repo.language !== 'Unknown' ? `<span class="import-repo-meta-item">${escapeHtml(repo.language)}</span>` : ''}
            <span class="import-repo-meta-item">⭐ ${formatNumber(repo.stars)}</span>
            <span class="import-repo-meta-item">Updated ${formatDateLocal(repo.updatedAt)}</span>
          </div>
        </div>
        ${isDisabled ? '<span class="import-repo-already-added">Already added</span>' : ''}
      </div>
    `;
  }).join('');

  updateSelectedCount();
}

function filterImportRepos() {
  const query = document.getElementById('importRepoSearch').value.toLowerCase();

  if (!query) {
    importModalState.filteredRepos = [...importModalState.repos];
  } else {
    importModalState.filteredRepos = importModalState.repos.filter(repo => {
      return repo.fullName.toLowerCase().includes(query) ||
             repo.description.toLowerCase().includes(query) ||
             repo.language.toLowerCase().includes(query);
    });
  }

  renderImportReposList();
}

function updateSelectedCount() {
  const checkboxes = document.querySelectorAll('.import-repo-checkbox:checked:not(:disabled)');
  const count = checkboxes.length;
  document.getElementById('selectedCount').textContent = count;
  document.getElementById('confirmImportBtn').disabled = count === 0;
}

async function importSelectedRepos() {
  const checkboxes = document.querySelectorAll('.import-repo-checkbox:checked:not(:disabled)');
  const reposToImport = Array.from(checkboxes).map(cb => JSON.parse(cb.dataset.repo));

  if (reposToImport.length === 0) {
    return;
  }

  // Add addedAt timestamp to each repo
  const reposWithTimestamp = reposToImport.map(repo => ({
    ...repo,
    addedAt: new Date().toISOString()
  }));

  // Add to watched repos
  state.watchedRepos.push(...reposWithTimestamp);

  // Save to storage
  await chrome.storage.sync.set({ watchedRepos: state.watchedRepos });

  // Re-render repo list
  renderRepoList();

  // Close modal and show success message
  closeImportModal();
  showRepoMessage(`Successfully imported ${reposToImport.length} ${reposToImport.length === 1 ? 'repository' : 'repositories'}`, 'success');
}

// Export settings to JSON file
async function exportSettings() {
  try {
    // Get all settings from storage
    const syncData = await chrome.storage.sync.get(null);

    // Create export object with all settings except the token
    const exportData = {
      version: '1.0.0',
      exportedAt: new Date().toISOString(),
      settings: {
        watchedRepos: syncData.watchedRepos || [],
        mutedRepos: syncData.mutedRepos || [],
        filters: syncData.filters || { prs: true, issues: true, releases: true },
        notifications: syncData.notifications || { prs: true, issues: true, releases: true },
        theme: syncData.theme || 'system',
        checkInterval: syncData.checkInterval || 15,
        snoozeHours: syncData.snoozeHours || 1,
        snoozedRepos: syncData.snoozedRepos || []
      }
    };

    // Convert to JSON string
    const jsonString = JSON.stringify(exportData, null, 2);

    // Create blob and download
    const blob = new Blob([jsonString], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `github-devwatch-settings-${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    showMessage('Settings exported successfully', 'success');
  } catch (error) {
    console.error('Export error:', error);
    showMessage('Failed to export settings', 'error');
  }
}

// Handle import file selection
async function handleImportFile(event) {
  const file = event.target.files[0];
  if (!file) return;

  try {
    const text = await file.text();
    const importData = JSON.parse(text);

    // Validate import data structure
    if (!importData.settings) {
      throw new Error('Invalid settings file format');
    }

    // Confirm import with user
    const confirmed = confirm(
      'This will replace your current settings (except GitHub token). Continue?'
    );

    if (!confirmed) {
      event.target.value = ''; // Reset file input
      return;
    }

    // Import settings to storage
    const settings = importData.settings;
    await chrome.storage.sync.set({
      watchedRepos: settings.watchedRepos || [],
      mutedRepos: settings.mutedRepos || [],
      filters: settings.filters || { prs: true, issues: true, releases: true },
      notifications: settings.notifications || { prs: true, issues: true, releases: true },
      theme: settings.theme || 'system',
      checkInterval: settings.checkInterval || 15,
      snoozeHours: settings.snoozeHours || 1,
      snoozedRepos: settings.snoozedRepos || []
    });

    // Update interval alarm if needed
    if (settings.checkInterval) {
      chrome.runtime.sendMessage({
        action: 'updateInterval',
        interval: settings.checkInterval
      });
    }

    // Reload settings to update UI
    await loadSettings();

    showMessage('Settings imported successfully! Reloading page...', 'success');

    // Reload page after short delay
    setTimeout(() => {
      window.location.reload();
    }, 1500);

  } catch (error) {
    console.error('Import error:', error);
    showMessage('Failed to import settings. Please check the file format.', 'error');
  } finally {
    // Reset file input
    event.target.value = '';
  }
}

// Make updateSelectedCount available globally for inline event handlers
window.updateSelectedCount = updateSelectedCount;

// Export functions for testing
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    state,
    validateToken,
    addRepo,
    fetchGitHubRepoFromNpm,
    validateRepo,
    removeRepo,
    toggleMuteRepo,
    getFilteredRepos,
    renderRepoList,
    migrateRepoFormat,
    formatNumber,
    formatDate: formatDateLocal,  // Export local version for tests
    exportSettings,
    handleImportFile
  };
}

// ES6 exports for tests
export {
  state,
  validateToken,
  addRepo,
  fetchGitHubRepoFromNpm,
  validateRepo,
  removeRepo,
  toggleMuteRepo,
  getFilteredRepos,
  renderRepoList,
  migrateRepoFormat,
  formatNumber,
  formatDateLocal as formatDate,  // Export local version for tests
  exportSettings,
  handleImportFile
};
