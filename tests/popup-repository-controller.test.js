import { jest, describe, test, beforeEach, expect } from '@jest/globals';

const {
  toggleRepoCollapse,
  togglePinRepo,
  snoozeRepo,
  handleMarkAllRead
} = await import('../popup/controllers/repository-controller.js');

describe('Repository Controller', () => {
  beforeEach(() => {
    global.chrome = {
      storage: {
        local: {
          set: jest.fn(() => Promise.resolve())
        },
        sync: {
          get: jest.fn(() => Promise.resolve({ snoozeHours: 1, snoozedRepos: [], pinnedRepos: [] })),
          set: jest.fn(() => Promise.resolve())
        }
      },
      runtime: {
        sendMessage: jest.fn(() => Promise.resolve())
      }
    };
  });

  test('toggleRepoCollapse saves state', async () => {
    const collapsedRepos = new Set();
    const mockRender = jest.fn();

    await toggleRepoCollapse('owner/repo', collapsedRepos, mockRender);

    expect(chrome.storage.local.set).toHaveBeenCalled();
    expect(mockRender).toHaveBeenCalled();
  });

  test('togglePinRepo updates pinned repos', async () => {
    const pinnedRepos = [];
    const mockSetPinned = jest.fn();
    const mockRender = jest.fn();

    await togglePinRepo('owner/repo', pinnedRepos, mockSetPinned, mockRender);

    expect(chrome.storage.sync.set).toHaveBeenCalled();
    expect(mockSetPinned).toHaveBeenCalled();
  });

  test('snoozeRepo adds repo to snooze list', async () => {
    const mockLoad = jest.fn();

    await snoozeRepo('owner/repo', mockLoad);

    expect(chrome.storage.sync.set).toHaveBeenCalled();
    expect(mockLoad).toHaveBeenCalled();
  });

  test('handleMarkAllRead sends message to background', async () => {
    const mockRender = jest.fn();

    await handleMarkAllRead(mockRender);

    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({
      action: 'markAllAsRead'
    });
  });
});
