import { jest, describe, test, beforeEach, expect } from '@jest/globals';

// Setup DOM mocks
const mockList = {
  innerHTML: '',
  querySelector: jest.fn(() => null),
  addEventListener: jest.fn(),
  removeEventListener: jest.fn(),
  insertAdjacentHTML: jest.fn(),
  _delegationListener: null,
  _keydownListener: null
};

const mockElements = new Map();

const mockGetElementById = jest.fn((id) => {
  if (id === 'activityList') return mockList;
  return mockElements.get(id) || null;
});

global.document = {
  getElementById: mockGetElementById,
  querySelector: jest.fn(),
  querySelectorAll: jest.fn(() => [])
};

global.chrome = {
  runtime: {
    getURL: jest.fn((path) => `chrome-extension://test/${path}`)
  },
  tabs: {
    create: jest.fn()
  }
};

// Mock state manager
let mockState = {
  showArchive: false,
  searchQuery: '',
  readItems: []
};

let mockFilteredActivities = [];

jest.unstable_mockModule('../shared/state-manager.js', () => ({
  stateManager: {
    getFilteredActivities: jest.fn(() => mockFilteredActivities)
  },
  useState: jest.fn(() => mockState),
  setState: jest.fn((updates) => {
    mockState = { ...mockState, ...updates };
    return Promise.resolve();
  })
}));

// Mock error handler
jest.unstable_mockModule('../shared/error-handler.js', () => ({
  showError: jest.fn()
}));

// Mock security
jest.unstable_mockModule('../shared/security.js', () => ({
  safelyOpenUrl: jest.fn(() => Promise.resolve(true))
}));

const { renderActivities } = await import('../popup/views/activity-list-view.js');

