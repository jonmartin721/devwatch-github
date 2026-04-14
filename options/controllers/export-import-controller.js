import { NotificationManager } from '../../shared/ui/notification-manager.js';
import { getSettings, setWatchedRepos, updateSettings } from '../../shared/storage-helpers.js';
import { normalizeSettings, pickSyncSettings } from '../../shared/settings-schema.js';

const notifications = NotificationManager.getInstance();

export async function exportSettings() {
  try {
    const settings = await getSettings();

    const exportData = {
      version: '1.0.0',
      exportedAt: new Date().toISOString(),
      settings: {
        watchedRepos: settings.watchedRepos,
        ...pickSyncSettings(settings)
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
      'This will replace your current settings (except your GitHub connection). Continue?'
    );

    if (!confirmed) {
      event.target.value = '';
      notifications.info('Import cancelled');
      return;
    }

    const settings = importData.settings;
    await setWatchedRepos(settings.watchedRepos || []);
    await updateSettings(normalizeSettings(settings));

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
