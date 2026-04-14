import { beforeEach, describe, expect, jest, test } from '@jest/globals';

const mockFetchGitHubRepoFromNpm = jest.fn();
const mockValidateRepository = jest.fn();

jest.unstable_mockModule('../shared/api/npm-api.js', () => ({
  fetchGitHubRepoFromNpm: mockFetchGitHubRepoFromNpm
}));

jest.unstable_mockModule('../shared/repository-validator.js', () => ({
  validateRepository: mockValidateRepository
}));

const {
  buildWatchedRepoRecord,
  isWatchedRepoDuplicate,
  normalizeRepoInput,
  normalizeWatchedRepoRecord,
  resolveWatchedRepoInput
} = await import('../shared/repo-service.js');

describe('repo-service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = jest.fn();
  });

  test('normalizes owner/repo input directly', async () => {
    const result = await normalizeRepoInput('facebook/react');

    expect(result).toEqual({
      valid: true,
      normalizedRepo: 'facebook/react'
    });
  });

  test('normalizes GitHub URLs into owner/repo', async () => {
    const result = await normalizeRepoInput('https://github.com/facebook/react.git');

    expect(result).toEqual({
      valid: true,
      normalizedRepo: 'facebook/react'
    });
  });

  test('resolves npm packages through the npm metadata helper', async () => {
    mockFetchGitHubRepoFromNpm.mockResolvedValueOnce({
      success: true,
      repo: 'vuejs/core'
    });

    const result = await normalizeRepoInput('vue');

    expect(mockFetchGitHubRepoFromNpm).toHaveBeenCalledWith('vue');
    expect(result).toEqual({
      valid: true,
      normalizedRepo: 'vuejs/core'
    });
  });

  test('detects duplicates by fullName regardless of source shape', () => {
    const existingRepos = [
      'facebook/react',
      { fullName: 'vuejs/core' }
    ];

    expect(isWatchedRepoDuplicate(existingRepos, 'FACEBOOK/react')).toBe(true);
    expect(isWatchedRepoDuplicate(existingRepos, 'angular/angular')).toBe(false);
  });

  test('normalizes canonical watched repo records', () => {
    const normalized = normalizeWatchedRepoRecord({
      fullName: 'facebook/react',
      description: '',
      stars: '123',
      forks: undefined,
      updatedAt: '2026-04-01T00:00:00Z'
    }, {
      addedAtFallback: '2026-04-13T12:00:00Z'
    });

    expect(normalized).toEqual({
      fullName: 'facebook/react',
      name: 'react',
      description: 'No description provided',
      language: 'Unknown',
      stars: 123,
      forks: 0,
      updatedAt: '2026-04-01T00:00:00Z',
      addedAt: '2026-04-13T12:00:00Z'
    });
  });

  test('buildWatchedRepoRecord preserves supported metadata fields', () => {
    const record = buildWatchedRepoRecord({
      fullName: 'owner/repo',
      name: 'repo',
      description: 'Desc',
      language: 'TypeScript',
      stars: 42,
      forks: 7,
      updatedAt: '2026-04-01T00:00:00Z',
      private: true,
      archived: false,
      latestRelease: {
        version: 'v1.0.0',
        publishedAt: '2026-03-01T00:00:00Z'
      }
    }, {
      addedAt: '2026-04-13T12:00:00Z'
    });

    expect(record).toMatchObject({
      fullName: 'owner/repo',
      name: 'repo',
      private: true,
      archived: false,
      latestRelease: {
        version: 'v1.0.0'
      },
      addedAt: '2026-04-13T12:00:00Z'
    });
  });

  test('resolveWatchedRepoInput returns canonical record output', async () => {
    mockValidateRepository.mockResolvedValueOnce({
      valid: true,
      metadata: {
        fullName: 'facebook/react',
        name: 'react',
        description: 'UI library',
        language: 'JavaScript',
        stars: 100,
        forks: 20,
        updatedAt: '2026-04-01T00:00:00Z'
      }
    });
    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        tag_name: 'v19.0.0',
        published_at: '2026-04-10T00:00:00Z'
      })
    });

    const result = await resolveWatchedRepoInput('facebook/react', {
      githubToken: 'token',
      existingRepos: [],
      addedAt: '2026-04-13T12:00:00Z'
    });

    expect(result.valid).toBe(true);
    expect(result.record).toEqual({
      fullName: 'facebook/react',
      name: 'react',
      description: 'UI library',
      language: 'JavaScript',
      stars: 100,
      forks: 20,
      updatedAt: '2026-04-01T00:00:00Z',
      addedAt: '2026-04-13T12:00:00Z',
      latestRelease: {
        version: 'v19.0.0',
        publishedAt: '2026-04-10T00:00:00Z'
      }
    });
  });

  test('resolveWatchedRepoInput rejects duplicates by normalized fullName', async () => {
    const result = await resolveWatchedRepoInput('https://github.com/facebook/react', {
      githubToken: 'token',
      existingRepos: [{ fullName: 'facebook/react' }]
    });

    expect(result).toMatchObject({
      valid: false,
      reason: 'duplicate',
      error: 'Repository already added',
      normalizedRepo: 'facebook/react'
    });
  });
});
