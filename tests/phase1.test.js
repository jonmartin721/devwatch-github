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

describe('Dark Mode', () => {
  beforeEach(() => {
    document.body.className = '';
    document.body.innerHTML = `
      <button id="darkModeBtn">
        <svg class="moon-icon"></svg>
        <svg class="sun-icon" style="display: none;"></svg>
      </button>
    `;
  });

  test('toggles dark mode class on body', () => {
    const fs = require('fs');
    const path = require('path');
    const popupJs = fs.readFileSync(
      path.join(__dirname, '../popup/popup.js'),
      'utf8'
    );
    eval(popupJs);

    expect(document.body.classList.contains('dark-mode')).toBe(false);
    toggleDarkMode();
    expect(document.body.classList.contains('dark-mode')).toBe(true);
    toggleDarkMode();
    expect(document.body.classList.contains('dark-mode')).toBe(false);
  });

  test('updates dark mode icon', () => {
    const fs = require('fs');
    const path = require('path');
    const popupJs = fs.readFileSync(
      path.join(__dirname, '../popup/popup.js'),
      'utf8'
    );
    eval(popupJs);

    const btn = document.getElementById('darkModeBtn');
    const moonIcon = btn.querySelector('.moon-icon');
    const sunIcon = btn.querySelector('.sun-icon');

    document.body.classList.add('dark-mode');
    updateDarkModeIcon();
    expect(moonIcon.style.display).toBe('none');
    expect(sunIcon.style.display).toBe('block');

    document.body.classList.remove('dark-mode');
    updateDarkModeIcon();
    expect(moonIcon.style.display).toBe('block');
    expect(sunIcon.style.display).toBe('none');
  });
});

describe('Activity Grouping', () => {
  test('groups activities by time correctly', () => {
    const fs = require('fs');
    const path = require('path');
    const popupJs = fs.readFileSync(
      path.join(__dirname, '../popup/popup.js'),
      'utf8'
    );
    eval(popupJs);

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

  test('shows warning when rate limit low', () => {
    const fs = require('fs');
    const path = require('path');
    const popupJs = fs.readFileSync(
      path.join(__dirname, '../popup/popup.js'),
      'utf8'
    );
    eval(popupJs);

    const rateLimit = {
      remaining: 500,
      limit: 5000,
      reset: Date.now() + 3600000
    };

    updateRateLimit(rateLimit);

    const info = document.getElementById('rateLimitInfo');
    expect(info.textContent).toContain('⚠️');
    expect(info.textContent).toContain('500/5000');
  });

  test('shows normal display when rate limit ok', () => {
    const fs = require('fs');
    const path = require('path');
    const popupJs = fs.readFileSync(
      path.join(__dirname, '../popup/popup.js'),
      'utf8'
    );
    eval(popupJs);

    const rateLimit = {
      remaining: 4500,
      limit: 5000,
      reset: Date.now() + 3600000
    };

    updateRateLimit(rateLimit);

    const info = document.getElementById('rateLimitInfo');
    expect(info.textContent).not.toContain('⚠️');
    expect(info.textContent).toContain('4500/5000');
  });

  test('hides rate limit when no data', () => {
    const fs = require('fs');
    const path = require('path');
    const popupJs = fs.readFileSync(
      path.join(__dirname, '../popup/popup.js'),
      'utf8'
    );
    eval(popupJs);

    updateRateLimit(null);

    const info = document.getElementById('rateLimitInfo');
    expect(info.textContent).toBe('');
  });
});

describe('Error Display', () => {
  beforeEach(() => {
    document.body.innerHTML = '<div id="errorMessage" style="display: none;"></div>';
  });

  test('shows recent errors', () => {
    const fs = require('fs');
    const path = require('path');
    const popupJs = fs.readFileSync(
      path.join(__dirname, '../popup/popup.js'),
      'utf8'
    );
    eval(popupJs);

    const error = {
      message: 'Invalid GitHub token',
      repo: 'facebook/react',
      timestamp: Date.now()
    };

    showError(error);

    const errorMsg = document.getElementById('errorMessage');
    expect(errorMsg.style.display).toBe('block');
    expect(errorMsg.textContent).toContain('Invalid GitHub token');
    expect(errorMsg.textContent).toContain('facebook/react');
  });

  test('hides old errors', () => {
    const fs = require('fs');
    const path = require('path');
    const popupJs = fs.readFileSync(
      path.join(__dirname, '../popup/popup.js'),
      'utf8'
    );
    eval(popupJs);

    const error = {
      message: 'Old error',
      timestamp: Date.now() - 120000 // 2 minutes ago
    };

    showError(error);

    const errorMsg = document.getElementById('errorMessage');
    expect(errorMsg.style.display).toBe('none');
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
