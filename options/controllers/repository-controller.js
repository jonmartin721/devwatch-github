import { NotificationManager } from '../../shared/ui/notification-manager.js';

const notifications = NotificationManager.getInstance();

export async function toggleMuteRepo(repoFullName, mute, state, renderCallback) {
  if (mute) {
    if (!state.mutedRepos.includes(repoFullName)) {
      state.mutedRepos.push(repoFullName);
    }
  } else {
    state.mutedRepos = state.mutedRepos.filter(r => r !== repoFullName);
    await trackRepoUnmuted(repoFullName);
  }

  await chrome.storage.sync.set({ mutedRepos: state.mutedRepos });

  if (renderCallback) renderCallback();

  if (mute) {
    notifications.info(`Muted notifications for ${repoFullName}`);
  } else {
    notifications.info(`Unmuted notifications for ${repoFullName}`);
  }
}

export async function trackRepoUnmuted(repoFullName) {
  try {
    const settings = await chrome.storage.sync.get(['unmutedRepos']);
    let unmutedRepos = settings.unmutedRepos || [];

    unmutedRepos = unmutedRepos.filter(r => r.repo !== repoFullName);

    unmutedRepos.push({
      repo: repoFullName,
      unmutedAt: new Date().toISOString()
    });

    if (unmutedRepos.length > 100) {
      unmutedRepos = unmutedRepos.slice(-100);
    }

    await chrome.storage.sync.set({ unmutedRepos });
  } catch (error) {
    console.error(`[DevWatch] Error tracking unmute for ${repoFullName}:`, error);
  }
}

export async function togglePinRepo(repoFullName, pin, state, renderCallback) {
  if (pin) {
    if (!state.pinnedRepos.includes(repoFullName)) {
      state.pinnedRepos.push(repoFullName);
    }
  } else {
    state.pinnedRepos = state.pinnedRepos.filter(r => r !== repoFullName);
  }

  await chrome.storage.sync.set({ pinnedRepos: state.pinnedRepos });

  if (renderCallback) renderCallback();

  if (pin) {
    notifications.info(`Pinned ${repoFullName} to the top`);
  } else {
    notifications.info(`Unpinned ${repoFullName}`);
  }
}
