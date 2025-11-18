import { jest, describe, test, beforeEach, expect } from '@jest/globals';

// Mock NotificationManager
const mockNotifications = {
  success: jest.fn(),
  error: jest.fn(),
  info: jest.fn()
};

jest.unstable_mockModule('../shared/ui/notification-manager.js', () => ({
  NotificationManager: {
    getInstance: jest.fn(() => mockNotifications)
  }
}));

const { exportSettings, handleImportFile } = await import('../options/controllers/export-import-controller.js');

describe('export-import-controller', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    // Mock chrome.storage
    global.chrome = {
      storage: {
        sync: {
          get: jest.fn(),
          set: jest.fn(() => Promise.resolve())
        }
      },
      runtime: {
        sendMessage: jest.fn()
      }
    };

    // Mock URL.createObjectURL and revokeObjectURL
    global.URL.createObjectURL = jest.fn(() => 'blob:mock-url');
    global.URL.revokeObjectURL = jest.fn();

    // Mock Blob
    global.Blob = jest.fn((content, options) => ({
      content,
      type: options.type
    }));

    // Mock window.location.reload
    delete window.location;
    window.location = { reload: jest.fn() };

    // Reset document.body
    document.body.innerHTML = '';
  });

  describe('exportSettings', () => {
    test('exports all settings with default values', async () => {
      chrome.storage.sync.get.mockResolvedValueOnce({});

      await exportSettings();

      // Check that a blob was created
      expect(global.Blob).toHaveBeenCalled();
      expect(URL.createObjectURL).toHaveBeenCalled();
      expect(mockNotifications.success).toHaveBeenCalledWith('Settings exported successfully');
    });

    test('creates blob with correct content structure', async () => {
      const mockData = {
        watchedRepos: ['owner/repo1', 'owner/repo2'],
        mutedRepos: ['owner/muted'],
        pinnedRepos: ['owner/pinned'],
        filters: { prs: true, issues: false, releases: true },
        notifications: { prs: false, issues: true, releases: true },
        theme: 'dark',
        checkInterval: 30,
        snoozeHours: 2,
        snoozedRepos: ['owner/snoozed']
      };

      chrome.storage.sync.get.mockResolvedValueOnce(mockData);

      await exportSettings();

      const blobCall = global.Blob.mock.calls[0];
      const jsonString = blobCall[0][0];
      const exportData = JSON.parse(jsonString);

      expect(exportData.version).toBe('1.0.0');
      expect(exportData.exportedAt).toBeDefined();
      expect(exportData.settings.watchedRepos).toEqual(['owner/repo1', 'owner/repo2']);
      expect(exportData.settings.theme).toBe('dark');
      expect(exportData.settings.checkInterval).toBe(30);
    });

    test('uses default values for missing settings', async () => {
      chrome.storage.sync.get.mockResolvedValueOnce({
        watchedRepos: ['owner/repo1']
        // Other settings missing
      });

      await exportSettings();

      const blobCall = global.Blob.mock.calls[0];
      const jsonString = blobCall[0][0];
      const exportData = JSON.parse(jsonString);

      expect(exportData.settings.watchedRepos).toEqual(['owner/repo1']);
      expect(exportData.settings.mutedRepos).toEqual([]);
      expect(exportData.settings.filters).toEqual({ prs: true, issues: true, releases: true });
      expect(exportData.settings.theme).toBe('system');
      expect(exportData.settings.checkInterval).toBe(15);
      expect(exportData.settings.snoozeHours).toBe(1);
    });

    test('creates download link with current date', async () => {
      chrome.storage.sync.get.mockResolvedValueOnce({});

      const originalCreateElement = document.createElement.bind(document);
      let capturedLink;

      jest.spyOn(document, 'createElement').mockImplementation((tag) => {
        const element = originalCreateElement(tag);
        if (tag === 'a') {
          capturedLink = element;
        }
        return element;
      });

      const dateSpy = jest.spyOn(Date.prototype, 'toISOString')
        .mockReturnValue('2023-12-25T10:30:00.000Z');

      await exportSettings();

      expect(capturedLink.download).toContain('2023-12-25');

      dateSpy.mockRestore();
      document.createElement.mockRestore();
    });

    test('triggers download and cleans up', async () => {
      chrome.storage.sync.get.mockResolvedValueOnce({});

      const originalCreateElement = document.createElement.bind(document);
      let capturedLink;

      jest.spyOn(document, 'createElement').mockImplementation((tag) => {
        const element = originalCreateElement(tag);
        if (tag === 'a') {
          capturedLink = element;
          element.click = jest.fn();
        }
        return element;
      });

      await exportSettings();

      expect(capturedLink.click).toHaveBeenCalled();
      expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:mock-url');

      document.createElement.mockRestore();
    });

    test('shows success notification', async () => {
      chrome.storage.sync.get.mockResolvedValueOnce({});

      await exportSettings();

      expect(mockNotifications.success).toHaveBeenCalledWith('Settings exported successfully');
    });

    test('handles export errors', async () => {
      chrome.storage.sync.get.mockRejectedValueOnce(new Error('Storage error'));

      await exportSettings();

      expect(mockNotifications.error).toHaveBeenCalledWith('Failed to export settings');
    });

    test('handles JSON stringification errors', async () => {
      // Create a circular reference that JSON.stringify will fail on
      const circular = { a: 1 };
      circular.self = circular;

      chrome.storage.sync.get.mockResolvedValueOnce({
        watchedRepos: [circular]
      });

      await exportSettings();

      expect(mockNotifications.error).toHaveBeenCalledWith('Failed to export settings');
    });
  });

  describe('handleImportFile', () => {
    let mockEvent;
    let mockFile;

    beforeEach(() => {
      mockFile = {
        text: jest.fn()
      };

      mockEvent = {
        target: {
          files: [mockFile],
          value: 'fake-file-path'
        }
      };

      global.confirm = jest.fn(() => true);
    });

    test('does nothing if no file selected', async () => {
      mockEvent.target.files = [];

      await handleImportFile(mockEvent);

      expect(mockFile.text).not.toHaveBeenCalled();
      expect(chrome.storage.sync.set).not.toHaveBeenCalled();
    });

    test('imports valid settings file', async () => {
      const importData = {
        version: '1.0.0',
        exportedAt: '2023-12-25T10:00:00Z',
        settings: {
          watchedRepos: ['owner/repo1'],
          mutedRepos: ['owner/muted'],
          filters: { prs: true, issues: false, releases: true },
          theme: 'dark',
          checkInterval: 30
        }
      };

      mockFile.text.mockResolvedValueOnce(JSON.stringify(importData));

      await handleImportFile(mockEvent);

      expect(chrome.storage.sync.set).toHaveBeenCalledWith(
        expect.objectContaining({
          watchedRepos: ['owner/repo1'],
          mutedRepos: ['owner/muted'],
          theme: 'dark',
          checkInterval: 30
        })
      );
    });

    test('shows confirmation dialog before importing', async () => {
      const importData = {
        settings: {
          watchedRepos: ['owner/repo1']
        }
      };

      mockFile.text.mockResolvedValueOnce(JSON.stringify(importData));

      await handleImportFile(mockEvent);

      expect(confirm).toHaveBeenCalledWith(
        expect.stringContaining('This will replace your current settings')
      );
    });

    test('cancels import if user declines confirmation', async () => {
      global.confirm = jest.fn(() => false);

      const importData = {
        settings: {
          watchedRepos: ['owner/repo1']
        }
      };

      mockFile.text.mockResolvedValueOnce(JSON.stringify(importData));

      await handleImportFile(mockEvent);

      expect(chrome.storage.sync.set).not.toHaveBeenCalled();
      expect(mockNotifications.info).toHaveBeenCalledWith('Import cancelled');
      expect(mockEvent.target.value).toBe('');
    });

    test('uses default values for missing settings', async () => {
      const importData = {
        settings: {
          watchedRepos: ['owner/repo1']
          // Other settings missing
        }
      };

      mockFile.text.mockResolvedValueOnce(JSON.stringify(importData));

      await handleImportFile(mockEvent);

      const setCall = chrome.storage.sync.set.mock.calls[0][0];
      expect(setCall.mutedRepos).toEqual([]);
      expect(setCall.pinnedRepos).toEqual([]);
      expect(setCall.filters).toEqual({ prs: true, issues: true, releases: true });
      expect(setCall.theme).toBe('system');
      expect(setCall.checkInterval).toBe(15);
    });

    test('sends message to update check interval', async () => {
      const importData = {
        settings: {
          watchedRepos: [],
          checkInterval: 60
        }
      };

      mockFile.text.mockResolvedValueOnce(JSON.stringify(importData));

      await handleImportFile(mockEvent);

      expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({
        action: 'updateInterval',
        interval: 60
      });
    });

    test('calls loadSettingsCallback if provided', async () => {
      const loadSettingsCallback = jest.fn(() => Promise.resolve());

      const importData = {
        settings: {
          watchedRepos: []
        }
      };

      mockFile.text.mockResolvedValueOnce(JSON.stringify(importData));

      await handleImportFile(mockEvent, loadSettingsCallback);

      expect(loadSettingsCallback).toHaveBeenCalled();
    });

    test('shows success notification and reloads page', async () => {
      jest.useFakeTimers();

      const importData = {
        settings: {
          watchedRepos: []
        }
      };

      mockFile.text.mockResolvedValueOnce(JSON.stringify(importData));

      await handleImportFile(mockEvent);

      expect(mockNotifications.success).toHaveBeenCalledWith(
        expect.stringContaining('Settings imported successfully')
      );

      jest.advanceTimersByTime(1500);

      expect(window.location.reload).toHaveBeenCalled();

      jest.useRealTimers();
    });

    test('handles invalid JSON', async () => {
      mockFile.text.mockResolvedValueOnce('invalid json');

      await handleImportFile(mockEvent);

      expect(mockNotifications.error).toHaveBeenCalledWith(
        expect.stringContaining('Failed to import settings')
      );
      expect(mockEvent.target.value).toBe('');
    });

    test('handles missing settings property', async () => {
      const importData = {
        version: '1.0.0'
        // Missing settings property
      };

      mockFile.text.mockResolvedValueOnce(JSON.stringify(importData));

      await handleImportFile(mockEvent);

      expect(mockNotifications.error).toHaveBeenCalledWith(
        expect.stringContaining('Invalid settings file format')
      );
    });

    test('handles file read errors', async () => {
      mockFile.text.mockRejectedValueOnce(new Error('File read error'));

      await handleImportFile(mockEvent);

      expect(mockNotifications.error).toHaveBeenCalledWith(
        expect.stringContaining('Failed to import settings')
      );
      expect(mockEvent.target.value).toBe('');
    });

    test('handles storage errors', async () => {
      const importData = {
        settings: {
          watchedRepos: []
        }
      };

      mockFile.text.mockResolvedValueOnce(JSON.stringify(importData));
      chrome.storage.sync.set.mockRejectedValueOnce(new Error('Storage error'));

      await handleImportFile(mockEvent);

      expect(mockNotifications.error).toHaveBeenCalled();
      expect(mockEvent.target.value).toBe('');
    });

    test('clears file input value after successful import', async () => {
      const importData = {
        settings: {
          watchedRepos: []
        }
      };

      mockFile.text.mockResolvedValueOnce(JSON.stringify(importData));

      await handleImportFile(mockEvent);

      expect(mockEvent.target.value).toBe('');
    });

    test('clears file input value even after errors', async () => {
      mockFile.text.mockRejectedValueOnce(new Error('Test error'));

      await handleImportFile(mockEvent);

      expect(mockEvent.target.value).toBe('');
    });

    test('handles callback errors gracefully', async () => {
      const failingCallback = jest.fn(() => Promise.reject(new Error('Callback error')));

      const importData = {
        settings: {
          watchedRepos: []
        }
      };

      mockFile.text.mockResolvedValueOnce(JSON.stringify(importData));

      await handleImportFile(mockEvent, failingCallback);

      expect(mockNotifications.error).toHaveBeenCalled();
    });

    test('imports all settings properties correctly', async () => {
      const importData = {
        settings: {
          watchedRepos: ['owner/repo1', 'owner/repo2'],
          mutedRepos: ['owner/muted1'],
          pinnedRepos: ['owner/pinned1'],
          filters: { prs: false, issues: true, releases: false },
          notifications: { prs: true, issues: false, releases: true },
          theme: 'light',
          checkInterval: 45,
          snoozeHours: 3,
          snoozedRepos: ['owner/snoozed1']
        }
      };

      mockFile.text.mockResolvedValueOnce(JSON.stringify(importData));

      await handleImportFile(mockEvent);

      expect(chrome.storage.sync.set).toHaveBeenCalledWith({
        watchedRepos: ['owner/repo1', 'owner/repo2'],
        mutedRepos: ['owner/muted1'],
        pinnedRepos: ['owner/pinned1'],
        filters: { prs: false, issues: true, releases: false },
        notifications: { prs: true, issues: false, releases: true },
        theme: 'light',
        checkInterval: 45,
        snoozeHours: 3,
        snoozedRepos: ['owner/snoozed1']
      });
    });
  });

  describe('integration scenarios', () => {
    test('exported settings can be reimported', async () => {
      // First, export settings
      const originalSettings = {
        watchedRepos: ['owner/repo1'],
        mutedRepos: ['owner/muted'],
        filters: { prs: true, issues: false, releases: true },
        theme: 'dark',
        checkInterval: 30
      };

      chrome.storage.sync.get.mockResolvedValueOnce(originalSettings);

      await exportSettings();

      // Get the exported JSON
      const blobCall = global.Blob.mock.calls[0];
      const exportedJson = blobCall[0][0];

      // Now import it back
      const mockFile = {
        text: jest.fn(() => Promise.resolve(exportedJson))
      };

      const mockEvent = {
        target: {
          files: [mockFile],
          value: 'fake-path'
        }
      };

      global.confirm = jest.fn(() => true);

      await handleImportFile(mockEvent);

      // Verify the imported settings match the original
      const importedSettings = chrome.storage.sync.set.mock.calls[0][0];
      expect(importedSettings.watchedRepos).toEqual(originalSettings.watchedRepos);
      expect(importedSettings.mutedRepos).toEqual(originalSettings.mutedRepos);
      expect(importedSettings.theme).toBe(originalSettings.theme);
      expect(importedSettings.checkInterval).toBe(originalSettings.checkInterval);
    });
  });
});
