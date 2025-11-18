import { describe, test, expect } from '@jest/globals';

const {
  extractRepoName,
  extractRepoOwner,
  extractRepoShortName,
  validateRepoFormat,
  normalizeRepo,
  isSameRepo,
  dedupeRepos,
  filterActivitiesByRepos,
  sortReposByName
} = await import('../shared/repository-utils.js');

describe('Repository Utils', () => {
  describe('extractRepoName', () => {
    test('extracts name from string format', () => {
      expect(extractRepoName('facebook/react')).toBe('facebook/react');
    });

    test('extracts name from object format', () => {
      const repo = { fullName: 'microsoft/vscode', owner: 'microsoft', name: 'vscode' };
      expect(extractRepoName(repo)).toBe('microsoft/vscode');
    });
  });

  describe('extractRepoOwner', () => {
    test('extracts owner from string format', () => {
      expect(extractRepoOwner('facebook/react')).toBe('facebook');
    });

    test('extracts owner from object with owner field', () => {
      const repo = { fullName: 'microsoft/vscode', owner: 'microsoft', name: 'vscode' };
      expect(extractRepoOwner(repo)).toBe('microsoft');
    });

    test('extracts owner from fullName when owner field missing', () => {
      const repo = { fullName: 'golang/go', name: 'go' };
      expect(extractRepoOwner(repo)).toBe('golang');
    });
  });

  describe('extractRepoShortName', () => {
    test('extracts short name from string format', () => {
      expect(extractRepoShortName('facebook/react')).toBe('react');
    });

    test('extracts short name from object with name field', () => {
      const repo = { fullName: 'microsoft/vscode', owner: 'microsoft', name: 'vscode' };
      expect(extractRepoShortName(repo)).toBe('vscode');
    });

    test('extracts short name from fullName when name field missing', () => {
      const repo = { fullName: 'golang/go', owner: 'golang' };
      expect(extractRepoShortName(repo)).toBe('go');
    });
  });

  describe('validateRepoFormat', () => {
    test('validates correct string format', () => {
      expect(validateRepoFormat('facebook/react')).toBe(true);
      expect(validateRepoFormat('microsoft/vscode')).toBe(true);
    });

    test('rejects invalid string format', () => {
      expect(validateRepoFormat('invalid')).toBe(false);
      expect(validateRepoFormat('too/many/slashes')).toBe(false);
      expect(validateRepoFormat('')).toBe(false);
    });

    test('validates correct object format', () => {
      const repo = { fullName: 'facebook/react', owner: 'facebook', name: 'react' };
      expect(validateRepoFormat(repo)).toBe(true);
    });

    test('rejects object without fullName', () => {
      const repo = { owner: 'facebook', name: 'react' };
      expect(validateRepoFormat(repo)).toBe(false);
    });

    test('rejects object with invalid fullName', () => {
      const repo = { fullName: 'invalid', owner: 'facebook', name: 'react' };
      expect(validateRepoFormat(repo)).toBe(false);
    });

    test('rejects null and undefined', () => {
      expect(validateRepoFormat(null)).toBe(false);
      expect(validateRepoFormat(undefined)).toBe(false);
    });
  });

  describe('normalizeRepo', () => {
    test('normalizes string to object format', () => {
      const result = normalizeRepo('facebook/react');
      expect(result).toEqual({
        fullName: 'facebook/react',
        owner: 'facebook',
        name: 'react'
      });
    });

    test('normalizes complete object', () => {
      const repo = { fullName: 'microsoft/vscode', owner: 'microsoft', name: 'vscode' };
      const result = normalizeRepo(repo);
      expect(result).toEqual({
        fullName: 'microsoft/vscode',
        owner: 'microsoft',
        name: 'vscode'
      });
    });

    test('fills in missing owner from fullName', () => {
      const repo = { fullName: 'golang/go', name: 'go' };
      const result = normalizeRepo(repo);
      expect(result.owner).toBe('golang');
    });

    test('fills in missing name from fullName', () => {
      const repo = { fullName: 'golang/go', owner: 'golang' };
      const result = normalizeRepo(repo);
      expect(result.name).toBe('go');
    });
  });

  describe('isSameRepo', () => {
    test('compares two string repos', () => {
      expect(isSameRepo('facebook/react', 'facebook/react')).toBe(true);
      expect(isSameRepo('facebook/react', 'microsoft/vscode')).toBe(false);
    });

    test('compares two object repos', () => {
      const repo1 = { fullName: 'facebook/react', owner: 'facebook', name: 'react' };
      const repo2 = { fullName: 'facebook/react', owner: 'facebook', name: 'react' };
      const repo3 = { fullName: 'microsoft/vscode', owner: 'microsoft', name: 'vscode' };

      expect(isSameRepo(repo1, repo2)).toBe(true);
      expect(isSameRepo(repo1, repo3)).toBe(false);
    });

    test('compares string and object repos', () => {
      const repo = { fullName: 'facebook/react', owner: 'facebook', name: 'react' };
      expect(isSameRepo('facebook/react', repo)).toBe(true);
      expect(isSameRepo(repo, 'facebook/react')).toBe(true);
      expect(isSameRepo('microsoft/vscode', repo)).toBe(false);
    });
  });

  describe('dedupeRepos', () => {
    test('removes duplicate string repos', () => {
      const repos = ['facebook/react', 'microsoft/vscode', 'facebook/react'];
      const result = dedupeRepos(repos);
      expect(result).toEqual(['facebook/react', 'microsoft/vscode']);
    });

    test('removes duplicate object repos', () => {
      const repos = [
        { fullName: 'facebook/react', owner: 'facebook', name: 'react' },
        { fullName: 'microsoft/vscode', owner: 'microsoft', name: 'vscode' },
        { fullName: 'facebook/react', owner: 'facebook', name: 'react' }
      ];
      const result = dedupeRepos(repos);
      expect(result.length).toBe(2);
      expect(result[0].fullName).toBe('facebook/react');
      expect(result[1].fullName).toBe('microsoft/vscode');
    });

    test('handles mixed string and object repos', () => {
      const repos = [
        'facebook/react',
        { fullName: 'microsoft/vscode', owner: 'microsoft', name: 'vscode' },
        'facebook/react'
      ];
      const result = dedupeRepos(repos);
      expect(result.length).toBe(2);
    });

    test('handles empty array', () => {
      expect(dedupeRepos([])).toEqual([]);
    });

    test('preserves first occurrence', () => {
      const repos = ['facebook/react', 'microsoft/vscode', 'facebook/react'];
      const result = dedupeRepos(repos);
      expect(result[0]).toBe(repos[0]);
    });
  });

  describe('filterActivitiesByRepos', () => {
    const activities = [
      { id: '1', repo: 'facebook/react', type: 'pr' },
      { id: '2', repo: 'microsoft/vscode', type: 'issue' },
      { id: '3', repo: 'golang/go', type: 'release' }
    ];

    test('filters out excluded repos', () => {
      const excluded = new Set(['facebook/react']);
      const result = filterActivitiesByRepos(activities, excluded);
      expect(result.length).toBe(2);
      expect(result.find(a => a.repo === 'facebook/react')).toBeUndefined();
    });

    test('returns all activities when no exclusions', () => {
      const result = filterActivitiesByRepos(activities, new Set());
      expect(result.length).toBe(3);
    });

    test('returns all activities when exclusions is null', () => {
      const result = filterActivitiesByRepos(activities, null);
      expect(result.length).toBe(3);
    });

    test('returns all activities when exclusions is undefined', () => {
      const result = filterActivitiesByRepos(activities, undefined);
      expect(result.length).toBe(3);
    });

    test('handles multiple exclusions', () => {
      const excluded = new Set(['facebook/react', 'microsoft/vscode']);
      const result = filterActivitiesByRepos(activities, excluded);
      expect(result.length).toBe(1);
      expect(result[0].repo).toBe('golang/go');
    });

    test('handles empty activities array', () => {
      const result = filterActivitiesByRepos([], new Set(['facebook/react']));
      expect(result).toEqual([]);
    });
  });

  describe('sortReposByName', () => {
    test('sorts string repos alphabetically', () => {
      const repos = ['microsoft/vscode', 'facebook/react', 'golang/go'];
      const result = sortReposByName(repos);
      expect(result).toEqual(['facebook/react', 'golang/go', 'microsoft/vscode']);
    });

    test('sorts object repos alphabetically', () => {
      const repos = [
        { fullName: 'microsoft/vscode', owner: 'microsoft', name: 'vscode' },
        { fullName: 'facebook/react', owner: 'facebook', name: 'react' },
        { fullName: 'golang/go', owner: 'golang', name: 'go' }
      ];
      const result = sortReposByName(repos);
      expect(result[0].fullName).toBe('facebook/react');
      expect(result[1].fullName).toBe('golang/go');
      expect(result[2].fullName).toBe('microsoft/vscode');
    });

    test('sorts mixed string and object repos', () => {
      const repos = [
        { fullName: 'microsoft/vscode', owner: 'microsoft', name: 'vscode' },
        'facebook/react',
        'golang/go'
      ];
      const result = sortReposByName(repos);
      expect(extractRepoName(result[0])).toBe('facebook/react');
      expect(extractRepoName(result[1])).toBe('golang/go');
      expect(extractRepoName(result[2])).toBe('microsoft/vscode');
    });

    test('does not mutate original array', () => {
      const repos = ['microsoft/vscode', 'facebook/react'];
      const original = [...repos];
      sortReposByName(repos);
      expect(repos).toEqual(original);
    });

    test('handles empty array', () => {
      expect(sortReposByName([])).toEqual([]);
    });

    test('handles single item array', () => {
      const repos = ['facebook/react'];
      expect(sortReposByName(repos)).toEqual(repos);
    });
  });
});
