let watchedRepos = [];

document.addEventListener('DOMContentLoaded', () => {
  loadSettings();
  setupEventListeners();
});

function setupEventListeners() {
  document.getElementById('saveBtn').addEventListener('click', saveSettings);
  document.getElementById('addRepoBtn').addEventListener('click', addRepo);

  document.getElementById('repoInput').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      addRepo();
    }
  });
}

async function loadSettings() {
  try {
    const settings = await chrome.storage.sync.get([
      'githubToken',
      'watchedRepos',
      'checkInterval',
      'filters'
    ]);

    if (settings.githubToken) {
      document.getElementById('githubToken').value = settings.githubToken;
    }

    watchedRepos = settings.watchedRepos || [];
    renderRepoList();

    if (settings.checkInterval) {
      document.getElementById('checkInterval').value = settings.checkInterval;
    }

    if (settings.filters) {
      document.getElementById('filterPrs').checked = settings.filters.prs !== false;
      document.getElementById('filterIssues').checked = settings.filters.issues !== false;
      document.getElementById('filterReleases').checked = settings.filters.releases !== false;
    }
  } catch (error) {
    showMessage('Error loading settings', 'error');
  }
}

function addRepo() {
  const input = document.getElementById('repoInput');
  const repo = input.value.trim();

  if (!repo) {
    return;
  }

  if (!repo.match(/^[\w-]+\/[\w-]+$/)) {
    showMessage('Invalid format. Use: owner/repo', 'error');
    return;
  }

  if (watchedRepos.includes(repo)) {
    showMessage('Repository already added', 'error');
    return;
  }

  watchedRepos.push(repo);
  renderRepoList();
  input.value = '';
  showMessage('Repository added. Remember to save!', 'success');
}

function removeRepo(repo) {
  watchedRepos = watchedRepos.filter(r => r !== repo);
  renderRepoList();
  showMessage('Repository removed. Remember to save!', 'success');
}

function renderRepoList() {
  const list = document.getElementById('repoList');

  if (watchedRepos.length === 0) {
    list.innerHTML = '<p class="help-text">No repositories added yet</p>';
    return;
  }

  list.innerHTML = watchedRepos.map(repo => `
    <li class="repo-item">
      <span>${repo}</span>
      <button class="danger" data-repo="${repo}">Remove</button>
    </li>
  `).join('');

  list.querySelectorAll('button').forEach(btn => {
    btn.addEventListener('click', () => {
      removeRepo(btn.dataset.repo);
    });
  });
}

async function saveSettings() {
  const token = document.getElementById('githubToken').value.trim();
  const interval = parseInt(document.getElementById('checkInterval').value);

  if (!token) {
    showMessage('GitHub token is required', 'error');
    return;
  }

  if (watchedRepos.length === 0) {
    showMessage('Add at least one repository', 'error');
    return;
  }

  const filters = {
    prs: document.getElementById('filterPrs').checked,
    issues: document.getElementById('filterIssues').checked,
    releases: document.getElementById('filterReleases').checked
  };

  try {
    await chrome.storage.sync.set({
      githubToken: token,
      watchedRepos: watchedRepos,
      checkInterval: interval,
      filters: filters
    });

    // Update alarm with new interval
    chrome.runtime.sendMessage({
      action: 'updateInterval',
      interval: interval
    });

    showMessage('Settings saved successfully!', 'success');
  } catch (error) {
    showMessage('Error saving settings', 'error');
  }
}

function showMessage(text, type) {
  const message = document.getElementById('statusMessage');
  message.textContent = text;
  message.className = `status-message ${type} show`;

  setTimeout(() => {
    message.classList.remove('show');
  }, 3000);
}
