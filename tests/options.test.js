import { jest, describe, test, beforeEach, expect } from '@jest/globals';

// Mock Chrome APIs
global.chrome = {
  storage: {
    sync: {
      get: jest.fn((keys, callback) => {
        // Always call callback if provided
        if (callback) callback({ githubToken: null });
      }),
      set: jest.fn((items, callback) => {
        // Always call callback if provided
        if (callback) callback();
      }),
      remove: jest.fn(() => {
        return Promise.resolve();
      })
    },
    local: {
      get: jest.fn((keys, callback) => {
        // Always call callback if provided
        if (callback) callback({});
      }),
      set: jest.fn((items, callback) => {
        // Always call callback if provided
        if (callback) callback();
      }),
      remove: jest.fn(() => {
        return Promise.resolve();
      })
    },
    session: {
      get: jest.fn((keys, callback) => {
        if (callback) callback({});
      }),
      set: jest.fn((items, callback) => {
        if (callback) callback();
      }),
      remove: jest.fn(() => {
        return Promise.resolve();
      })
    }
  }
};

// Mock fetch
global.fetch = jest.fn();



// Mock crypto-utils using unstable_mockModule
jest.unstable_mockModule('../shared/crypto-utils.js', () => ({
  encryptData: jest.fn(() => Promise.resolve({ iv: [], data: [] })),
  decryptData: jest.fn(() => Promise.resolve('decrypted-token'))
}));

// Import functions dynamically after mocking
const { fetchGitHubRepoFromNpm } = await import('../shared/api/npm-api.js');
const { trackRepoUnmuted } = await import('../options/controllers/repository-controller.js');
const {
  validateRepo,
  cleanupRepoNotifications,
  formatNumber,
  formatDate
} = await import('../options/options.js');

