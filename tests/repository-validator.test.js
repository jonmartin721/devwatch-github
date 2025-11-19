import { jest, describe, test, beforeEach, expect } from '@jest/globals';

// Mock fetch
global.fetch = jest.fn();

// Import functions to test
import {
  isValidRepoFormat,
  validateRepository,
  validateRepositoryEnhanced,
  validateRepositories,
  quickValidateRepo
} from '../shared/repository-validator.js';

describe('repository-validator', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('isValidRepoFormat', () => {
    test('accepts valid repository format', () => {
      expect(isValidRepoFormat('facebook/react')).toBe(true);
      expect(isValidRepoFormat('microsoft/vscode')).toBe(true);
      expect(isValidRepoFormat('nodejs/node')).toBe(true);
      expect(isValidRepoFormat('user123/repo-name')).toBe(true);
    });

    test('rejects invalid formats', () => {
      expect(isValidRepoFormat('facebook')).toBe(false);
      expect(isValidRepoFormat('facebook/')).toBe(false);
      expect(isValidRepoFormat('/react')).toBe(false);
      expect(isValidRepoFormat('facebook/react/extra')).toBe(false);
      expect(isValidRepoFormat('')).toBe(false);
    });

    test('rejects formats with invalid characters', () => {
      expect(isValidRepoFormat('face book/react')).toBe(false);
      expect(isValidRepoFormat('facebook/re act')).toBe(false);
      expect(isValidRepoFormat('facebook/re@ct')).toBe(false);
    });
  });

  describe('validateRepository', () => {
    test('validates successful repository', async () => {
      const mockRepoData = {
        full_name: 'facebook/react',
        name: 'react',
        description: 'A JavaScript library for building user interfaces',
        language: 'JavaScript',
        stargazers_count: 200000,
        forks_count: 40000,
        updated_at: '2025-01-15T10:00:00Z',
        private: false,
        archived: false
      };

      fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockRepoData,
        headers: new Map()
      });

      const result = await validateRepository('facebook/react', 'test-token');

      expect(result.valid).toBe(true);
      expect(result.metadata).toEqual({
        fullName: 'facebook/react',
        name: 'react',
        description: 'A JavaScript library for building user interfaces',
        language: 'JavaScript',
        stars: 200000,
        forks: 40000,
        updatedAt: '2025-01-15T10:00:00Z',
        private: false,
        archived: false
      });
    });

    test('returns error for invalid format', async () => {
      const result = await validateRepository('invalid-repo');

      expect(result.valid).toBe(false);
      expect(result.error).toContain('Invalid repository format');
      expect(fetch).not.toHaveBeenCalled();
    });

    test('handles 404 not found', async () => {
      fetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: 'Not Found'
      });

      const result = await validateRepository('nonexistent/repo');

      expect(result.valid).toBe(false);
      expect(result.error).toContain('not found or access denied');
    });

    test('handles 403 rate limit exceeded', async () => {
      fetch.mockResolvedValueOnce({
        ok: false,
        status: 403,
        statusText: 'Forbidden',
        headers: {
          get: (header) => header === 'X-RateLimit-Remaining' ? '0' : null
        }
      });

      const result = await validateRepository('test/repo');

      expect(result.valid).toBe(false);
      expect(result.error).toContain('rate limit exceeded');
    });

    test('handles 403 access denied (not rate limit)', async () => {
      fetch.mockResolvedValueOnce({
        ok: false,
        status: 403,
        statusText: 'Forbidden',
        headers: {
          get: () => null
        }
      });

      const result = await validateRepository('test/repo');

      expect(result.valid).toBe(false);
      expect(result.error).toContain('Access denied');
    });

    test('handles 401 authentication error', async () => {
      fetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        statusText: 'Unauthorized'
      });

      const result = await validateRepository('test/repo');

      expect(result.valid).toBe(false);
      expect(result.error).toContain('Authentication failed');
    });

    test('handles unknown API errors', async () => {
      fetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error'
      });

      const result = await validateRepository('test/repo');

      expect(result.valid).toBe(false);
      expect(result.error).toContain('GitHub API error (500)');
    });

    test('handles network errors', async () => {
      fetch.mockRejectedValueOnce(new TypeError('Failed to fetch'));

      const result = await validateRepository('test/repo');

      expect(result.valid).toBe(false);
      expect(result.error).toBeDefined();
    });

    test('handles repository with no description', async () => {
      const mockRepoData = {
        full_name: 'test/repo',
        name: 'repo',
        description: null,
        language: null,
        stargazers_count: 0,
        forks_count: 0,
        updated_at: '2025-01-15T10:00:00Z',
        private: false,
        archived: false
      };

      fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockRepoData
      });

      const result = await validateRepository('test/repo');

      expect(result.valid).toBe(true);
      expect(result.metadata.description).toBe('No description provided');
      expect(result.metadata.language).toBe('Unknown');
      expect(result.metadata.forks).toBe(0);
    });

    test('uses custom headers when token provided', async () => {
      fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          full_name: 'test/repo',
          name: 'repo',
          stargazers_count: 0,
          private: false,
          archived: false
        })
      });

      await validateRepository('test/repo', 'my-token');

      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining('/repos/test/repo'),
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: expect.stringContaining('my-token')
          })
        })
      );
    });
  });

  describe('quickValidateRepo', () => {
    test('validates correct format', () => {
      const result = quickValidateRepo('facebook/react');

      expect(result.valid).toBe(true);
      expect(result.normalized).toBe('facebook/react');
    });

    test('rejects empty string', () => {
      const result = quickValidateRepo('');

      expect(result.valid).toBe(false);
      expect(result.error).toContain('required');
    });

    test('rejects null', () => {
      const result = quickValidateRepo(null);

      expect(result.valid).toBe(false);
      expect(result.error).toContain('required');
    });

    test('rejects undefined', () => {
      const result = quickValidateRepo(undefined);

      expect(result.valid).toBe(false);
      expect(result.error).toContain('required');
    });

    test('rejects non-string values', () => {
      const result = quickValidateRepo(123);

      expect(result.valid).toBe(false);
      expect(result.error).toContain('required');
    });

    test('rejects leading spaces', () => {
      const result = quickValidateRepo(' facebook/react');

      expect(result.valid).toBe(false);
      expect(result.error).toContain('leading/trailing spaces');
    });

    test('rejects trailing spaces', () => {
      const result = quickValidateRepo('facebook/react ');

      expect(result.valid).toBe(false);
      expect(result.error).toContain('leading/trailing spaces');
    });

    test('rejects invalid format', () => {
      const result = quickValidateRepo('invalid');

      expect(result.valid).toBe(false);
      expect(result.error).toContain('Invalid format');
    });

    test('provides helpful error message', () => {
      const result = quickValidateRepo('no-slash');

      expect(result.error).toContain('owner/repo');
      expect(result.error).toContain('microsoft/vscode');
    });
  });

  describe('validateRepositories', () => {
    test('validates multiple repositories', async () => {
      fetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ full_name: 'repo1/test', name: 'test', stargazers_count: 10, private: false, archived: false })
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ full_name: 'repo2/test', name: 'test', stargazers_count: 20, private: false, archived: false })
        });

      const results = await validateRepositories(['repo1/test', 'repo2/test']);

      expect(results).toHaveLength(2);
      expect(results[0].valid).toBe(true);
      expect(results[1].valid).toBe(true);
    });

    test('calls progress callback', async () => {
      const progressCallback = jest.fn();

      fetch.mockResolvedValue({
        ok: true,
        json: async () => ({ full_name: 'test/repo', name: 'repo', stargazers_count: 0, private: false, archived: false })
      });

      await validateRepositories(['repo1/test', 'repo2/test'], null, progressCallback);

      expect(progressCallback).toHaveBeenCalledTimes(2);
      expect(progressCallback).toHaveBeenCalledWith(1, 2, 'repo1/test', expect.any(Object));
      expect(progressCallback).toHaveBeenCalledWith(2, 2, 'repo2/test', expect.any(Object));
    });

    test('handles empty array', async () => {
      const results = await validateRepositories([]);

      expect(results).toEqual([]);
      expect(fetch).not.toHaveBeenCalled();
    });

    test('continues validation even if one fails', async () => {
      fetch
        .mockResolvedValueOnce({
          ok: false,
          status: 404
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ full_name: 'repo2/test', name: 'test', stargazers_count: 20, private: false, archived: false })
        });

      const results = await validateRepositories(['invalid/repo', 'repo2/test']);

      expect(results).toHaveLength(2);
      expect(results[0].valid).toBe(false);
      expect(results[1].valid).toBe(true);
    });
  });

  describe('validateRepositoryEnhanced', () => {
    test('returns basic validation if repository is invalid', async () => {
      fetch.mockResolvedValueOnce({
        ok: false,
        status: 404
      });

      const result = await validateRepositoryEnhanced('nonexistent/repo');

      expect(result.valid).toBe(false);
      expect(result.metadata).toBeUndefined();
    });

    test('fetches additional metadata for valid repository', async () => {
      const mockBasicData = {
        full_name: 'test/repo',
        name: 'repo',
        stargazers_count: 100,
        private: false,
        archived: false
      };

      const mockReleaseData = {
        tag_name: 'v1.0.0',
        published_at: '2025-01-01T00:00:00Z'
      };

      const mockContributors = [{ id: 1 }, { id: 2 }, { id: 3 }];

      fetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => mockBasicData
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => mockReleaseData
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => mockContributors
        });

      const result = await validateRepositoryEnhanced('test/repo');

      expect(result.valid).toBe(true);
      expect(result.metadata.latestRelease).toEqual({
        tagName: 'v1.0.0',
        publishedAt: '2025-01-01T00:00:00Z'
      });
      expect(result.metadata.contributorCount).toBe(3);
      expect(result.metadata.addedAt).toBeDefined();
    });

    test('handles missing release data gracefully', async () => {
      fetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ full_name: 'test/repo', name: 'repo', stargazers_count: 0, private: false, archived: false })
        })
        .mockResolvedValueOnce({
          ok: false,
          status: 404
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => []
        });

      const result = await validateRepositoryEnhanced('test/repo');

      expect(result.valid).toBe(true);
      expect(result.metadata.latestRelease).toBeNull();
      expect(result.metadata.contributorCount).toBe(0);
    });

    test('returns basic validation on enhanced fetch errors', async () => {
      fetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ full_name: 'test/repo', name: 'repo', stargazers_count: 0, private: false, archived: false })
        })
        .mockRejectedValueOnce(new Error('Network error'));

      const result = await validateRepositoryEnhanced('test/repo');

      expect(result.valid).toBe(true);
      expect(result.metadata).toBeDefined();
      // Should still have basic metadata
      expect(result.metadata.fullName).toBe('test/repo');
    });
  });
});
