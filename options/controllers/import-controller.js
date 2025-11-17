import { getToken } from '../../shared/storage-helpers.js';
import { createHeaders } from '../../shared/github-api.js';
import { escapeHtml } from '../../shared/sanitize.js';
import { formatDateVerbose } from '../../shared/utils.js';
import { STAR_ICON, createSvg } from '../../shared/icons.js';

// Import modal state
let importModalState = {
  type: null,
  repos: [],
  filteredRepos: [],
  previousFocusElement: null
};

// Focus trap utilities
function getFocusableElements(container) {
  const selector = 'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
  return Array.from(container.querySelectorAll(selector));
}

function handleModalFocusTrap(e) {
  if (e.key !== 'Tab') return;

  const modal = document.getElementById('importModal');
  const focusableElements = getFocusableElements(modal);

  if (focusableElements.length === 0) return;

  const firstElement = focusableElements[0];
  const lastElement = focusableElements[focusableElements.length - 1];

  if (e.shiftKey) {
    if (document.activeElement === firstElement) {
      e.preventDefault();
      lastElement.focus();
    }
  } else {
    if (document.activeElement === lastElement) {
      e.preventDefault();
      firstElement.focus();
    }
  }
}

function setupModalFocusTrap(modal) {
  modal.addEventListener('keydown', handleModalFocusTrap);
}

// Format number with K suffix
function formatNumber(num) {
  if (num >= 1000) {
    return (num / 1000).toFixed(1).replace(/\.0$/, '') + 'k';
  }
  return num.toString();
}

export async function openImportModal(type, watchedRepos) {
  const token = await getToken();
  if (!token) {
    return;
  }

  importModalState.type = type;
  const modal = document.getElementById('importModal');
  const title = document.getElementById('importModalTitle');

  const titles = {
    watched: 'Import Watched Repositories',
    starred: 'Import Starred Repositories',
    participating: 'Import Participating Repositories',
    mine: 'Import My Repositories'
  };

  title.textContent = titles[type] || 'Import Repositories';
  importModalState.previousFocusElement = document.activeElement;

  modal.classList.add('show');
  document.getElementById('importLoadingState').style.display = 'flex';
  document.getElementById('importReposList').style.display = 'none';
  document.getElementById('importErrorState').style.display = 'none';

  setupModalFocusTrap(modal);

  setTimeout(() => {
    const closeBtn = document.getElementById('closeImportModal');
    if (closeBtn) closeBtn.focus();
  }, 100);

  try {
    const repos = await fetchReposFromGitHub(type, token);

    const alreadyAdded = new Set(
      watchedRepos.map(r => (typeof r === 'string' ? r : r.fullName).toLowerCase())
    );

    importModalState.repos = repos.map(repo => ({
      ...repo,
      isAdded: alreadyAdded.has(repo.fullName.toLowerCase())
    }));

    importModalState.filteredRepos = [...importModalState.repos];

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

    const transformed = repos.map(repo => ({
      fullName: repo.full_name,
      description: repo.description || 'No description provided',
      language: repo.language || 'Unknown',
      stars: repo.stargazers_count || 0,
      forks: repo.forks_count || 0,
      updatedAt: repo.updated_at || repo.pushed_at
    }));

    allRepos.push(...transformed);

    const linkHeader = response.headers.get('Link');
    if (!linkHeader || !linkHeader.includes('rel="next"')) {
      hasMorePages = false;
    } else {
      page++;
    }
  }

  return allRepos;
}

export function closeImportModal() {
  const modal = document.getElementById('importModal');
  modal.classList.remove('show');
  document.getElementById('importRepoSearch').value = '';

  modal.removeEventListener('keydown', handleModalFocusTrap);

  if (importModalState.previousFocusElement) {
    importModalState.previousFocusElement.focus();
  }

  importModalState = { type: null, repos: [], filteredRepos: [], previousFocusElement: null };
}

function renderImportReposList() {
  const container = document.getElementById('importReposContainer');
  const countEl = document.getElementById('importRepoCount');

  countEl.textContent = importModalState.filteredRepos.length;

  if (importModalState.filteredRepos.length === 0) {
    container.innerHTML = '<p style="text-align: center; color: var(--text-secondary); padding: 20px;">No repositories found</p>';
    return;
  }

  const sortedRepos = [...importModalState.filteredRepos].sort((a, b) => {
    if (a.isAdded && !b.isAdded) return 1;
    if (!a.isAdded && b.isAdded) return -1;
    return 0;
  });

  container.innerHTML = sortedRepos.map(repo => {
    const isDisabled = repo.isAdded;
    const sanitizedFullName = escapeHtml(repo.fullName);
    const sanitizedDescription = escapeHtml(repo.description || '');
    const sanitizedLanguage = escapeHtml(repo.language || '');

    return `
      <li class="repo-item import-variant ${isDisabled ? 'already-added' : ''}" ${!isDisabled ? 'tabindex="0"' : ''} data-repo='${JSON.stringify(repo)}'>
        <div class="repo-content">
          <div class="repo-name">${sanitizedFullName}</div>
          <div class="repo-description">${sanitizedDescription}</div>
          <div class="repo-meta">
            <span class="meta-item">${createSvg(STAR_ICON, 16, 16, 'star-icon')}${formatNumber(repo.stars)}</span>
            ${sanitizedLanguage && sanitizedLanguage !== 'Unknown' ? `<span class="meta-item">${sanitizedLanguage}</span>` : ''}
            <span class="meta-item">Updated ${formatDateVerbose(repo.updatedAt)}</span>
          </div>
        </div>
        ${isDisabled ? '<div class="repo-actions"><span class="already-added-badge">Already added</span></div>' : ''}
      </li>
    `;
  }).join('');

  container.querySelectorAll('.repo-item.import-variant:not(.already-added)').forEach(card => {
    const toggleSelection = () => {
      card.classList.toggle('selected');
      updateSelectedCount();
    };

    card.addEventListener('click', toggleSelection);

    card.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        toggleSelection();
      }
    });
  });

  updateSelectedCount();
}

export function filterImportRepos() {
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

export function updateSelectedCount() {
  const selectedCards = document.querySelectorAll('.repo-item.import-variant.selected:not(.already-added)');
  const count = selectedCards.length;
  document.getElementById('selectedCount').textContent = count;
  document.getElementById('confirmImportBtn').disabled = count === 0;
}

export async function importSelectedRepos(watchedRepos, onReposAdded) {
  const selectedCards = document.querySelectorAll('.repo-item.import-variant.selected:not(.already-added)');
  const reposToImport = Array.from(selectedCards).map(card => JSON.parse(card.dataset.repo));

  if (reposToImport.length === 0) {
    return;
  }

  const reposWithTimestamp = reposToImport.map(repo => ({
    ...repo,
    addedAt: new Date().toISOString()
  }));

  watchedRepos.push(...reposWithTimestamp);

  await chrome.storage.sync.set({ watchedRepos });

  if (onReposAdded) {
    onReposAdded();
  }

  closeImportModal();
}