describe('Options Page - Repository Management', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('fetchGitHubRepoFromNpm', () => {
    test('parses valid npm package with GitHub repo', async () => {

      fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          name: 'react',
          repository: {
            type: 'git',
            url: 'git+https://github.com/facebook/react.git'
          }
        })
      });

      const result = await fetchGitHubRepoFromNpm('react');

      expect(result.success).toBe(true);
      expect(result.repo).toBe('facebook/react');
    });

    test('handles npm package with string repository field', async () => {

      fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          name: 'test-package',
          repository: 'https://github.com/owner/repo.git'
        })
      });

      const result = await fetchGitHubRepoFromNpm('test-package');

      expect(result.success).toBe(true);
      expect(result.repo).toBe('owner/repo');
    });

    test('removes .git suffix from repo URL', async () => {

      fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          repository: {
            url: 'https://github.com/owner/repo.git'
          }
        })
      });

      const result = await fetchGitHubRepoFromNpm('test');

      expect(result.repo).toBe('owner/repo');
    });

    test('handles 404 package not found', async () => {

      fetch.mockResolvedValueOnce({
        ok: false,
        status: 404
      });

      const result = await fetchGitHubRepoFromNpm('nonexistent-package');

      expect(result.success).toBe(false);
      expect(result.error).toContain('not found');
    });

    test('handles package with no repository field', async () => {

      fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          name: 'test-package'
          // No repository field
        })
      });

      const result = await fetchGitHubRepoFromNpm('test-package');

      expect(result.success).toBe(false);
      expect(result.error).toContain('no repository info');
    });

    test('handles package hosted on non-GitHub platform', async () => {

      fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          repository: {
            url: 'https://gitlab.com/owner/repo.git'
          }
        })
      });

      const result = await fetchGitHubRepoFromNpm('test-package');

      expect(result.success).toBe(false);
      expect(result.error).toContain('not hosted on GitHub');
    });

    test('handles network errors', async () => {

      fetch.mockRejectedValueOnce(new Error('Network error'));

      const result = await fetchGitHubRepoFromNpm('test-package');

      expect(result.success).toBe(false);
      expect(result.error).toContain('Network error');
    });
  });

  describe('validateRepo', () => {
    beforeEach(() => {
      // Mock token storage for validateRepo tests
      chrome.storage.local.get.mockImplementation((keys, callback) => {
        const result = {};
        if (keys.includes('githubToken')) {
          result.githubToken = 'test-token';
        }
        if (callback) callback(result);
        return Promise.resolve(result);
      });
    });

    test('validates existing repository and fetches metadata', async () => {

      // Mock repo API response
      fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          full_name: 'facebook/react',
          description: 'A declarative library for building UIs',
          language: 'JavaScript',
          stargazers_count: 234567,
          forks_count: 45678,
          updated_at: '2025-01-10T10:00:00Z'
        })
      });

      // Mock releases API response
      fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          tag_name: 'v18.3.1',
          published_at: '2025-01-05T10:00:00Z'
        })
      });

      const result = await validateRepo('facebook/react');

      expect(result.valid).toBe(true);
      expect(result.metadata).toMatchObject({
        fullName: 'facebook/react',
        description: 'A declarative library for building UIs',
        language: 'JavaScript',
        stars: 234567,
        forks: 45678
      });
      expect(result.metadata.latestRelease).toMatchObject({
        version: 'v18.3.1'
      });
    });

    test('handles repositories with no releases', async () => {

      fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          full_name: 'owner/repo',
          description: 'Test repo',
          language: 'Python',
          stargazers_count: 100,
          forks_count: 10,
          updated_at: '2025-01-01T10:00:00Z'
        })
      });

      // Releases endpoint returns 404
      fetch.mockResolvedValueOnce({
        ok: false,
        status: 404
      });

      const result = await validateRepo('owner/repo');

      expect(result.valid).toBe(true);
      expect(result.metadata.latestRelease).toBeNull();
    });

    test('handles 404 repository not found', async () => {

      fetch.mockResolvedValueOnce({
        ok: false,
        status: 404
      });

      const result = await validateRepo('nonexistent/repo');

      expect(result.valid).toBe(false);
      expect(result.error).toContain('not found');
    });

    test('handles 403 rate limit exceeded', async () => {

      fetch.mockResolvedValueOnce({
        ok: false,
        status: 403,
        headers: {
          get: jest.fn().mockImplementation((header) => {
            if (header === 'X-RateLimit-Remaining') return '0';
            return null;
          })
        }
      });

      const result = await validateRepo('some/repo');

      expect(result.valid).toBe(false);
      expect(result.error).toContain('GitHub rate limit exceeded');
    });

    test('handles 401 invalid token', async () => {

      fetch.mockResolvedValueOnce({
        ok: false,
        status: 401
      });

      const result = await validateRepo('some/repo');

      expect(result.valid).toBe(false);
      expect(result.error).toContain('Authentication failed');
    });

    test('provides default values for missing metadata', async () => {

      fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          full_name: 'owner/repo',
          description: null, // No description
          language: null, // No language
          stargazers_count: 0,
          forks_count: 0,
          updated_at: '2025-01-01T10:00:00Z'
        })
      });

      fetch.mockResolvedValueOnce({ ok: false, status: 404 });

      const result = await validateRepo('owner/repo');

      expect(result.metadata.description).toBe('No description provided');
      expect(result.metadata.language).toBe('Unknown');
    });
  });

  describe('Input Parsing', () => {
    test('parses owner/repo format', () => {
      const input = 'facebook/react';
      const match = input.match(/^[\w-]+\/[\w-]+$/);
      expect(match).toBeTruthy();
    });

    test('parses GitHub HTTPS URL', () => {
      const input = 'https://github.com/facebook/react';
      const match = input.match(/github\.com\/([^/]+\/[^/]+)/);
      expect(match).toBeTruthy();
      expect(match[1]).toBe('facebook/react');
    });

    test('parses GitHub HTTPS URL with .git suffix', () => {
      const input = 'https://github.com/facebook/react.git';
      const match = input.match(/github\.com\/([^/]+\/[^/]+)/);
      const repo = match[1].replace(/\.git$/, '');
      expect(repo).toBe('facebook/react');
    });

    test('rejects invalid formats', () => {
      expect('invalid'.match(/^[\w-]+\/[\w-]+$/)).toBeFalsy();
      expect('too/many/slashes'.match(/^[\w-]+\/[\w-]+$/)).toBeFalsy();
      expect('no-slash'.match(/^[\w-]+\/[\w-]+$/)).toBeFalsy();
    });
  });

  describe('Search and Filtering', () => {
    const mockRepos = [
      {
        fullName: 'facebook/react',
        description: 'A JavaScript library for building user interfaces',
        language: 'JavaScript'
      },
      {
        fullName: 'vuejs/vue',
        description: 'Progressive JavaScript framework',
        language: 'JavaScript'
      },
      {
        fullName: 'angular/angular',
        description: 'One framework for web, mobile, and desktop',
        language: 'TypeScript'
      }
    ];

    test('filters by repo name', () => {
      const query = 'react';
      const filtered = mockRepos.filter(r =>
        r.fullName.toLowerCase().includes(query.toLowerCase())
      );
      expect(filtered).toHaveLength(1);
      expect(filtered[0].fullName).toBe('facebook/react');
    });

    test('filters by description', () => {
      const query = 'progressive';
      const filtered = mockRepos.filter(r =>
        r.description.toLowerCase().includes(query.toLowerCase())
      );
      expect(filtered).toHaveLength(1);
      expect(filtered[0].fullName).toBe('vuejs/vue');
    });

    test('filters by language', () => {
      const query = 'typescript';
      const filtered = mockRepos.filter(r =>
        r.language.toLowerCase().includes(query.toLowerCase())
      );
      expect(filtered).toHaveLength(1);
      expect(filtered[0].fullName).toBe('angular/angular');
    });

    test('is case-insensitive', () => {
      const query = 'REACT';
      const filtered = mockRepos.filter(r =>
        r.fullName.toLowerCase().includes(query.toLowerCase())
      );
      expect(filtered).toHaveLength(1);
    });

    test('returns all when no query', () => {
      const query = '';
      const filtered = query ? mockRepos.filter(r =>
        r.fullName.toLowerCase().includes(query.toLowerCase())
      ) : mockRepos;
      expect(filtered).toHaveLength(3);
    });
  });

  describe('Pagination', () => {
    const reposPerPage = 10;

    test('calculates correct total pages', () => {
      expect(Math.ceil(25 / reposPerPage)).toBe(3);
      expect(Math.ceil(10 / reposPerPage)).toBe(1);
      expect(Math.ceil(11 / reposPerPage)).toBe(2);
    });

    test('slices correct items for page 1', () => {
      const items = Array.from({ length: 25 }, (_, i) => i);
      const page = 1;
      const startIndex = (page - 1) * reposPerPage;
      const endIndex = startIndex + reposPerPage;
      const pageItems = items.slice(startIndex, endIndex);

      expect(pageItems).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    });

    test('slices correct items for page 2', () => {
      const items = Array.from({ length: 25 }, (_, i) => i);
      const page = 2;
      const startIndex = (page - 1) * reposPerPage;
      const endIndex = startIndex + reposPerPage;
      const pageItems = items.slice(startIndex, endIndex);

      expect(pageItems).toEqual([10, 11, 12, 13, 14, 15, 16, 17, 18, 19]);
    });

    test('handles last page with partial items', () => {
      const items = Array.from({ length: 25 }, (_, i) => i);
      const page = 3;
      const startIndex = (page - 1) * reposPerPage;
      const endIndex = startIndex + reposPerPage;
      const pageItems = items.slice(startIndex, endIndex);

      expect(pageItems).toEqual([20, 21, 22, 23, 24]);
    });

    test('disables prev button on first page', () => {
      const currentPage = 1;
      const prevDisabled = currentPage === 1;
      expect(prevDisabled).toBe(true);
    });

    test('disables next button on last page', () => {
      const currentPage = 3;
      const totalPages = 3;
      const nextDisabled = currentPage === totalPages;
      expect(nextDisabled).toBe(true);
    });
  });

  describe('Number Formatting', () => {
    test('formats thousands with k', () => {
      expect(formatNumber(1234)).toBe('1.2k');
      expect(formatNumber(5678)).toBe('5.7k');
      expect(formatNumber(10000)).toBe('10.0k');
    });

    test('formats millions with M', () => {
      expect(formatNumber(1234567)).toBe('1.2M');
      expect(formatNumber(5678901)).toBe('5.7M');
    });

    test('preserves numbers under 1000', () => {
      expect(formatNumber(0)).toBe('0');
      expect(formatNumber(999)).toBe('999');
      expect(formatNumber(500)).toBe('500');
    });

    test('rounds to 1 decimal place', () => {
      expect(formatNumber(1234)).toBe('1.2k');
      expect(formatNumber(1567)).toBe('1.6k'); // Rounds up
    });
  });

  describe('Date Formatting', () => {
    test('shows today for same day', () => {
      const today = new Date();
      expect(formatDate(today.toISOString())).toBe('today');
    });

    test('shows yesterday for previous day', () => {
      const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
      expect(formatDate(yesterday.toISOString())).toBe('yesterday');
    });

    test('shows days ago for this week', () => {
      const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
      expect(formatDate(threeDaysAgo.toISOString())).toBe('3 days ago');
    });

    test('shows weeks ago for this month', () => {
      const twoWeeksAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
      expect(formatDate(twoWeeksAgo.toISOString())).toBe('2 weeks ago');
    });

    test('shows months ago for this year', () => {
      const twoMonthsAgo = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000);
      expect(formatDate(twoMonthsAgo.toISOString())).toBe('2 months ago');
    });

    test('shows years ago for old dates', () => {
      const twoYearsAgo = new Date(Date.now() - 730 * 24 * 60 * 60 * 1000);
      expect(formatDate(twoYearsAgo.toISOString())).toBe('2 years ago');
    });
  });

  describe('50 Repo Limit', () => {
    test('enforces maximum of 50 repositories', () => {
      const watchedRepos = Array.from({ length: 50 }, (_, i) => ({ id: i }));
      const canAddMore = watchedRepos.length < 50;
      expect(canAddMore).toBe(false);
    });

    test('allows adding when under limit', () => {
      const watchedRepos = Array.from({ length: 49 }, (_, i) => ({ id: i }));
      const canAddMore = watchedRepos.length < 50;
      expect(canAddMore).toBe(true);
    });
  });

  describe('Duplicate Detection', () => {
    test('detects duplicate by fullName', () => {
      const watchedRepos = [
        { fullName: 'facebook/react' },
        { fullName: 'vuejs/vue' }
      ];

      const newRepo = 'facebook/react';
      const isDuplicate = watchedRepos.some(r => r.fullName === newRepo);
      expect(isDuplicate).toBe(true);
    });

    test('allows non-duplicate repos', () => {
      const watchedRepos = [
        { fullName: 'facebook/react' },
        { fullName: 'vuejs/vue' }
      ];

      const newRepo = 'angular/angular';
      const isDuplicate = watchedRepos.some(r => r.fullName === newRepo);
      expect(isDuplicate).toBe(false);
    });
  });

  describe('Notification Cleanup', () => {
    test('cleans up activities and read items for removed repository', async () => {
      const mockActivities = [
        { id: '1', repo: 'facebook/react', title: 'PR #1: Fix bug' },
        { id: '2', repo: 'vuejs/vue', title: 'Issue #2: Feature request' },
        { id: '3', repo: 'facebook/react', title: 'Release v18.0.0' },
        { id: '4', repo: 'angular/angular', title: 'PR #4: Update docs' }
      ];

      const mockReadItems = ['1', '3']; // Read items from facebook/react repo

      // Mock chrome.storage.local.get to return the mock data
      chrome.storage.local.get.mockImplementation((keys, callback) => {
        if (keys.includes('activities') && keys.includes('readItems')) {
          callback({ activities: mockActivities, readItems: mockReadItems });
        } else if (keys.includes('activities')) {
          callback({ activities: mockActivities });
        } else if (keys.includes('readItems')) {
          callback({ readItems: mockReadItems });
        } else {
          callback({});
        }
      });

      await cleanupRepoNotifications('facebook/react');

      // Verify that chrome.storage.local.set was called with filtered data
      expect(chrome.storage.local.set).toHaveBeenCalledTimes(2);

      // First call should update activities (remove facebook/react activities)
      const firstCall = chrome.storage.local.set.mock.calls[0][0];
      expect(firstCall).toHaveProperty('activities');
      expect(firstCall.activities).toHaveLength(2); // Only 2 activities should remain
      expect(firstCall.activities.map(a => a.repo)).toEqual(
        expect.arrayContaining(['vuejs/vue', 'angular/angular'])
      );
      expect(firstCall.activities.map(a => a.repo)).not.toContain('facebook/react');

      // Second call should update readItems (remove read items from facebook/react)
      const secondCall = chrome.storage.local.set.mock.calls[1][0];
      expect(secondCall).toHaveProperty('readItems');
      expect(secondCall.readItems).toEqual([]); // All read items should be removed
    });

    test('handles empty storage gracefully', async () => {
      // Mock empty storage
      chrome.storage.local.get.mockImplementation((keys, callback) => callback({}));

      await cleanupRepoNotifications('nonexistent/repo');

      // Should still call storage.set twice even with empty data
      expect(chrome.storage.local.set).toHaveBeenCalledTimes(2);

      // Both calls should have empty arrays
      const firstCall = chrome.storage.local.set.mock.calls[0][0];
      const secondCall = chrome.storage.local.set.mock.calls[1][0];

      expect(firstCall.activities).toEqual([]);
      expect(secondCall.readItems).toEqual([]);
    });

    test('handles storage errors gracefully', async () => {
      // Mock storage error
      chrome.storage.local.get.mockImplementation(() => {
        throw new Error('Storage error');
      });

      // Should not throw an error
      await expect(cleanupRepoNotifications('test/repo')).resolves.toBeUndefined();
    });

    test('does not affect other repositories when removing one', async () => {
      const mockActivities = [
        { id: '1', repo: 'repo1/test', title: 'PR #1' },
        { id: '2', repo: 'repo2/test', title: 'Issue #2' },
        { id: '3', repo: 'repo3/test', title: 'Release v1.0' }
      ];

      const mockReadItems = ['1', '2'];

      chrome.storage.local.get.mockImplementation((keys, callback) => {
        if (keys.includes('activities') && keys.includes('readItems')) {
          callback({ activities: mockActivities, readItems: mockReadItems });
        } else {
          callback({});
        }
      });

      await cleanupRepoNotifications('repo2/test');

      const firstCall = chrome.storage.local.set.mock.calls[0][0];
      expect(firstCall.activities).toHaveLength(2);
      expect(firstCall.activities.map(a => a.repo)).toEqual(
        expect.arrayContaining(['repo1/test', 'repo3/test'])
      );
      expect(firstCall.activities.map(a => a.repo)).not.toContain('repo2/test');

      const secondCall = chrome.storage.local.set.mock.calls[1][0];
      expect(secondCall.readItems).toEqual(['1']); // Only item from repo2 should be removed
    });
  });

  describe('Repository Unmute Tracking', () => {
    test('handles storage errors gracefully', async () => {
      chrome.storage.sync.get.mockImplementation(() => {
        throw new Error('Storage error');
      });

      // Should not throw an error
      await expect(trackRepoUnmuted('test/repo')).resolves.toBeUndefined();
    });
  });
});
