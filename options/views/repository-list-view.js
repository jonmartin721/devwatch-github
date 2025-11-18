import { escapeHtml } from '../../shared/sanitize.js';
import { formatDateVerbose } from '../../shared/utils.js';
import { STAR_ICON, LINK_ICON, createSvg, getMuteIcon, getPinIcon } from '../../shared/icons.js';
import { safelyOpenUrl } from '../../shared/security.js';

function formatNumber(num) {
  // Guard against undefined/null values
  if (num === undefined || num === null || isNaN(num)) {
    return '0';
  }
  if (num >= 1000) {
    return (num / 1000).toFixed(1).replace(/\.0$/, '') + 'k';
  }
  return num.toString();
}

export function renderRepoList(state, onToggleMute, onTogglePin, onRemove) {
  const list = document.getElementById('repoList');
  const paginationControls = document.getElementById('paginationControls');

  if (state.watchedRepos.length === 0) {
    const toggleSearchBtn = document.getElementById('toggleSearchBtn');
    const hidePinnedToggleBtn = document.getElementById('hidePinnedToggleBtn');
    if (toggleSearchBtn) toggleSearchBtn.style.display = 'none';
    if (hidePinnedToggleBtn) hidePinnedToggleBtn.style.display = 'none';

    list.innerHTML = `
      <div class="empty-repos-card">
        <div class="empty-repos-icon">
          <svg width="48" height="48" viewBox="0 0 16 16" fill="currentColor">
            <path d="M2 2.5A2.5 2.5 0 0 1 4.5 0h8.75a.75.75 0 0 1 .75.75v12.5a.75.75 0 0 1-.75.75h-2.5a.75.75 0 0 1 0-1.5h1.75v-2h-8a1 1 0 0 0-.714 1.7.75.75 0 1 1-1.072 1.05A2.495 2.495 0 0 1 2 11.5Zm10.5-1h-8a1 1 0 0 0-1 1v6.708A2.486 2.486 0 0 1 4.5 9h8ZM5 12.25a.25.25 0 0 1 .25-.25h3.5a.25.25 0 0 1 .25.25v3.25a.25.25 0 0 1-.4.2l-1.45-1.087a.249.249 0 0 0-.3 0L5.4 15.7a.25.25 0 0 1-.4-.2Z"/>
          </svg>
        </div>
        <h3>No Repositories Yet</h3>
        <p>You haven't added any repositories to watch. Use the <strong>Add</strong> button above to add repositories manually, or click <strong>Import from GitHub</strong> to import your starred, watched, or participating repositories.</p>
        <div class="empty-repos-tips">
          <p class="tip-note">
            <svg class="svg-inline" width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
              <path d="M0 8a8 8 0 1 1 16 0A8 8 0 0 1 0 8Zm8-6.5a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13ZM6.92 6.085h.001a.749.749 0 1 1-1.342-.67c.169-.339.436-.701.849-.977C6.845 4.16 7.369 4 8 4a2.756 2.756 0 0 1 1.637.525c.503.377.863.965.863 1.725 0 .448-.115.83-.329 1.15-.205.307-.47.513-.692.662-.109.072-.22.138-.313.195l-.006.004a6.24 6.24 0 0 0-.26.16.952.952 0 0 0-.276.245.75.75 0 0 1-1.248-.832c.184-.264.42-.489.692-.661.103-.067.207-.132.313-.195l.007-.004c.1-.061.182-.11.258-.161a.969.969 0 0 0 .277-.245C8.96 6.514 9 6.427 9 6.25a.612.612 0 0 0-.262-.525A1.27 1.27 0 0 0 8 5.5c-.369 0-.595.09-.74.187a1.01 1.01 0 0 0-.34.398ZM9 11a1 1 0 1 1-2 0 1 1 0 0 1 2 0Z"/>
            </svg>
            You can add repositories using owner/repo format (e.g., "facebook/react"), GitHub URLs, or npm package names.
          </p>
        </div>
      </div>
    `;
    paginationControls.style.display = 'none';
    return;
  }

  const toggleSearchBtn = document.getElementById('toggleSearchBtn');
  const hidePinnedToggleBtn = document.getElementById('hidePinnedToggleBtn');
  if (toggleSearchBtn) toggleSearchBtn.style.display = 'flex';
  if (hidePinnedToggleBtn) hidePinnedToggleBtn.style.display = 'flex';

  const filteredRepos = getFilteredRepos(state);

  if (filteredRepos.length === 0) {
    list.innerHTML = '<p class="help-text">No repositories match your search</p>';
    paginationControls.style.display = 'none';
    return;
  }

  const sortedRepos = [...filteredRepos].sort((a, b) => {
    const aFullName = a.fullName;
    const bFullName = b.fullName;
    const aIsPinned = state.pinnedRepos.includes(aFullName);
    const bIsPinned = state.pinnedRepos.includes(bFullName);

    if (aIsPinned && !bIsPinned) return -1;
    if (!aIsPinned && bIsPinned) return 1;
    return 0;
  });

  const totalPages = Math.ceil(sortedRepos.length / state.reposPerPage);
  const startIndex = (state.currentPage - 1) * state.reposPerPage;
  const endIndex = startIndex + state.reposPerPage;
  const reposToDisplay = sortedRepos.slice(startIndex, endIndex);

  if (filteredRepos.length > state.reposPerPage) {
    paginationControls.style.display = 'flex';
    document.getElementById('prevPage').disabled = state.currentPage === 1;
    document.getElementById('nextPage').disabled = state.currentPage === totalPages;
    document.getElementById('pageInfo').textContent = `Page ${state.currentPage} of ${totalPages}`;
  } else {
    paginationControls.style.display = 'none';
  }

  list.innerHTML = reposToDisplay.map(repo => {
    // Safely extract properties with defaults for missing data
    const {
      fullName = 'Unknown',
      description = '',
      language = '',
      stars = 0,
      updatedAt = new Date().toISOString(),
      latestRelease = null
    } = repo;
    const isMuted = state.mutedRepos.includes(fullName);
    const isPinned = state.pinnedRepos.includes(fullName);

    const sanitizedFullName = escapeHtml(fullName);
    const sanitizedDescription = escapeHtml(description || '');
    const sanitizedLanguage = escapeHtml(language || '');
    const sanitizedReleaseVersion = latestRelease ? escapeHtml(latestRelease.version) : '';

    return `
      <li class="repo-item ${isMuted ? 'muted' : ''} ${isPinned ? 'pinned' : ''}">
        <div class="repo-content">
          <div class="repo-name">
            ${sanitizedFullName}
            <button class="link-btn inline-link" data-repo="${sanitizedFullName}" title="Open repository on GitHub">
              ${createSvg(LINK_ICON, 14, 14)}
            </button>
          </div>
          <div class="repo-description">${sanitizedDescription}</div>
          <div class="repo-meta">
            <span class="meta-item">${createSvg(STAR_ICON, 16, 16, 'star-icon')}${formatNumber(stars)}</span>
            ${sanitizedLanguage ? `<span class="meta-item">${sanitizedLanguage}</span>` : ''}
            ${latestRelease ? `<span class="meta-item">Latest: ${sanitizedReleaseVersion}</span>` : ''}
            <span class="meta-item">Updated ${formatDateVerbose(updatedAt)}</span>
          </div>
        </div>
        <div class="repo-actions">
          <button class="pin-btn ${isPinned ? 'pinned' : ''}" data-repo="${sanitizedFullName}" title="${isPinned ? 'Unpin - Remove from top of list' : 'Pin - Keep at top of list'}" aria-label="${isPinned ? 'Unpin repository' : 'Pin repository'}">
            ${getPinIcon(isPinned)}
          </button>
          <button class="mute-btn ${isMuted ? 'muted' : ''}" data-repo="${sanitizedFullName}" title="${isMuted ? 'Unmute - Enable notifications' : 'Mute - Disable notifications'}" aria-label="${isMuted ? 'Unmute notifications' : 'Mute notifications'}">
            ${getMuteIcon(isMuted)}
          </button>
          <button class="danger" data-repo="${sanitizedFullName}" title="Remove from watched repositories">Remove</button>
        </div>
      </li>
    `;
  }).join('');

  list.querySelectorAll('.pin-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const repo = btn.dataset.repo;
      const isPinned = state.pinnedRepos.includes(repo);
      if (onTogglePin) onTogglePin(repo, !isPinned);
    });
  });

  list.querySelectorAll('.mute-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const repo = btn.dataset.repo;
      const isMuted = state.mutedRepos.includes(repo);
      if (onToggleMute) onToggleMute(repo, !isMuted);
    });
  });

  list.querySelectorAll('button.danger').forEach(btn => {
    btn.addEventListener('click', () => {
      if (onRemove) onRemove(btn.dataset.repo);
    });
  });

  list.querySelectorAll('.link-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const repo = btn.dataset.repo;
      await safelyOpenUrl(`https://github.com/${repo}`);
    });
  });
}

function getFilteredRepos(state) {
  let repos = state.watchedRepos;

  if (state.searchQuery) {
    const query = state.searchQuery.toLowerCase();
    repos = repos.filter(repo => {
      return repo.fullName.toLowerCase().includes(query) ||
             (repo.description && repo.description.toLowerCase().includes(query)) ||
             (repo.language && repo.language.toLowerCase().includes(query));
    });
  }

  if (state.hidePinnedRepos) {
    repos = repos.filter(repo => {
      return !state.pinnedRepos.includes(repo.fullName);
    });
  }

  return repos;
}
