import { jest, describe, test, beforeEach, expect } from '@jest/globals';

// Mock state manager
let mockState = {
  readItems: [],
  allActivities: [],
  pinnedRepos: [],
  collapsedRepos: new Set()
};
const mockSetState = jest.fn((updates) => {
  mockState = { ...mockState, ...updates };
  return Promise.resolve();
});

jest.unstable_mockModule('../shared/state-manager.js', () => ({
  stateManager: {
    getFilteredActivities: jest.fn(() => mockState.allActivities)
  },
  useState: jest.fn(() => mockState),
  setState: mockSetState
}));

// Mock error handler
const mockShowError = jest.fn();
jest.unstable_mockModule('../shared/error-handler.js', () => ({
  showError: mockShowError
}));

// Mock feed presentation helpers
jest.unstable_mockModule('../shared/feed-presentation.js', () => ({
  groupByRepo: jest.fn((activities) => {
    const grouped = {};
    activities.forEach(a => {
      if (!grouped[a.repo]) grouped[a.repo] = [];
      grouped[a.repo].push(a);
    });
    return grouped;
  })
}));

const {
  toggleRepoCollapse,
  togglePinRepo,
  snoozeRepo,
  snoozeRepoWithAnimation,
  toggleReadState,
  markAsRead,
  markAsReadWithAnimation,
  handleMarkAllRead,
  handleCollapseAll,
  markRepoAsRead
} = await import('../popup/controllers/repository-controller.js');

