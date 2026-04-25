import { STORAGE_CONFIG } from '../../shared/config.js';
import { getAccessToken, getSyncItem, setWatchedRepos } from '../../shared/storage-helpers.js';
import {
  fetchGitHubRepoSource,
  getGitHubRepoSourceConfig
} from '../../shared/github-repo-sources.js';
import { getRepoFullName, normalizeWatchedRepoRecord } from '../../shared/repo-service.js';
import { escapeHtml, unescapeHtml } from '../../shared/sanitize.js';
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
  // Allow closing modal with Escape key
  if (e.key === 'Escape') {
    e.preventDefault();
    closeImportModal();
    return;
  }

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
  const token = await getAccessToken();
  if (!token) {
    return;
  }

  importModalState.type = type;
  const modal = document.getElementById('importModal');
  const title = document.getElementById('importModalTitle');
  const sourceConfig = getGitHubRepoSourceConfig(type);

  title.textContent = sourceConfig.modalTitle;
  importModalState.previousFocusElement = document.activeElement;

  modal.classList.add('show');
  document.getElementById('importLoadingState').classList.remove('hidden');
  const reposList = document.getElementById('importReposList');
  reposList.classList.add('hidden');
  document.getElementById('importErrorState').classList.add('hidden');

  setupModalFocusTrap(modal);

  setTimeout(() => {
    const closeBtn = document.getElementById('closeImportModal');
    if (closeBtn) closeBtn.focus();
  }, 100);

  try {
    const repos = await fetchGitHubRepoSource(type, token);

    const alreadyAdded = new Set(
      (watchedRepos || [])
        .map(repo => getRepoFullName(repo).toLowerCase())
        .filter(Boolean)
    );

    importModalState.repos = repos.map(repo => ({
      ...repo,
      isAdded: alreadyAdded.has(repo.fullName.toLowerCase())
    }));

    importModalState.filteredRepos = [...importModalState.repos];

    document.getElementById('importLoadingState').classList.add('hidden');
    const reposList = document.getElementById('importReposList');
    reposList.classList.remove('hidden');
    renderImportReposList();
  } catch (error) {
    document.getElementById('importLoadingState').classList.add('hidden');
    document.getElementById('importErrorState').classList.remove('hidden');
    document.getElementById('importErrorMessage').textContent = error.message || 'Failed to fetch repositories';
  }
}

export function closeImportModal() {
  const modal = document.getElementById('importModal');
  modal.classList.remove('show');
  document.getElementById('importRepoSearch').value = '';
  const selectAllCheckbox = document.getElementById('selectAllImport');
  if (selectAllCheckbox) {
    selectAllCheckbox.checked = false;
  }
  document.getElementById('selectedCount').textContent = '0';
  document.getElementById('confirmImportBtn').disabled = true;

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
    container.innerHTML = '<p class="empty-message">No repositories found</p>';
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
    const sanitizedRepoData = escapeHtml(JSON.stringify(repo));

    return `
      <li class="repo-item import-variant ${isDisabled ? 'already-added' : ''}" ${!isDisabled ? 'tabindex="0"' : ''} data-repo="${sanitizedRepoData}">
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
  const reposToImport = Array.from(selectedCards).map(card => {
    const escapedData = card.dataset.repo;
    const unescapedData = unescapeHtml(escapedData);
    return JSON.parse(unescapedData);
  });

  if (reposToImport.length === 0) {
    return;
  }

  const existingRepoNames = new Set(
    (watchedRepos || [])
      .map(repo => getRepoFullName(repo).toLowerCase())
      .filter(Boolean)
  );
  const uniqueReposToImport = reposToImport.filter(repo => !existingRepoNames.has(repo.fullName.toLowerCase()));

  if (uniqueReposToImport.length === 0) {
    return;
  }

  const allowUnlimitedRepos = await getSyncItem('allowUnlimitedRepos', false);

  if (!allowUnlimitedRepos) {
    const remainingSlots = Math.max(STORAGE_CONFIG.MAX_WATCHED_REPOS - existingRepoNames.size, 0);

    if (uniqueReposToImport.length > remainingSlots) {
      throw new Error(
        `Import would exceed the ${STORAGE_CONFIG.MAX_WATCHED_REPOS} repository limit. Select ${remainingSlots} or fewer repositories, or enable "Unlimited Repositories" in Advanced settings.`
      );
    }
  }

  const nextWatchedRepos = [
    ...watchedRepos,
    ...uniqueReposToImport.map(repo => normalizeWatchedRepoRecord(repo))
  ];

  await setWatchedRepos(nextWatchedRepos);
  watchedRepos.splice(0, watchedRepos.length, ...nextWatchedRepos);

  if (onReposAdded) {
    onReposAdded();
  }

  closeImportModal();
}
