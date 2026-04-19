import { getSyncItem, getFilteringSettings } from '../../shared/storage-helpers.js';
import { getExcludedRepos } from '../../shared/storage-helpers.js';
import { showError, clearError } from '../../shared/error-handler.js';
import {
  isOffline,
  showOfflineStatus,
  getCachedData,
  cacheForOffline,
  showCachedActivities
} from '../../shared/offline-manager.js';
import { setState } from '../../shared/state-manager.js';
import { filterVisibleActivities } from '../../shared/feed-policy.js';

const MIN_REFRESH_SPIN_MS = 500;

/**
 * Loads activities from storage or cache, handles offline mode
 * @param {Function} renderActivitiesCallback - Callback to render activities after loading
 * @param {Object} options - Loading options
 * @param {boolean} options.skipLoadingIndicator - Don't show loading state if true (for refresh)
 */
export async function loadActivities(
  renderActivitiesCallback,
  options = {}
) {
  const { skipLoadingIndicator = false } = options;
  const list = document.getElementById('activityList');

  // Check offline status first
  if (isOffline()) {
    if (!skipLoadingIndicator) {
      list.innerHTML = '<div class="loading" role="status" aria-live="polite">Loading cached data...</div>';
    }
    showOfflineStatus('errorMessage', true);

    try {
      const cachedActivities = await getCachedData('activities_cache');
      const cachedReadItems = await getCachedData('readItems_cache');
      const { mutedRepos, snoozedRepos, pinnedRepos } = await getFilteringSettings();

      if (cachedActivities) {
        const excludedRepos = getExcludedRepos(mutedRepos, snoozedRepos);
        const filteredActivities = filterVisibleActivities(cachedActivities, { excludedRepos });

        // Update state with cached data
        await setState({
          allActivities: filteredActivities,
          readItems: cachedReadItems || [],
          pinnedRepos,
          collapsedRepos: new Set()
        }, { persist: false }); // Don't persist cached data to storage

        // Show cached indicator
        showCachedActivities(filteredActivities);
        renderActivitiesCallback();
        return;
      } else {
        if (!skipLoadingIndicator) {
          list.innerHTML = `
            <div class="empty-state">
              <div class="offline-empty">
                <div class="offline-icon">📡</div>
                <p>No cached data available</p>
                <small>Check your connection and try again</small>
              </div>
            </div>
          `;
        }
        return;
      }
    } catch (error) {
      if (!skipLoadingIndicator) {
        list.innerHTML = '<div class="empty-state"><p>Unable to load cached data</p></div>';
      }
      showError('errorMessage', error, null, { action: 'load cached activities' }, 0);
      return;
    }
  }

  // Online mode - proceed normally
  if (!skipLoadingIndicator) {
    list.innerHTML = '<div class="loading" role="status" aria-live="polite">Loading...</div>';
  }
  showOfflineStatus('errorMessage', false);
  clearError('errorMessage');

  try {
    const data = await chrome.storage.local.get(['activities', 'readItems', 'rateLimit', 'lastError', 'collapsedRepos']);
    const settings = await getFilteringSettings();
    const pinnedRepos = await getSyncItem('pinnedRepos', []);

    const excludedRepos = getExcludedRepos(settings.mutedRepos, settings.snoozedRepos);
    const filteredActivities = filterVisibleActivities(data.activities || [], { excludedRepos });

    // Update state manager with loaded data
    await setState({
      allActivities: filteredActivities,
      readItems: data.readItems || [],
      pinnedRepos,
      collapsedRepos: new Set(data.collapsedRepos || [])
    });

    // Cache the loaded data for offline use
    await cacheForOffline('activities_cache', filteredActivities, 3600000); // 1 hour
    await cacheForOffline('readItems_cache', data.readItems || [], 3600000);

    renderActivitiesCallback();
    updateRateLimit(data.rateLimit);
    await updateLastUpdated();
    if (data.lastError) {
      showStoredError(data.lastError);
    }
  } catch (error) {
    if (!skipLoadingIndicator) {
      list.innerHTML = '<div class="empty-state"><p>Unable to load activities</p></div>';
    }
    showError('errorMessage', error, null, { action: 'load activities' }, 0);
  }
}

/**
 * Handles manual refresh button click
 * @param {Function} loadActivitiesCallback - Callback to load activities after refresh
 */
export async function handleRefresh(loadActivitiesCallback) {
  const btn = document.getElementById('refreshBtn');
  const refreshStartedAt = Date.now();
  let refreshSucceeded = false;

  btn.disabled = true;
  btn.classList.remove('refresh-complete');
  btn.classList.add('spinning');

  try {
    clearError('errorMessage');
    await chrome.runtime.sendMessage({ action: 'checkNow' });
    // Pass skipLoadingIndicator to avoid clearing the existing feed
    await loadActivitiesCallback({ skipLoadingIndicator: true });
    refreshSucceeded = true;
  } catch (error) {
    showError('errorMessage', error, null, { action: 'refresh activities' }, 5000);
  } finally {
    const elapsed = Date.now() - refreshStartedAt;
    if (elapsed < MIN_REFRESH_SPIN_MS) {
      await new Promise(resolve => setTimeout(resolve, MIN_REFRESH_SPIN_MS - elapsed));
    }

    btn.disabled = false;
    btn.classList.remove('spinning');

    if (refreshSucceeded) {
      btn.classList.add('refresh-complete');
      setTimeout(() => {
        btn.classList.remove('refresh-complete');
      }, 400);
    }
  }
}

/**
 * Updates the "last updated" timestamp in the footer
 */
export async function updateLastUpdated() {
  const { lastCheck } = await chrome.storage.sync.get(['lastCheck']);

  if (!lastCheck) {
    document.getElementById('lastUpdated').textContent = 'Never updated';
    return;
  }

  const lastCheckDate = new Date(lastCheck);
  const timeString = lastCheckDate.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  document.getElementById('lastUpdated').textContent = `Updated ${timeString}`;
}

/**
 * Updates the rate limit display in the footer
 * Only shows when remaining API calls are low (<= 1000)
 */
export function updateRateLimit(rateLimit) {
  const rateLimitInfo = document.getElementById('rateLimitInfo');

  // Only show rate limit when remaining <= 1000
  if (!rateLimit || rateLimit.remaining > 1000) {
    rateLimitInfo.textContent = '';
    rateLimitInfo.classList.add('hidden');
    rateLimitInfo.classList.remove('warning');
    return;
  }

  // Show in yellow warning when low
  rateLimitInfo.innerHTML = `
    <svg class="svg-inline" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><path d="M12 9v4"/><path d="M12 17h.01"/>
    </svg>
    ${rateLimit.remaining}/${rateLimit.limit} API calls remaining
  `;
  rateLimitInfo.classList.add('warning');
  rateLimitInfo.classList.remove('hidden');

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

/**
 * Shows stored error from previous API call if still recent
 */
export function showStoredError(lastError) {
  if (!lastError || Date.now() - lastError.timestamp > 60000) {
    clearError('errorMessage');
    return;
  }

  // Use the enhanced error notification system with sanitized error message
  const error = new Error(lastError.message);
  const context = lastError.repo ? { repo: lastError.repo } : {};
  showError('errorMessage', error, null, context, 10000);
}
