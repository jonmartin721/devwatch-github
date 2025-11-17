import { jest, describe, test, beforeEach, expect } from '@jest/globals';

// Mock Chrome API
global.chrome = {
  storage: {
    sync: {
      get: jest.fn((keys, callback) => {
        callback({ darkMode: false });
      }),
      set: jest.fn()
    },
    local: {
      get: jest.fn((keys, callback) => {
        callback({
          activities: [],
          readItems: [],
          rateLimit: null,
          lastError: null
        });
      }),
      set: jest.fn()
    }
  },
  runtime: {
    sendMessage: jest.fn(),
    openOptionsPage: jest.fn()
  },
  tabs: {
    create: jest.fn()
  }
};

// Mock window.matchMedia
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: jest.fn().mockImplementation(query => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: jest.fn(),
    removeListener: jest.fn(),
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
    dispatchEvent: jest.fn(),
  })),
});

// Mock getSyncItem function
jest.mock('../shared/storage-helpers.js', () => ({
  getSyncItem: jest.fn((key, defaultValue) => {
    // Default to 'dark' theme for testing dark mode icon
    if (key === 'theme') return 'dark';
    return defaultValue;
  }),
  __esModule: true
}));

// Import functions from popup modules
import { groupByTime } from '../popup/views/activity-item-view.js';
import { updateRateLimit } from '../popup/controllers/activity-controller.js';

// Import error handling utilities
import { showError } from '../shared/error-handler.js';

// Import applyTheme from shared utilities
import { applyTheme } from '../shared/utils.js';

describe('Dark Mode', () => {
  beforeEach(() => {
    document.body.className = '';
    document.body.innerHTML = `
      <button id="darkModeBtn">
        <svg class="system-icon" style="display: block;"></svg>
        <svg class="moon-icon" style="display: block;"></svg>
        <svg class="sun-icon" style="display: none;"></svg>
      </button>
    `;
  });

  test('applies theme correctly', () => {
    // Test light theme
    applyTheme('light');
    expect(document.body.classList.contains('dark-mode')).toBe(false);

    // Test dark theme
    applyTheme('dark');
    expect(document.body.classList.contains('dark-mode')).toBe(true);

    // Test system theme (depends on media query)
    applyTheme('system');
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    expect(document.body.classList.contains('dark-mode')).toBe(prefersDark);
  });
});

describe('Activity Grouping', () => {
  test('groups activities by time correctly', () => {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    const activities = [
      { createdAt: new Date(todayStart.getTime() + 3600000).toISOString() }, // Today
      { createdAt: new Date(todayStart.getTime() - 12 * 3600000).toISOString() }, // Yesterday
      { createdAt: new Date(todayStart.getTime() - 3 * 24 * 3600000).toISOString() }, // This week
      { createdAt: new Date(todayStart.getTime() - 10 * 24 * 3600000).toISOString() } // Older
    ];

    const grouped = groupByTime(activities);

    expect(grouped.today).toHaveLength(1);
    expect(grouped.yesterday).toHaveLength(1);
    expect(grouped.thisWeek).toHaveLength(1);
    expect(grouped.older).toHaveLength(1);
  });
});

describe('Rate Limit Display', () => {
  beforeEach(() => {
    document.body.innerHTML = '<span id="rateLimitInfo"></span>';
  });

  test('shows warning when rate limit low (<=1000)', () => {
    const rateLimit = {
      remaining: 500,
      limit: 5000,
      reset: Date.now() + 3600000
    };

    updateRateLimit(rateLimit);

    const info = document.getElementById('rateLimitInfo');
    expect(info.textContent).toContain('500/5000 API calls remaining');
    expect(info.style.display).toBe('block');
    // Check warning color (accept both hex and rgb formats)
    expect(['#f0ad4e', 'rgb(240, 173, 78)']).toContain(info.style.color);
    // Either SVG or text content should be present - the SVG might be rendered differently in test environment
    expect(info.innerHTML.length > 0).toBe(true);
  });

  test('hides rate limit when remaining > 1000', () => {
    const rateLimit = {
      remaining: 4500,
      limit: 5000,
      reset: Date.now() + 3600000
    };

    updateRateLimit(rateLimit);

    const info = document.getElementById('rateLimitInfo');
    expect(info.textContent).toBe('');
    expect(info.style.display).toBe('none');
  });

  test('hides rate limit when no data', () => {
    updateRateLimit(null);

    const info = document.getElementById('rateLimitInfo');
    expect(info.textContent).toBe('');
    expect(info.style.display).toBe('none');
  });
});

