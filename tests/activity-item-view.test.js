import { beforeEach, describe, expect, jest, test } from '@jest/globals';

const mockUseState = jest.fn();
const mockFormatDate = jest.fn();

jest.unstable_mockModule('../shared/state-manager.js', () => ({
  useState: mockUseState
}));

jest.unstable_mockModule('../shared/utils.js', () => ({
  formatDate: mockFormatDate
}));

const { renderActivityItem } = await import('../popup/views/activity-item-view.js');

describe('activity-item-view', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseState.mockReturnValue({ readItems: [] });
    mockFormatDate.mockImplementation((value) => `formatted:${value}`);
  });

  test('renders unread activities with type label, relative time, and mark-read action', () => {
    const html = renderActivityItem({
      id: 'pr-1',
      type: 'pr',
      title: 'Improve cache handling',
      author: 'octocat',
      repo: 'facebook/react',
      url: 'https://github.com/facebook/react/pull/1',
      authorAvatar: 'https://avatars.githubusercontent.com/u/1?v=4',
      createdAt: new Date(Date.now() - (5 * 60 * 1000)).toISOString()
    });

    expect(html).toContain('activity-item unread');
    expect(html).toContain('>PR<');
    expect(html).toContain('title="Pull Request"');
    expect(html).toContain('aria-label="Open Pull Request: Improve cache handling by octocat"');
    expect(html).toContain('5m ago');
    expect(html).toContain('data-action="mark-read"');
    expect(html).toContain('src="https://avatars.githubusercontent.com/u/1?v=4"');
  });

  test('renders read activities without the mark-read button', () => {
    mockUseState.mockReturnValue({ readItems: ['issue-2'] });

    const html = renderActivityItem({
      id: 'issue-2',
      type: 'issue',
      title: 'Bug report',
      author: 'hubot',
      repo: 'vuejs/core',
      url: 'https://github.com/vuejs/core/issues/2',
      authorAvatar: 'https://github.com/images/error/octocat_happy.gif',
      createdAt: new Date().toISOString()
    });

    expect(html).toContain('activity-item read');
    expect(html).toContain('>Issue<');
    expect(html).not.toContain('mark-read-btn');
  });

  test('sanitizes HTML content and rejects unsafe avatar urls', () => {
    const html = renderActivityItem({
      id: 'release-3',
      type: 'release',
      title: '<script>alert(1)</script>',
      author: 'mallory<img src=x onerror=alert(1)>',
      repo: 'evil/repo"><svg onload=alert(1)>',
      url: 'https://github.com/evil/repo/releases/tag/v1',
      authorAvatar: 'javascript:alert(1)',
      createdAt: new Date().toISOString()
    });

    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(html).toContain('mallory&lt;img src=x onerror=alert(1)&gt;');
    expect(html).toContain('evil/repo&quot;&gt;&lt;svg onload=alert(1)&gt;');
    expect(html).toContain('src=""');
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).not.toContain('javascript:alert(1)');
  });

  test('falls back to formatted dates when relative time cannot be derived', () => {
    const html = renderActivityItem({
      id: 'custom-4',
      type: 'PushEvent',
      title: 'Push event',
      author: 'alice',
      repo: 'org/repo',
      url: 'https://github.com/org/repo/commit/1',
      authorAvatar: 'https://githubusercontent.com/avatar.png',
      createdAt: 'not-a-date'
    });

    expect(mockFormatDate).toHaveBeenCalledWith('not-a-date');
    expect(html).toContain('Push');
    expect(html).toContain('formatted:not-a-date');
  });
});
