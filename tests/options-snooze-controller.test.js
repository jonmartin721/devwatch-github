import { jest, describe, test, beforeEach, expect } from '@jest/globals';

const { renderSnoozedRepos, unsnoozeRepo } = await import('../options/controllers/snooze-controller.js');

describe('Snooze Controller', () => {
  beforeEach(() => {
    document.body.innerHTML = '<div id="snoozedReposList"></div>';

    global.chrome = {
      storage: {
        sync: {
          get: jest.fn(() => Promise.resolve({ snoozedRepos: [] })),
          set: jest.fn(() => Promise.resolve())
        }
      }
    };
  });

  test('renderSnoozedRepos shows empty state', () => {
    renderSnoozedRepos([]);

    const container = document.getElementById('snoozedReposList');
    expect(container.innerHTML).toContain('No repositories are currently snoozed');
  });

  test('renderSnoozedRepos displays active snoozes', () => {
    const futureTime = Date.now() + (2 * 60 * 60 * 1000);
    const snoozedRepos = [
      { repo: 'owner/repo', expiresAt: futureTime }
    ];

    renderSnoozedRepos(snoozedRepos);

    const container = document.getElementById('snoozedReposList');
    expect(container.innerHTML).toContain('owner/repo');
  });

  test('renderSnoozedRepos filters expired snoozes', () => {
    const pastTime = Date.now() - (1 * 60 * 60 * 1000);
    const snoozedRepos = [
      { repo: 'owner/expired', expiresAt: pastTime }
    ];

    renderSnoozedRepos(snoozedRepos);

    const container = document.getElementById('snoozedReposList');
    expect(container.innerHTML).not.toContain('owner/expired');
  });

  test('unsnoozeRepo removes repo from list', async () => {
    await unsnoozeRepo('owner/repo');

    expect(chrome.storage.sync.set).toHaveBeenCalled();
  });
});