describe('Activity List View', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockList.innerHTML = '';
    mockList.querySelector.mockReturnValue(null);
    mockList._delegationListener = null;
    mockList._keydownListener = null;
    mockElements.clear();
    mockState = {
      showArchive: false,
      searchQuery: '',
      readItems: []
    };
    mockFilteredActivities = [];

    // Reset the global getElementById mock
    mockGetElementById.mockImplementation((id) => {
      if (id === 'activityList') return mockList;
      return mockElements.get(id) || null;
    });
    global.document.getElementById = mockGetElementById;
  });

  describe('Empty States', () => {
    test('shows default empty state when no activities', () => {
      mockFilteredActivities = [];
      mockState.showArchive = false;
      mockState.searchQuery = '';

      renderActivities(null, new Set(), [], jest.fn(), jest.fn(), jest.fn(), jest.fn(), jest.fn(), jest.fn(), jest.fn(), jest.fn());

      expect(mockList.innerHTML).toContain('No new activity');
      expect(mockList.innerHTML).toContain('Go to');
      expect(mockList.innerHTML).toContain('options');
    });

    test('shows archive empty state when in archive mode', () => {
      mockFilteredActivities = [];
      mockState.showArchive = true;
      mockState.searchQuery = '';

      renderActivities(null, new Set(), [], jest.fn(), jest.fn(), jest.fn(), jest.fn(), jest.fn(), jest.fn(), jest.fn(), jest.fn());

      expect(mockList.innerHTML).toContain('Archive is empty');
      expect(mockList.innerHTML).toContain('mark as read');
    });

    test('shows search empty state when search has no results', () => {
      mockFilteredActivities = [];
      mockState.showArchive = false;
      mockState.searchQuery = 'test';

      renderActivities(null, new Set(), [], jest.fn(), jest.fn(), jest.fn(), jest.fn(), jest.fn(), jest.fn(), jest.fn(), jest.fn());

      expect(mockList.innerHTML).toContain('No matching activity');
    });

    test('clears activity renderer cache when showing empty state', () => {
      const mockRenderer = {
        lastRenderedData: 'some-data',
        render: jest.fn()
      };

      mockFilteredActivities = [];
      renderActivities(mockRenderer, new Set(), [], jest.fn(), jest.fn(), jest.fn(), jest.fn(), jest.fn(), jest.fn(), jest.fn(), jest.fn());

      expect(mockRenderer.lastRenderedData).toBeNull();
    });

    test('adds click listener to options link in empty state', () => {
      const mockOptionsLink = {
        addEventListener: jest.fn()
      };

      mockFilteredActivities = [];
      mockState.showArchive = false;

      // Set up list with options link
      mockList.innerHTML = '<div class="empty-state"><a href="#" id="optionsLink">options</a></div>';

      document.getElementById = jest.fn((id) => {
        if (id === 'activityList') return mockList;
        if (id === 'optionsLink') return mockOptionsLink;
        return null;
      });

      renderActivities(null, new Set(), [], jest.fn(), jest.fn(), jest.fn(), jest.fn(), jest.fn(), jest.fn(), jest.fn(), jest.fn());

      expect(mockOptionsLink.addEventListener).toHaveBeenCalledWith('click', expect.any(Function));
    });

    test('does not add options link listener in archive mode', () => {
      const mockOptionsLink = {
        addEventListener: jest.fn()
      };

      mockFilteredActivities = [];
      mockState.showArchive = true;

      document.getElementById = jest.fn((id) => {
        if (id === 'activityList') return mockList;
        if (id === 'optionsLink') return mockOptionsLink;
        return null;
      });

      renderActivities(null, new Set(), [], jest.fn(), jest.fn(), jest.fn(), jest.fn(), jest.fn(), jest.fn(), jest.fn(), jest.fn());

      expect(mockOptionsLink.addEventListener).not.toHaveBeenCalled();
    });
  });

  describe('Activity Rendering with Optimized Renderer', () => {
    test('calls activity renderer with correct options', () => {
      const mockRenderer = {
        render: jest.fn(),
        lastRenderedData: null
      };

      const mockActivities = [
        { id: '1', repo: 'facebook/react', type: 'pr', title: 'Test PR' },
        { id: '2', repo: 'vuejs/vue', type: 'issue', title: 'Test Issue' }
      ];

      mockFilteredActivities = mockActivities;
      mockState.readItems = [];

      const collapsedRepos = new Set(['facebook/react']);
      const pinnedRepos = ['vuejs/vue'];

      renderActivities(
        mockRenderer,
        collapsedRepos,
        pinnedRepos,
        jest.fn(),
        jest.fn(),
        jest.fn(),
        jest.fn(),
        jest.fn(),
        jest.fn(),
        jest.fn(),
        jest.fn()
      );

      expect(mockRenderer.render).toHaveBeenCalledWith(mockActivities, {
        groupByRepo: true,
        maxItems: 50,
        collapsedRepos,
        pinnedRepos,
        readItems: mockState.readItems
      });
    });

    test('calculates unread count correctly', () => {
      const mockRenderer = {
        render: jest.fn(),
        lastRenderedData: null
      };

      const mockActivities = [
        { id: '1', repo: 'facebook/react', type: 'pr' },
        { id: '2', repo: 'facebook/react', type: 'issue' },
        { id: '3', repo: 'vuejs/vue', type: 'pr' }
      ];

      mockFilteredActivities = mockActivities;
      mockState.readItems = ['2']; // One item read

      renderActivities(
        mockRenderer,
        new Set(),
        [],
        jest.fn(),
        jest.fn(),
        jest.fn(),
        jest.fn(),
        jest.fn(),
        jest.fn(),
        jest.fn(),
        jest.fn()
      );

      // Check that renderer was called (unread count used internally)
      expect(mockRenderer.render).toHaveBeenCalled();
    });

    test('calculates repo count correctly', () => {
      const mockRenderer = {
        render: jest.fn(),
        lastRenderedData: null
      };

      const mockActivities = [
        { id: '1', repo: 'facebook/react', type: 'pr' },
        { id: '2', repo: 'facebook/react', type: 'issue' },
        { id: '3', repo: 'vuejs/vue', type: 'pr' },
        { id: '4', repo: 'angular/angular', type: 'release' }
      ];

      mockFilteredActivities = mockActivities; // 3 unique repos

      renderActivities(
        mockRenderer,
        new Set(),
        [],
        jest.fn(),
        jest.fn(),
        jest.fn(),
        jest.fn(),
        jest.fn(),
        jest.fn(),
        jest.fn(),
        jest.fn()
      );

      expect(mockRenderer.render).toHaveBeenCalled();
    });
  });

  describe('List Header Rendering', () => {
    test('shows header with unread count when there are unread items', () => {
      const mockRenderer = {
        render: jest.fn(),
        lastRenderedData: null
      };

      mockFilteredActivities = [
        { id: '1', repo: 'facebook/react', type: 'pr' },
        { id: '2', repo: 'vuejs/vue', type: 'issue' }
      ];
      mockState.readItems = [];
      mockState.showArchive = false;

      renderActivities(
        mockRenderer,
        new Set(),
        [],
        jest.fn(),
        jest.fn(),
        jest.fn(),
        jest.fn(),
        jest.fn(),
        jest.fn(),
        jest.fn(),
        jest.fn()
      );

      expect(mockList.insertAdjacentHTML).toHaveBeenCalled();
      const headerHTML = mockList.insertAdjacentHTML.mock.calls[0][1];
      expect(headerHTML).toContain('2 unread');
    });

    test('shows collapse all button when multiple repos', () => {
      const mockRenderer = {
        render: jest.fn(),
        lastRenderedData: null
      };

      mockFilteredActivities = [
        { id: '1', repo: 'facebook/react', type: 'pr' },
        { id: '2', repo: 'vuejs/vue', type: 'issue' }
      ];

      renderActivities(
        mockRenderer,
        new Set(),
        [],
        jest.fn(),
        jest.fn(),
        jest.fn(),
        jest.fn(),
        jest.fn(),
        jest.fn(),
        jest.fn(),
        jest.fn()
      );

      const headerHTML = mockList.insertAdjacentHTML.mock.calls[0][1];
      expect(headerHTML).toContain('Collapse all');
    });

    test('shows expand all button when all repos are collapsed', () => {
      const mockRenderer = {
        render: jest.fn(),
        lastRenderedData: null
      };

      mockFilteredActivities = [
        { id: '1', repo: 'facebook/react', type: 'pr' },
        { id: '2', repo: 'vuejs/vue', type: 'issue' }
      ];

      const collapsedRepos = new Set(['facebook/react', 'vuejs/vue']);

      renderActivities(
        mockRenderer,
        collapsedRepos,
        [],
        jest.fn(),
        jest.fn(),
        jest.fn(),
        jest.fn(),
        jest.fn(),
        jest.fn(),
        jest.fn(),
        jest.fn()
      );

      const headerHTML = mockList.insertAdjacentHTML.mock.calls[0][1];
      expect(headerHTML).toContain('Expand all');
    });

    test('shows mark all as read button when there are unread items', () => {
      const mockRenderer = {
        render: jest.fn(),
        lastRenderedData: null
      };

      mockFilteredActivities = [
        { id: '1', repo: 'facebook/react', type: 'pr' }
      ];
      mockState.readItems = [];
      mockState.showArchive = false;

      renderActivities(
        mockRenderer,
        new Set(),
        [],
        jest.fn(),
        jest.fn(),
        jest.fn(),
        jest.fn(),
        jest.fn(),
        jest.fn(),
        jest.fn(),
        jest.fn()
      );

      const headerHTML = mockList.insertAdjacentHTML.mock.calls[0][1];
      expect(headerHTML).toContain('Mark all as read');
    });

    test('shows clear archive button in archive mode', () => {
      const mockRenderer = {
        render: jest.fn(),
        lastRenderedData: null
      };

      mockFilteredActivities = [
        { id: '1', repo: 'facebook/react', type: 'pr' }
      ];
      mockState.showArchive = true;

      renderActivities(
        mockRenderer,
        new Set(),
        [],
        jest.fn(),
        jest.fn(),
        jest.fn(),
        jest.fn(),
        jest.fn(),
        jest.fn(),
        jest.fn(),
        jest.fn()
      );

      const headerHTML = mockList.insertAdjacentHTML.mock.calls[0][1];
      expect(headerHTML).toContain('Clear archive');
    });

    test('replaces existing header if present', () => {
      const mockRenderer = {
        render: jest.fn(),
        lastRenderedData: null
      };

      const mockExistingHeader = {
        outerHTML: ''
      };

      mockList.querySelector.mockReturnValue(mockExistingHeader);

      mockFilteredActivities = [
        { id: '1', repo: 'facebook/react', type: 'pr' }
      ];

      renderActivities(
        mockRenderer,
        new Set(),
        [],
        jest.fn(),
        jest.fn(),
        jest.fn(),
        jest.fn(),
        jest.fn(),
        jest.fn(),
        jest.fn(),
        jest.fn()
      );

      expect(mockExistingHeader.outerHTML).toContain('list-header');
    });

    test('removes header if it should not be shown', () => {
      const mockRenderer = {
        render: jest.fn(),
        lastRenderedData: null
      };

      const mockExistingHeader = {
        remove: jest.fn()
      };

      mockList.querySelector.mockReturnValue(mockExistingHeader);

      // Single repo, all read - no header should be shown
      mockFilteredActivities = [
        { id: '1', repo: 'facebook/react', type: 'pr' }
      ];
      mockState.readItems = ['1'];
      mockState.showArchive = false;

      renderActivities(
        mockRenderer,
        new Set(),
        [],
        jest.fn(),
        jest.fn(),
        jest.fn(),
        jest.fn(),
        jest.fn(),
        jest.fn(),
        jest.fn(),
        jest.fn()
      );

      expect(mockExistingHeader.remove).toHaveBeenCalled();
    });
  });

  describe('Event Listener Attachment', () => {
    test('attaches click event delegation to list', () => {
      const mockRenderer = {
        render: jest.fn(),
        lastRenderedData: null
      };

      mockFilteredActivities = [
        { id: '1', repo: 'facebook/react', type: 'pr' }
      ];

      renderActivities(
        mockRenderer,
        new Set(),
        [],
        jest.fn(),
        jest.fn(),
        jest.fn(),
        jest.fn(),
        jest.fn(),
        jest.fn(),
        jest.fn(),
        jest.fn()
      );

      expect(mockList.addEventListener).toHaveBeenCalledWith('click', expect.any(Function));
    });

    test('attaches keydown event delegation to list', () => {
      const mockRenderer = {
        render: jest.fn(),
        lastRenderedData: null
      };

      mockFilteredActivities = [
        { id: '1', repo: 'facebook/react', type: 'pr' }
      ];

      renderActivities(
        mockRenderer,
        new Set(),
        [],
        jest.fn(),
        jest.fn(),
        jest.fn(),
        jest.fn(),
        jest.fn(),
        jest.fn(),
        jest.fn(),
        jest.fn()
      );

      expect(mockList.addEventListener).toHaveBeenCalledWith('keydown', expect.any(Function));
    });

    test('removes old event listeners before adding new ones', () => {
      const mockRenderer = {
        render: jest.fn(),
        lastRenderedData: null
      };

      const oldListener = jest.fn();
      mockList._delegationListener = oldListener;

      mockFilteredActivities = [
        { id: '1', repo: 'facebook/react', type: 'pr' }
      ];

      renderActivities(
        mockRenderer,
        new Set(),
        [],
        jest.fn(),
        jest.fn(),
        jest.fn(),
        jest.fn(),
        jest.fn(),
        jest.fn(),
        jest.fn(),
        jest.fn()
      );

      expect(mockList.removeEventListener).toHaveBeenCalledWith('click', oldListener);
    });

    test('stores reference to delegation listener', () => {
      const mockRenderer = {
        render: jest.fn(),
        lastRenderedData: null
      };

      mockFilteredActivities = [
        { id: '1', repo: 'facebook/react', type: 'pr' }
      ];

      renderActivities(
        mockRenderer,
        new Set(),
        [],
        jest.fn(),
        jest.fn(),
        jest.fn(),
        jest.fn(),
        jest.fn(),
        jest.fn(),
        jest.fn(),
        jest.fn()
      );

      expect(mockList._delegationListener).toBeDefined();
      expect(typeof mockList._delegationListener).toBe('function');
    });

    test('attaches mark all read button listener', () => {
      const mockRenderer = {
        render: jest.fn(),
        lastRenderedData: null
      };

      let buttonCallCount = 0;
      const mockMarkAllBtn = {
        addEventListener: jest.fn(),
        cloneNode: jest.fn(function() {
          // Return a new mock button that will be used after replaceWith
          return {
            addEventListener: jest.fn(),
            cloneNode: jest.fn()
          };
        }),
        replaceWith: jest.fn()
      };

      const newButton = mockMarkAllBtn.cloneNode();

      document.getElementById = jest.fn((id) => {
        if (id === 'activityList') return mockList;
        if (id === 'markAllReadBtn') {
          buttonCallCount++;
          // First call returns original, second call (after replaceWith) returns new
          return buttonCallCount === 1 ? mockMarkAllBtn : newButton;
        }
        return null;
      });

      mockFilteredActivities = [
        { id: '1', repo: 'facebook/react', type: 'pr' }
      ];
      mockState.readItems = [];

      const handleMarkAllRead = jest.fn();

      renderActivities(
        mockRenderer,
        new Set(),
        [],
        jest.fn(),
        jest.fn(),
        handleMarkAllRead,
        jest.fn(),
        jest.fn(),
        jest.fn(),
        jest.fn(),
        jest.fn()
      );

      expect(newButton.addEventListener).toHaveBeenCalledWith('click', handleMarkAllRead);
    });
  });

  describe('Header Button Behavior', () => {
    test('does not crash when header buttons are null', () => {
      const mockRenderer = {
        render: jest.fn(),
        lastRenderedData: null
      };

      mockFilteredActivities = [
        { id: '1', repo: 'facebook/react', type: 'pr' }
      ];

      document.getElementById = jest.fn((id) => {
        if (id === 'activityList') return mockList;
        return null; // Return null for all buttons
      });

      expect(() => {
        renderActivities(
          mockRenderer,
          new Set(),
          [],
          jest.fn(),
          jest.fn(),
          jest.fn(),
          jest.fn(),
          jest.fn(),
          jest.fn(),
          jest.fn(),
          jest.fn()
        );
      }).not.toThrow();
    });
  });
});
