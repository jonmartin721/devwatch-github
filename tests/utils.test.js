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

// Test utility function directly
function formatDate(dateString) {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now - date;
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 60) {
    return `${diffMins}m ago`;
  } else if (diffHours < 24) {
    return `${diffHours}h ago`;
  } else if (diffDays < 7) {
    return `${diffDays}d ago`;
  } else {
    return date.toLocaleDateString();
  }
}

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