describe('Repository Controller', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockState = {
      readItems: [],
      allActivities: [],
      pinnedRepos: [],
      collapsedRepos: new Set()
    };
    mockSetState.mockClear();
    mockShowError.mockClear();

    global.chrome = {
      storage: {
        local: {
          get: jest.fn(() => Promise.resolve({ activities: [], readItems: [] })),
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

  afterEach(() => {
    // Ensure real timers are always restored after each test
    // This prevents timer state leakage between tests
    jest.useRealTimers();
  });

  test('toggleRepoCollapse saves state', async () => {
    const collapsedRepos = new Set();
    const mockRender = jest.fn();

    await toggleRepoCollapse('owner/repo', collapsedRepos, mockRender);

    expect(mockState.collapsedRepos).toEqual(new Set(['owner/repo']));
    expect(mockRender).toHaveBeenCalled();
  });

  test('togglePinRepo updates pinned repos', async () => {
    const pinnedRepos = [];
    const mockSetPinned = jest.fn();
    const mockRender = jest.fn();

    await togglePinRepo('owner/repo', pinnedRepos, mockSetPinned, mockRender);

    expect(mockState.pinnedRepos).toEqual(['owner/repo']);
    expect(mockSetPinned).toHaveBeenCalled();
  });

  test('snoozeRepo adds repo to snooze list', async () => {
    const mockLoad = jest.fn();

    await snoozeRepo('owner/repo', mockLoad);

    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({
      action: 'snoozeRepo',
      repo: 'owner/repo'
    });
    expect(mockLoad).toHaveBeenCalled();
  });

  test('handleMarkAllRead sends message to background', async () => {
    mockState.allActivities = [{ id: '1', repo: 'owner/repo' }];
    const mockRender = jest.fn();

    await handleMarkAllRead(mockRender);

    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({
      action: 'markActivitiesAsRead',
      ids: ['1']
    });
  });

  describe('toggleReadState', () => {
    test('marks item as read when currently unread', async () => {
      mockState.readItems = [];
      const mockRender = jest.fn();

      await toggleReadState('test-id', mockRender);

      expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({
        action: 'markAsRead',
        id: 'test-id'
      });
      expect(mockRender).toHaveBeenCalled();
    });

    test('marks item as unread when currently read', async () => {
      mockState.readItems = ['test-id'];
      const mockRender = jest.fn();

      await toggleReadState('test-id', mockRender);

      expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({
        action: 'markAsUnread',
        id: 'test-id'
      });
      expect(mockRender).toHaveBeenCalled();
    });
  });

  describe('markAsRead', () => {
    test('marks item as read', async () => {
      mockState.readItems = [];

      await markAsRead('test-id');

      expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({
        action: 'markAsRead',
        id: 'test-id'
      });
    });

    test('does not mark item as read if already read', async () => {
      mockState.readItems = ['test-id'];

      await markAsRead('test-id');

      expect(chrome.runtime.sendMessage).not.toHaveBeenCalled();
    });
  });

  describe('markAsReadWithAnimation', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    test('adds removing class and marks as read after delay', async () => {
      mockState.readItems = [];
      const mockElement = {
        classList: {
          add: jest.fn()
        }
      };
      const mockRender = jest.fn();

      markAsReadWithAnimation('test-id', mockElement, mockRender);

      expect(mockElement.classList.add).toHaveBeenCalledWith('removing');

      // Fast-forward time and flush all promises
      await jest.runAllTimersAsync();

      expect(mockRender).toHaveBeenCalled();
    });
  });

  describe('snoozeRepoWithAnimation', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    test('adds removing class and snoozes after delay', async () => {
      const mockHeader = {
        classList: {
          add: jest.fn()
        }
      };
      const mockActivities = {
        classList: {
          add: jest.fn()
        }
      };
      const mockLoad = jest.fn();

      chrome.storage.sync.get = jest.fn(() => Promise.resolve({
        snoozeHours: 1,
        snoozedRepos: [],
        markReadOnSnooze: false
      }));

      snoozeRepoWithAnimation('owner/repo', mockHeader, mockActivities, mockLoad);

      expect(mockHeader.classList.add).toHaveBeenCalledWith('removing');
      expect(mockActivities.classList.add).toHaveBeenCalledWith('removing');

      // Fast-forward time and flush all promises
      await jest.runAllTimersAsync();

      expect(mockLoad).toHaveBeenCalled();
    });
  });

  describe('handleCollapseAll', () => {
    test('collapses all repos when some are expanded', async () => {
      mockState.allActivities = [
        { id: '1', repo: 'repo1' },
        { id: '2', repo: 'repo2' },
        { id: '3', repo: 'repo3' }
      ];

      const collapsedRepos = new Set(['repo1']);
      const mockRender = jest.fn();

      await handleCollapseAll(collapsedRepos, mockRender);

      expect(mockState.collapsedRepos.size).toBe(3);
      expect(mockState.collapsedRepos.has('repo1')).toBe(true);
      expect(mockState.collapsedRepos.has('repo2')).toBe(true);
      expect(mockState.collapsedRepos.has('repo3')).toBe(true);
      expect(mockRender).toHaveBeenCalled();
    });

    test('expands all repos when all are collapsed', async () => {
      mockState.allActivities = [
        { id: '1', repo: 'repo1' },
        { id: '2', repo: 'repo2' }
      ];

      const collapsedRepos = new Set(['repo1', 'repo2']);
      const mockRender = jest.fn();

      await handleCollapseAll(collapsedRepos, mockRender);

      expect(mockState.collapsedRepos.size).toBe(0);
      expect(mockRender).toHaveBeenCalled();
    });
  });

  describe('markRepoAsRead', () => {
    test('marks all unread items in repo as read', async () => {
      mockState.allActivities = [
        { id: '1', repo: 'owner/repo' },
        { id: '2', repo: 'owner/repo' },
        { id: '3', repo: 'other/repo' }
      ];
      mockState.readItems = [];

      const mockRender = jest.fn();

      await markRepoAsRead('owner/repo', mockRender);

      expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({
        action: 'markRepoAsRead',
        repo: 'owner/repo'
      });
      expect(mockRender).toHaveBeenCalled();
    });

    test('does nothing when all items in repo are already read', async () => {
      mockState.allActivities = [
        { id: '1', repo: 'owner/repo' },
        { id: '2', repo: 'owner/repo' }
      ];
      mockState.readItems = ['1', '2'];

      const mockRender = jest.fn();

      await markRepoAsRead('owner/repo', mockRender);

      expect(chrome.runtime.sendMessage).not.toHaveBeenCalled();
    });

    test('only marks unread items', async () => {
      mockState.allActivities = [
        { id: '1', repo: 'owner/repo' },
        { id: '2', repo: 'owner/repo' },
        { id: '3', repo: 'owner/repo' }
      ];
      mockState.readItems = ['2'];

      const mockRender = jest.fn();

      await markRepoAsRead('owner/repo', mockRender);

      expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({
        action: 'markRepoAsRead',
        repo: 'owner/repo'
      });
    });
  });

  describe('togglePinRepo - error handling', () => {
    test('handles errors when pinning', async () => {
      mockSetState.mockRejectedValueOnce(new Error('Storage error'));

      const pinnedRepos = [];
      const mockSetPinned = jest.fn();
      const mockRender = jest.fn();

      await togglePinRepo('owner/repo', pinnedRepos, mockSetPinned, mockRender);

      expect(mockShowError).toHaveBeenCalled();
      expect(mockSetPinned).not.toHaveBeenCalled();
    });

    test('unpins a pinned repo', async () => {
      const pinnedRepos = ['owner/repo'];
      const mockSetPinned = jest.fn();
      const mockRender = jest.fn();

      await togglePinRepo('owner/repo', pinnedRepos, mockSetPinned, mockRender);

      expect(mockState.pinnedRepos).toEqual([]);
      expect(mockSetPinned).toHaveBeenCalledWith([]);
    });
  });

  describe('toggleRepoCollapse - edge cases', () => {
    test('removes repo from set when already collapsed', async () => {
      const collapsedRepos = new Set(['owner/repo']);
      const mockRender = jest.fn();

      await toggleRepoCollapse('owner/repo', collapsedRepos, mockRender);

      expect(mockState.collapsedRepos.has('owner/repo')).toBe(false);
    });

    test('adds repo to set when not collapsed', async () => {
      const collapsedRepos = new Set();
      const mockRender = jest.fn();

      await toggleRepoCollapse('owner/repo', collapsedRepos, mockRender);

      expect(mockState.collapsedRepos.has('owner/repo')).toBe(true);
    });
  });
});
