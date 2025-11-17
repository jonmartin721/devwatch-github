import { jest, describe, test, beforeEach, afterEach, expect } from '@jest/globals';
import { fetchGitHubRepoFromNpm } from '../shared/api/npm-api.js';

describe('NPM API', () => {
  let mockFetch;

  beforeEach(() => {
    mockFetch = jest.fn();
    global.fetch = mockFetch;
  });

  afterEach(() => {
    global.fetch = undefined;
  });

  describe('fetchGitHubRepoFromNpm', () => {
    test('fetches GitHub repo from NPM package with string repository', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          repository: 'https://github.com/facebook/react.git'
        })
      });

      const result = await fetchGitHubRepoFromNpm('react');

      expect(result).toEqual({
        success: true,
        repo: 'facebook/react'
      });
      expect(mockFetch).toHaveBeenCalledWith('https://registry.npmjs.org/react');
    });

    test('fetches GitHub repo from NPM package with object repository', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          repository: {
            url: 'git+https://github.com/facebook/react.git'
          }
        })
      });

      const result = await fetchGitHubRepoFromNpm('react');

      expect(result).toEqual({
        success: true,
        repo: 'facebook/react'
      });
    });

    test('handles git protocol URLs', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          repository: 'git://github.com/owner/repo.git'
        })
      });

      const result = await fetchGitHubRepoFromNpm('package');

      expect(result).toEqual({
        success: true,
        repo: 'owner/repo'
      });
    });

    test('handles SSH URLs', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          repository: 'git@github.com:owner/repo.git'
        })
      });

      const result = await fetchGitHubRepoFromNpm('package');

      expect(result).toEqual({
        success: true,
        repo: 'owner/repo'
      });
    });

    test('strips .git extension from repo name', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          repository: 'https://github.com/owner/repo.git'
        })
      });

      const result = await fetchGitHubRepoFromNpm('package');

      expect(result.repo).toBe('owner/repo');
      expect(result.repo).not.toContain('.git');
    });

    test('handles package not found (404)', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 404
      });

      const result = await fetchGitHubRepoFromNpm('nonexistent-package');

      expect(result).toEqual({
        success: false,
        error: 'NPM package "nonexistent-package" not found'
      });
    });

    test('handles other HTTP errors', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 500
      });

      const result = await fetchGitHubRepoFromNpm('package');

      expect(result).toEqual({
        success: false,
        error: 'Error fetching NPM package (500)'
      });
    });

    test('handles package with no repository info', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          name: 'package',
          version: '1.0.0'
          // no repository field
        })
      });

      const result = await fetchGitHubRepoFromNpm('package');

      expect(result).toEqual({
        success: false,
        error: 'Package "package" has no repository info'
      });
    });

    test('handles package not hosted on GitHub', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          repository: 'https://gitlab.com/owner/repo.git'
        })
      });

      const result = await fetchGitHubRepoFromNpm('package');

      expect(result).toEqual({
        success: false,
        error: 'Package "package" is not hosted on GitHub'
      });
    });

    test('handles network errors', async () => {
      mockFetch.mockRejectedValue(new Error('Network error'));

      const result = await fetchGitHubRepoFromNpm('package');

      expect(result).toEqual({
        success: false,
        error: 'Network error fetching NPM package'
      });
    });

    test('handles malformed repository URLs', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          repository: 'not-a-valid-url'
        })
      });

      const result = await fetchGitHubRepoFromNpm('package');

      expect(result.success).toBe(false);
      expect(result.error).toContain('not hosted on GitHub');
    });

    test('handles scoped NPM packages', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          repository: 'https://github.com/org/package.git'
        })
      });

      const result = await fetchGitHubRepoFromNpm('@org/package');

      expect(result).toEqual({
        success: true,
        repo: 'org/package'
      });
      expect(mockFetch).toHaveBeenCalledWith('https://registry.npmjs.org/@org/package');
    });

    test('handles GitHub URLs without .git extension', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          repository: 'https://github.com/owner/repo'
        })
      });

      const result = await fetchGitHubRepoFromNpm('package');

      expect(result).toEqual({
        success: true,
        repo: 'owner/repo'
      });
    });
  });
});
