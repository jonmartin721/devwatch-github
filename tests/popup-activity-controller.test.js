import { jest, describe, test, beforeEach, expect } from '@jest/globals';

const {
  handleRefresh,
  updateLastUpdated,
  updateRateLimit
} = await import('../popup/controllers/activity-controller.js');

describe('Activity Controller', () => {
  beforeEach(() => {
    document.body.innerHTML = `
      <div id="activityList"></div>
      <div id="lastUpdated"></div>
      <div id="rateLimitInfo"></div>
      <button id="refreshBtn"></button>
    `;

    global.chrome = {
      runtime: {
        sendMessage: jest.fn(() => Promise.resolve())
      }
    };
  });

  test('handleRefresh sends checkNow message', async () => {
    const mockLoad = jest.fn(() => Promise.resolve());

    await handleRefresh(mockLoad);

    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({
      action: 'checkNow'
    });
    expect(mockLoad).toHaveBeenCalled();
  });

  test('updateLastUpdated sets timestamp', () => {
    updateLastUpdated();

    const lastUpdated = document.getElementById('lastUpdated');
    expect(lastUpdated.textContent).toMatch(/Updated \d{1,2}:\d{2}/);
  });

  test('updateRateLimit shows warning when low', () => {
    const rateLimit = { remaining: 500, limit: 5000 };

    updateRateLimit(rateLimit);

    const info = document.getElementById('rateLimitInfo');
    expect(info.innerHTML).toContain('500/5000');
  });

  test('updateRateLimit hides when high', () => {
    const rateLimit = { remaining: 5000, limit: 5000 };

    updateRateLimit(rateLimit);

    const info = document.getElementById('rateLimitInfo');
    expect(info.style.display).toBe('none');
  });
});