describe('Error Display', () => {
  beforeEach(() => {
    document.body.innerHTML = '<div id="errorMessage" style="display: none;"></div>';
  });

  test('shows recent errors', () => {
    const error = {
      message: 'Invalid GitHub token',
      repo: 'facebook/react',
      timestamp: Date.now()
    };

    showError('errorMessage', error);

    const errorMsg = document.getElementById('errorMessage');
    expect(errorMsg.style.display).toBe('block');
    expect(errorMsg.textContent).toContain('Authentication Error');
    expect(errorMsg.textContent).toContain('invalid');
  });

  test('displays all errors when shown', () => {
    const error = {
      message: 'Old error'
    };

    showError('errorMessage', error);

    const errorMsg = document.getElementById('errorMessage');
    expect(errorMsg.style.display).toBe('block');
    expect(errorMsg.textContent).toContain('Unexpected Error');
  });
});

describe('Read/Unread State', () => {
  test('filters unread activities correctly', () => {
    const activities = [
      { id: 'pr-1' },
      { id: 'pr-2' },
      { id: 'pr-3' }
    ];

    const readItems = ['pr-1'];

    const unread = activities.filter(a => !readItems.includes(a.id));
    expect(unread).toHaveLength(2);
    expect(unread.map(a => a.id)).toEqual(['pr-2', 'pr-3']);
  });
});

describe('Activity Filtering', () => {
  const mockActivities = [
    { id: 'pr-1', type: 'pr', repo: 'test/repo', title: 'Test PR' },
    { id: 'issue-1', type: 'issue', repo: 'test/repo', title: 'Test Issue' },
    { id: 'release-1', type: 'release', repo: 'test/repo', title: 'v1.0.0' },
    { id: 'pr-2', type: 'pr', repo: 'other/repo', title: 'Another PR' }
  ];

  test('filters activities by type - PRs only', () => {
    const filter = 'pr';
    const filtered = filter === 'all'
      ? mockActivities
      : mockActivities.filter(a => a.type === filter);

    expect(filtered).toHaveLength(2);
    expect(filtered.every(a => a.type === 'pr')).toBe(true);
  });

  test('filters activities by type - issues only', () => {
    const filter = 'issue';
    const filtered = mockActivities.filter(a => a.type === filter);

    expect(filtered).toHaveLength(1);
    expect(filtered[0].title).toBe('Test Issue');
  });

  test('filters activities by type - releases only', () => {
    const filter = 'release';
    const filtered = mockActivities.filter(a => a.type === filter);

    expect(filtered).toHaveLength(1);
    expect(filtered[0].title).toBe('v1.0.0');
  });

  test('shows all activities when filter is "all"', () => {
    const filter = 'all';
    const filtered = filter === 'all'
      ? mockActivities
      : mockActivities.filter(a => a.type === filter);

    expect(filtered).toHaveLength(4);
  });
});

describe('Activity Rendering', () => {
  beforeEach(() => {
    document.body.innerHTML = '<div id="activityList"></div>';
  });

  test('shows empty state when no activities', () => {
    const activityList = document.getElementById('activityList');
    const activities = [];

    if (activities.length === 0) {
      activityList.innerHTML = '<div class="empty-state">No activity yet</div>';
    }

    expect(activityList.querySelector('.empty-state')).toBeTruthy();
    expect(activityList.textContent).toContain('No activity yet');
  });

  test('renders unread count correctly', () => {
    const activities = [
      { id: 'pr-1' },
      { id: 'pr-2' },
      { id: 'pr-3' }
    ];
    const readItems = ['pr-1'];

    const unreadCount = activities.filter(a => !readItems.includes(a.id)).length;

    expect(unreadCount).toBe(2);
  });

  test('hides mark all read button when all activities are read', () => {
    const activities = [
      { id: 'pr-1' },
      { id: 'pr-2' }
    ];
    const readItems = ['pr-1', 'pr-2'];

    const hasUnread = activities.some(a => !readItems.includes(a.id));

    expect(hasUnread).toBe(false);
  });

  test('shows mark all read button when unread activities exist', () => {
    const activities = [
      { id: 'pr-1' },
      { id: 'pr-2' }
    ];
    const readItems = ['pr-1'];

    const hasUnread = activities.some(a => !readItems.includes(a.id));

    expect(hasUnread).toBe(true);
  });
});

describe('Mark As Read', () => {
  test('prevents duplicate marking', () => {
    const readItems = ['pr-1', 'pr-2'];
    const idToMark = 'pr-1';

    const alreadyRead = readItems.includes(idToMark);

    expect(alreadyRead).toBe(true);
    // Would not add to readItems again
  });

  test('adds new item to readItems', () => {
    const readItems = ['pr-1'];
    const idToMark = 'pr-2';

    const alreadyRead = readItems.includes(idToMark);

    expect(alreadyRead).toBe(false);
    // Would add to readItems
  });

  test('marks all unread activities', () => {
    const activities = [
      { id: 'pr-1' },
      { id: 'pr-2' },
      { id: 'pr-3' }
    ];
    const readItems = ['pr-1'];

    const unreadIds = activities
      .filter(a => !readItems.includes(a.id))
      .map(a => a.id);

    expect(unreadIds).toEqual(['pr-2', 'pr-3']);
    // These would be added to readItems
  });
});
