import { applyTheme, showStatusMessage } from '../shared/utils.js';
import { getSyncItem } from '../shared/storage-helpers.js';
import { createHeaders } from '../shared/github-api.js';
import { STAR_ICON, createSvg, getMuteIcon } from '../shared/icons.js';

const state = {
  watchedRepos: [],
  mutedRepos: [],
  currentPage: 1,
  reposPerPage: 10,
  searchQuery: ''
};

if (typeof document !== 'undefined') {
  document.addEventListener('DOMContentLoaded', () => {
    loadDarkMode();
    loadSettings();
    setupEventListeners();
  });
}

async function loadDarkMode() {
  const theme = await getSyncItem('theme', 'system');
  applyTheme(theme);
}

function setupEventListeners() {
  document.getElementById('saveBtn').addEventListener('click', saveSettings);
  document.getElementById('addRepoBtn').addEventListener('click', addRepo);
  document.getElementById('clearTokenBtn').addEventListener('click', clearToken);

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

  // Validate token on input
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

    tokenValidationTimeout = setTimeout(() => {
      validateToken(token);
    }, 500);
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

  await chrome.storage.sync.set({ githubToken: '' });
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
    } else if (response.status === 401) {
      statusEl.textContent = '✗ Invalid token';
      statusEl.className = 'token-status invalid';
      document.getElementById('clearTokenBtn').style.display = 'none';

      // Disable repo input when token is invalid
      document.getElementById('repoInput').disabled = true;
      document.getElementById('addRepoBtn').disabled = true;
    } else {
      statusEl.textContent = `✗ Error (${response.status})`;
      statusEl.className = 'token-status invalid';
      document.getElementById('clearTokenBtn').style.display = 'none';

      // Disable repo input on error
      document.getElementById('repoInput').disabled = true;
      document.getElementById('addRepoBtn').disabled = true;
    }
  } catch (error) {
    statusEl.textContent = '✗ Network error';
    statusEl.className = 'token-status invalid';
    document.getElementById('clearTokenBtn').style.display = 'none';

    // Disable repo input on network error
    document.getElementById('repoInput').disabled = true;
    document.getElementById('addRepoBtn').disabled = true;
  }
}

async function loadSettings() {
  try {
    const settings = await chrome.storage.sync.get([
      'githubToken',
      'watchedRepos',
      'mutedRepos',
      'checkInterval',
      'snoozeHours',
      'filters',
      'notifications',
      'theme'
    ]);

    if (settings.githubToken) {
      document.getElementById('githubToken').value = settings.githubToken;
      document.getElementById('clearTokenBtn').style.display = 'block';
      // Validate existing token
      validateToken(settings.githubToken);
    }

    state.watchedRepos = settings.watchedRepos || [];
    state.mutedRepos = settings.mutedRepos || [];

    // Migrate old string format to new object format
    if (settings.githubToken && state.watchedRepos.some(r => typeof r === 'string')) {
      await migrateRepoFormat(settings.githubToken);
    }

    renderRepoList();

    if (settings.checkInterval) {
      document.getElementById('checkInterval').value = settings.checkInterval;
    }

    if (settings.snoozeHours) {
      document.getElementById('snoozeHours').value = settings.snoozeHours;
    }

    if (settings.filters) {
      document.getElementById('filterPrs').checked = settings.filters.prs !== false;
      document.getElementById('filterIssues').checked = settings.filters.issues !== false;
      document.getElementById('filterReleases').checked = settings.filters.releases !== false;
    }

    if (settings.notifications) {
      document.getElementById('enableNotifications').checked = settings.notifications.enabled !== false;
      document.getElementById('notifyPrs').checked = settings.notifications.prs !== false;
      document.getElementById('notifyIssues').checked = settings.notifications.issues !== false;
      document.getElementById('notifyReleases').checked = settings.notifications.releases !== false;
    }

    if (settings.theme) {
      document.getElementById('theme').value = settings.theme;
    }
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
      return `
        <li class="repo-item ${isMuted ? 'muted' : ''}">
          <div class="repo-content">
            <div class="repo-name">${repo}</div>
            <div class="repo-description">Legacy format - remove and re-add to see details</div>
          </div>
          <div class="repo-actions">
            <button class="mute-btn ${isMuted ? 'muted' : ''}" data-repo="${repo}" title="${isMuted ? 'Unmute notifications' : 'Mute notifications'}">
              ${getMuteIcon(isMuted)}
            </button>
            <button class="danger" data-repo="${repo}">Remove</button>
          </div>
        </li>
      `;
    }

    const { fullName, description, language, stars, updatedAt, latestRelease } = repo;
    const isMuted = state.mutedRepos.includes(fullName);

    return `
      <li class="repo-item ${isMuted ? 'muted' : ''}">
        <div class="repo-content">
          <div class="repo-name">${fullName}</div>
          <div class="repo-description">${description}</div>
          <div class="repo-meta">
            <span class="meta-item">${createSvg(STAR_ICON, 16, 16, 'star-icon')}${formatNumber(stars)}</span>
            ${language ? `<span class="meta-item">${language}</span>` : ''}
            ${latestRelease ? `<span class="meta-item">Latest: ${latestRelease.version}</span>` : ''}
            <span class="meta-item">Updated ${formatDateLocal(updatedAt)}</span>
          </div>
        </div>
        <div class="repo-actions">
          <button class="mute-btn ${isMuted ? 'muted' : ''}" data-repo="${fullName}" title="${isMuted ? 'Unmute notifications' : 'Mute notifications'}">
            ${getMuteIcon(isMuted)}
          </button>
          <button class="danger" data-repo="${fullName}">Remove</button>
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

async function saveSettings() {
  const token = document.getElementById('githubToken').value.trim();
  const interval = parseInt(document.getElementById('checkInterval').value);
  const snoozeHours = parseInt(document.getElementById('snoozeHours').value);

  if (!token) {
    showMessage('GitHub token is required', 'error');
    return;
  }

  const filters = {
    prs: document.getElementById('filterPrs').checked,
    issues: document.getElementById('filterIssues').checked,
    releases: document.getElementById('filterReleases').checked
  };

  const notifications = {
    enabled: document.getElementById('enableNotifications').checked,
    prs: document.getElementById('notifyPrs').checked,
    issues: document.getElementById('notifyIssues').checked,
    releases: document.getElementById('notifyReleases').checked
  };

  const theme = document.getElementById('theme').value;

  try {
    await chrome.storage.sync.set({
      githubToken: token,
      watchedRepos: state.watchedRepos,
      mutedRepos: state.mutedRepos,
      checkInterval: interval,
      snoozeHours: snoozeHours,
      filters: filters,
      notifications: notifications,
      theme: theme
    });

    // Apply theme immediately
    applyTheme(theme);

    // Update alarm with new interval
    chrome.runtime.sendMessage({
      action: 'updateInterval',
      interval: interval
    });

    showMessage('Settings saved', 'success');
  } catch (error) {
    showMessage('Error saving settings', 'error');
  }
}

function showMessage(text, type) {
  showStatusMessage('statusMessage', text, type);
}

function showRepoMessage(text, type) {
  showStatusMessage('repoStatusMessage', text, type);
}

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
    formatDate: formatDateLocal  // Export local version for tests
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
  formatDateLocal as formatDate  // Export local version for tests
};
