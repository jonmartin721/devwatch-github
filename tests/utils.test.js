import { jest, describe, test, expect } from '@jest/globals';

// Mock Chrome API
global.chrome = {
  storage: {
    sync: {
      get: jest.fn(),
      set: jest.fn()
    },
    local: {
      get: jest.fn(),
      set: jest.fn()
    }
  },
  runtime: {
    sendMessage: jest.fn()
  },
  tabs: {
    create: jest.fn()
  }
};

// Import functions from shared utilities
import { formatDate, applyTheme, applyColorTheme } from '../shared/utils.js';

describe('Date Formatting', () => {

  test('formats recent dates correctly', () => {
    const now = new Date();
    const fiveMinutesAgo = new Date(now - 5 * 60 * 1000);
    expect(formatDate(fiveMinutesAgo.toISOString())).toBe('5m ago');

    const twoHoursAgo = new Date(now - 2 * 60 * 60 * 1000);
    expect(formatDate(twoHoursAgo.toISOString())).toBe('2h ago');

    const threeDaysAgo = new Date(now - 3 * 24 * 60 * 60 * 1000);
    expect(formatDate(threeDaysAgo.toISOString())).toBe('3d ago');
  });

  test('formats old dates as locale string', () => {
    const tenDaysAgo = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000);
    const result = formatDate(tenDaysAgo.toISOString());
    expect(result).toBe(tenDaysAgo.toLocaleDateString());
  });
});

describe('Repository Validation', () => {
  test('validates correct repo format', () => {
    const validRepo = 'facebook/react';
    expect(validRepo.match(/^[\w-]+\/[\w-]+$/)).toBeTruthy();
  });

  test('rejects invalid repo format', () => {
    expect('invalid'.match(/^[\w-]+\/[\w-]+$/)).toBeFalsy();
    expect('too/many/slashes'.match(/^[\w-]+\/[\w-]+$/)).toBeFalsy();
    expect('no-slash'.match(/^[\w-]+\/[\w-]+$/)).toBeFalsy();
  });
});

describe('Activity Filtering', () => {
  const mockActivities = [
    { type: 'pr', repo: 'test/repo', title: 'Test PR' },
    { type: 'issue', repo: 'test/repo', title: 'Test Issue' },
    { type: 'release', repo: 'test/repo', title: 'v1.0.0' }
  ];

  test('filters activities by type', () => {
    const prs = mockActivities.filter(a => a.type === 'pr');
    expect(prs).toHaveLength(1);
    expect(prs[0].title).toBe('Test PR');

    const issues = mockActivities.filter(a => a.type === 'issue');
    expect(issues).toHaveLength(1);
    expect(issues[0].title).toBe('Test Issue');
  });

  test('returns all activities when no filter', () => {
    const all = mockActivities;
    expect(all).toHaveLength(3);
  });
});

describe('Color Theme Application', () => {
  beforeEach(() => {
    document.documentElement.className = '';
    document.documentElement.removeAttribute('data-color-theme');
    document.documentElement.style.colorScheme = '';
    document.body.className = '';
    document.body.removeAttribute('data-color-theme');
    window.matchMedia = jest.fn().mockReturnValue({
      matches: false,
      addEventListener: jest.fn(),
      removeEventListener: jest.fn()
    });
  });

  test('applies color theme via data attribute', () => {
    applyColorTheme('graphite');
    expect(document.body.getAttribute('data-color-theme')).toBe('graphite');
    expect(document.documentElement.getAttribute('data-color-theme')).toBe('graphite');
  });

  test('defaults to polar when called with null', () => {
    applyColorTheme(null);
    expect(document.body.getAttribute('data-color-theme')).toBe('polar');
  });

  test('defaults to polar when called with undefined', () => {
    applyColorTheme(undefined);
    expect(document.body.getAttribute('data-color-theme')).toBe('polar');
  });

  test('switches between themes', () => {
    applyColorTheme('nightfall');
    expect(document.body.getAttribute('data-color-theme')).toBe('nightfall');

    applyColorTheme('obsidian');
    expect(document.body.getAttribute('data-color-theme')).toBe('obsidian');
    expect(document.documentElement.getAttribute('data-color-theme')).toBe('obsidian');
  });

  test('applies dark mode to html and body when theme is dark', () => {
    applyTheme('dark');

    expect(document.body.classList.contains('dark-mode')).toBe(true);
    expect(document.documentElement.classList.contains('dark-mode')).toBe(true);
    expect(document.documentElement.style.colorScheme).toBe('dark');
  });

  test('follows system theme when theme is system', () => {
    window.matchMedia = jest.fn().mockReturnValue({
      matches: true,
      addEventListener: jest.fn(),
      removeEventListener: jest.fn()
    });

    applyTheme('system');

    expect(document.body.classList.contains('dark-mode')).toBe(true);
    expect(document.documentElement.classList.contains('dark-mode')).toBe(true);
    expect(document.documentElement.style.colorScheme).toBe('dark');
  });
});
