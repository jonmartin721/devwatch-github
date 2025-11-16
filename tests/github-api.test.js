/**
 * GitHub API helper functions tests
 */

import { jest } from '@jest/globals';
import {
  createHeaders,
  handleApiResponse,
  mapActivity,
  filterActivitiesByDate
} from '../shared/github-api.js';

describe('GitHub API Helpers', () => {
  describe('createHeaders', () => {
    it('should create headers with authorization token', () => {
      const token = 'ghp_test1234567890';
      const headers = createHeaders(token);

      expect(headers).toEqual({
        'Authorization': 'token ghp_test1234567890',
        'Accept': 'application/vnd.github.v3+json'
      });
    });

    it('should create headers with empty token', () => {
      const headers = createHeaders('');

      expect(headers).toEqual({
        'Authorization': 'token ',
        'Accept': 'application/vnd.github.v3+json'
      });
    });

    it('should create headers with different token formats', () => {
      const token = 'github_pat_123ABC';
      const headers = createHeaders(token);

      expect(headers.Authorization).toBe('token github_pat_123ABC');
    });
  });

  describe('handleApiResponse', () => {
    it('should not throw for successful responses', () => {
      const mockResponse = {
        ok: true,
        status: 200,
        statusText: 'OK'
      };

      expect(() => handleApiResponse(mockResponse, 'owner/repo')).not.toThrow();
    });

    it('should throw error for 401 unauthorized', () => {
      const mockResponse = {
        ok: false,
        status: 401,
        statusText: 'Unauthorized'
      };

      expect(() => handleApiResponse(mockResponse, 'owner/repo')).toThrow('Invalid GitHub token');
    });

    it('should throw error for 403 rate limit', () => {
      const mockResponse = {
        ok: false,
        status: 403,
        statusText: 'Forbidden'
      };

      expect(() => handleApiResponse(mockResponse, 'owner/repo')).toThrow('Rate limit exceeded');
    });

    it('should throw error for 404 not found with repo name', () => {
      const mockResponse = {
        ok: false,
        status: 404,
        statusText: 'Not Found'
      };

      expect(() => handleApiResponse(mockResponse, 'owner/repo')).toThrow('Repository owner/repo not found');
    });

    it('should throw error for 404 not found without repo name', () => {
      const mockResponse = {
        ok: false,
        status: 404,
        statusText: 'Not Found'
      };

      expect(() => handleApiResponse(mockResponse)).toThrow('Resource not found');
    });

    it('should throw generic error for other status codes', () => {
      const mockResponse = {
        ok: false,
        status: 500,
        statusText: 'Internal Server Error'
      };

      expect(() => handleApiResponse(mockResponse, 'owner/repo')).toThrow('HTTP 500: Internal Server Error');
    });

    it('should attach response and repo to error', () => {
      const mockResponse = {
        ok: false,
        status: 401,
        statusText: 'Unauthorized'
      };

      expect.assertions(2);

      try {
        handleApiResponse(mockResponse, 'owner/repo');
      } catch (error) {
        expect(error.response).toBe(mockResponse);
        expect(error.repo).toBe('owner/repo');
      }
    });
  });

  describe('mapActivity', () => {
    beforeEach(() => {
      jest.spyOn(console, 'error').mockImplementation(() => {});
    });

    afterEach(() => {
      console.error.mockRestore();
    });

    describe('Pull Requests', () => {
      it('should map pull request with all fields', () => {
        const prItem = {
          number: 123,
          id: 456,
          title: 'Add new feature',
          html_url: 'https://github.com/owner/repo/pull/123',
          created_at: '2024-01-15T10:30:00Z',
          user: {
            login: 'octocat',
            avatar_url: 'https://github.com/octocat.png'
          }
        };

        const result = mapActivity(prItem, 'pr', 'owner/repo');

        expect(result).toEqual({
          id: 'pr-owner/repo-123',
          type: 'pr',
          repo: 'owner/repo',
          title: 'Add new feature',
          url: 'https://github.com/owner/repo/pull/123',
          createdAt: '2024-01-15T10:30:00Z',
          author: 'octocat',
          authorAvatar: 'https://github.com/octocat.png',
          number: 123
        });
      });

      it('should use defaults for missing PR fields', () => {
        const prItem = {
          number: 456,
          id: 789
        };

        const result = mapActivity(prItem, 'pr', 'owner/repo');

        expect(result.title).toBe('Untitled');
        expect(result.author).toBe('Unknown');
        expect(result.authorAvatar).toBe('');
        expect(result.url).toBe('');
        expect(new Date(result.createdAt).getTime()).toBeGreaterThan(0);
      });
    });

    describe('Issues', () => {
      it('should map issue with all fields', () => {
        const issueItem = {
          number: 42,
          id: 789,
          title: 'Fix critical bug',
          html_url: 'https://github.com/owner/repo/issues/42',
          created_at: '2024-01-20T14:15:00Z',
          user: {
            login: 'contributor',
            avatar_url: 'https://github.com/contributor.png'
          }
        };

        const result = mapActivity(issueItem, 'issue', 'owner/repo');

        expect(result).toEqual({
          id: 'issue-owner/repo-42',
          type: 'issue',
          repo: 'owner/repo',
          title: 'Fix critical bug',
          url: 'https://github.com/owner/repo/issues/42',
          createdAt: '2024-01-20T14:15:00Z',
          author: 'contributor',
          authorAvatar: 'https://github.com/contributor.png',
          number: 42
        });
      });

      it('should use defaults for missing issue fields', () => {
        const issueItem = {
          number: 99,
          id: 111
        };

        const result = mapActivity(issueItem, 'issue', 'owner/repo');

        expect(result.title).toBe('Untitled');
        expect(result.author).toBe('Unknown');
      });
    });

    describe('Releases', () => {
      it('should map release with name', () => {
        const releaseItem = {
          id: 12345,
          name: 'v2.0.0 - Major Update',
          tag_name: 'v2.0.0',
          html_url: 'https://github.com/owner/repo/releases/tag/v2.0.0',
          published_at: '2024-02-01T09:00:00Z',
          author: {
            login: 'maintainer',
            avatar_url: 'https://github.com/maintainer.png'
          }
        };

        const result = mapActivity(releaseItem, 'release', 'owner/repo');

        expect(result).toEqual({
          id: 'release-owner/repo-12345',
          type: 'release',
          repo: 'owner/repo',
          title: 'v2.0.0 - Major Update',
          url: 'https://github.com/owner/repo/releases/tag/v2.0.0',
          createdAt: '2024-02-01T09:00:00Z',
          author: 'maintainer',
          authorAvatar: 'https://github.com/maintainer.png'
        });
      });

      it('should use tag_name if name is missing', () => {
        const releaseItem = {
          id: 67890,
          tag_name: 'v1.5.0',
          published_at: '2024-01-25T12:00:00Z',
          author: {
            login: 'releasebot'
          }
        };

        const result = mapActivity(releaseItem, 'release', 'owner/repo');

        expect(result.title).toBe('v1.5.0');
      });

      it('should use defaults for missing release fields', () => {
        const releaseItem = {
          id: 111
        };

        const result = mapActivity(releaseItem, 'release', 'owner/repo');

        expect(result.title).toBe('Untitled Release');
        expect(result.author).toBe('Unknown');
        expect(result.authorAvatar).toBe('');
      });
    });

    describe('Error Handling', () => {
      it('should throw error for null item', () => {
        expect(() => mapActivity(null, 'pr', 'owner/repo')).toThrow('Invalid activity item: null or undefined');
      });

      it('should throw error for undefined item', () => {
        expect(() => mapActivity(undefined, 'pr', 'owner/repo')).toThrow('Invalid activity item: null or undefined');
      });

      it('should handle unknown activity type', () => {
        const item = {
          id: 123,
          number: 456
        };

        const result = mapActivity(item, 'unknown', 'owner/repo');

        expect(result.type).toBe('unknown');
        expect(result.id).toBe('unknown-owner/repo-456');
      });

      it('should handle malformed user object gracefully', () => {
        const prItem = {
          number: 123,
          id: 456,
          title: 'Test PR',
          user: null
        };

        const result = mapActivity(prItem, 'pr', 'owner/repo');

        expect(result.author).toBe('Unknown');
        expect(result.authorAvatar).toBe('');
      });
    });
  });

  describe('filterActivitiesByDate', () => {
    const mockItems = [
      { id: 1, created_at: '2024-01-20T10:00:00Z', title: 'Old item' },
      { id: 2, created_at: '2024-01-25T12:00:00Z', title: 'Recent item' },
      { id: 3, created_at: '2024-01-26T14:00:00Z', title: 'Newest item' },
      { id: 4, created_at: '2024-01-15T08:00:00Z', title: 'Very old item' }
    ];

    it('should filter items after given date', () => {
      const since = new Date('2024-01-24T00:00:00Z');
      const filtered = filterActivitiesByDate(mockItems, since);

      expect(filtered).toHaveLength(2);
      expect(filtered[0].id).toBe(2);
      expect(filtered[1].id).toBe(3);
    });

    it('should return all items if all are after the date', () => {
      const since = new Date('2024-01-10T00:00:00Z');
      const filtered = filterActivitiesByDate(mockItems, since);

      expect(filtered).toHaveLength(4);
    });

    it('should return empty array if all items are before the date', () => {
      const since = new Date('2024-02-01T00:00:00Z');
      const filtered = filterActivitiesByDate(mockItems, since);

      expect(filtered).toHaveLength(0);
    });

    it('should filter using custom date field', () => {
      const itemsWithPublished = [
        { id: 1, published_at: '2024-01-20T10:00:00Z' },
        { id: 2, published_at: '2024-01-26T12:00:00Z' }
      ];

      const since = new Date('2024-01-24T00:00:00Z');
      const filtered = filterActivitiesByDate(itemsWithPublished, since, 'published_at');

      expect(filtered).toHaveLength(1);
      expect(filtered[0].id).toBe(2);
    });

    it('should handle empty array', () => {
      const since = new Date('2024-01-20T00:00:00Z');
      const filtered = filterActivitiesByDate([], since);

      expect(filtered).toEqual([]);
    });

    it('should handle date exactly at boundary', () => {
      const since = new Date('2024-01-25T12:00:00Z');
      const filtered = filterActivitiesByDate(mockItems, since);

      // Should only include items strictly after the date
      expect(filtered).toHaveLength(1);
      expect(filtered[0].id).toBe(3);
    });
  });
});

export {};
