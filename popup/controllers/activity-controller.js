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

/**
 * Loads activities from storage or cache, handles offline mode
 * @param {Function} renderActivitiesCallback - Callback to render activities after loading
 * @param {Function} setPinnedReposCallback - Callback to update pinned repos
 * @param {Function} setCollapsedReposCallback - Callback to update collapsed repos
 * @param {Object} options - Loading options
 * @param {boolean} options.skipLoadingIndicator - Don't show loading state if true (for refresh)
 */
export async function loadActivities(
  renderActivitiesCallback,
  setPinnedReposCallback,
  setCollapsedReposCallback,
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

    // Update pinned repos through callback
    setPinnedReposCallback(pinnedRepos);

    // Load collapsed state through callback
    setCollapsedReposCallback(new Set(data.collapsedRepos || []));

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
  btn.disabled = true;
  btn.classList.add('spinning');

  try {
    clearError('errorMessage');
    await chrome.runtime.sendMessage({ action: 'checkNow' });
    // Pass skipLoadingIndicator to avoid clearing the existing feed
    await loadActivitiesCallback({ skipLoadingIndicator: true });
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
    rateLimitInfo.style.display = 'none';
    return;
  }

  // Show in yellow warning when low
  rateLimitInfo.innerHTML = `
    <svg class="svg-inline" width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
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
