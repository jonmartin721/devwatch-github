import { escapeHtml } from '../../shared/sanitize.js';
import { NotificationManager } from '../../shared/ui/notification-manager.js';

const notifications = NotificationManager.getInstance();

export function renderSnoozedRepos(snoozedRepos) {
  const container = document.getElementById('snoozedReposList');
  const now = Date.now();
  const activeSnoozes = snoozedRepos.filter(snooze => snooze.expiresAt > now);

  if (activeSnoozes.length === 0) {
    container.innerHTML = `
      <div class="empty-snoozes" id="emptySnoozes">
        <p>No repositories are currently snoozed</p>
        <small>Snooze repositories from the popup to see them here</small>
      </div>
    `;
    return;
  }

  let html = '';

  activeSnoozes.forEach(snooze => {
    const timeRemaining = formatTimeRemaining(snooze.expiresAt - now);
    const isExpiringSoon = (snooze.expiresAt - now) < 60 * 60 * 1000;

    html += `
      <div class="snoozed-repo-item">
        <div class="snoozed-repo-info">
          <div class="snoozed-repo-name">${escapeHtml(snooze.repo)}</div>
          <div class="snoozed-repo-time">
            ${isExpiringSoon ? `
              <svg class="snooze-expiry-warning" width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
                <path d="M6.457 1.047c.659-1.234 2.427-1.234 3.086 0l6.082 11.378A1.75 1.75 0 0114.082 15H1.918a1.75 1.75 0 01-1.543-2.575zm1.763.707a.25.25 0 00-.44 0L1.698 13.132a.25.25 0 00.22.368h12.164a.25.25 0 00.22-.368zm.53 3.996v2.5a.75.75 0 11-1.5 0v-2.5a.75.75 0 111.5 0zM9 11a1 1 0 11-2 0 1 1 0 012 0z"/>
              </svg>
            ` : ''}
            Snoozed until ${new Date(snooze.expiresAt).toLocaleString()} (${timeRemaining})
          </div>
        </div>
        <div class="snoozed-repo-actions">
          <button class="unsnooze-btn" data-repo="${escapeHtml(snooze.repo)}"
                  aria-label="Unsnooze ${escapeHtml(snooze.repo)} repository">
            Unsnooze
          </button>
        </div>
      </div>
    `;
  });

  container.innerHTML = html;

  container.querySelectorAll('.unsnooze-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const repo = e.target.dataset.repo;
      unsnoozeRepo(repo);
    });
  });
}

function formatTimeRemaining(milliseconds) {
  const hours = Math.floor(milliseconds / (1000 * 60 * 60));
  const minutes = Math.floor((milliseconds % (1000 * 60 * 60)) / (1000 * 60));

  if (hours > 24) {
    const days = Math.floor(hours / 24);
    const remainingHours = hours % 24;
    return `${days}d ${remainingHours}h`;
  } else if (hours > 0) {
    return `${hours}h ${minutes}m`;
  } else if (minutes > 0) {
    return `${minutes}m`;
  } else {
    return 'Less than 1m';
  }
}

export async function unsnoozeRepo(repo) {
  try {
    const settings = await chrome.storage.sync.get(['snoozedRepos']);
    let snoozedRepos = settings.snoozedRepos || [];

    snoozedRepos = snoozedRepos.filter(snooze => snooze.repo !== repo);

    await chrome.storage.sync.set({ snoozedRepos });

    renderSnoozedRepos(snoozedRepos);

    notifications.info(`Unsnoozed ${repo} - notifications will resume`);

  } catch (error) {
    console.error(`Error unsnoozing ${repo}:`, error);
    notifications.error(`Failed to unsnooze ${repo}`);
  }
}
