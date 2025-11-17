import { NotificationManager } from '../../shared/ui/notification-manager.js';

const notifications = NotificationManager.getInstance();

export async function exportSettings() {
  try {
    const syncData = await chrome.storage.sync.get(null);

    const exportData = {
      version: '1.0.0',
      exportedAt: new Date().toISOString(),
      settings: {
        watchedRepos: syncData.watchedRepos || [],
        mutedRepos: syncData.mutedRepos || [],
        pinnedRepos: syncData.pinnedRepos || [],
        filters: syncData.filters || { prs: true, issues: true, releases: true },
        notifications: syncData.notifications || { prs: true, issues: true, releases: true },
        theme: syncData.theme || 'system',
        checkInterval: syncData.checkInterval || 15,
        snoozeHours: syncData.snoozeHours || 1,
        snoozedRepos: syncData.snoozedRepos || []
      }
    };

    const jsonString = JSON.stringify(exportData, null, 2);
    const blob = new Blob([jsonString], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `github-devwatch-settings-${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    notifications.success('Settings exported successfully');
  } catch (error) {
    console.error('Export error:', error);
    notifications.error('Failed to export settings');
  }
}

export async function handleImportFile(event, loadSettingsCallback) {
  const file = event.target.files[0];
  if (!file) return;

  try {
    const text = await file.text();
    const importData = JSON.parse(text);

    if (!importData.settings) {
      throw new Error('Invalid settings file format');
    }

    const confirmed = confirm(
      'This will replace your current settings (except GitHub token). Continue?'
    );

    if (!confirmed) {
      event.target.value = '';
      notifications.info('Import cancelled');
      return;
    }

    const settings = importData.settings;
    await chrome.storage.sync.set({
      watchedRepos: settings.watchedRepos || [],
      mutedRepos: settings.mutedRepos || [],
      pinnedRepos: settings.pinnedRepos || [],
      filters: settings.filters || { prs: true, issues: true, releases: true },
      notifications: settings.notifications || { prs: true, issues: true, releases: true },
      theme: settings.theme || 'system',
      checkInterval: settings.checkInterval || 15,
      snoozeHours: settings.snoozeHours || 1,
      snoozedRepos: settings.snoozedRepos || []
    });

    if (settings.checkInterval) {
      chrome.runtime.sendMessage({
        action: 'updateInterval',
        interval: settings.checkInterval
      });
    }

    if (loadSettingsCallback) {
      await loadSettingsCallback();
    }

    notifications.success('Settings imported successfully - reloading page...');

    setTimeout(() => {
      window.location.reload();
    }, 1500);

  } catch (error) {
    console.error('Import error:', error);
    notifications.error('Failed to import settings: ' + error.message);
  } finally {
    event.target.value = '';
  }
}
