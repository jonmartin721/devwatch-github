/**
 * Shared repository resolution and normalization helpers.
 */

import { VALIDATION_PATTERNS } from './config.js';
import { fetchGitHubRepoFromNpm } from './api/npm-api.js';
import { validateRepository } from './repository-validator.js';
import { createHeaders } from './github-api.js';

export function getRepoFullName(repo) {
  if (typeof repo === 'string') {
    return repo;
  }

  return repo?.fullName || '';
}

export function isWatchedRepoDuplicate(repos = [], fullName = '') {
  const normalizedFullName = String(fullName || '').toLowerCase();

  if (!normalizedFullName) {
    return false;
  }

  return repos.some(repo => getRepoFullName(repo).toLowerCase() === normalizedFullName);
}

export function normalizeWatchedRepoRecord(repo, { addedAtFallback = null } = {}) {
  const fullName = getRepoFullName(repo);

  if (!fullName) {
    return null;
  }

  const [, derivedName = ''] = fullName.split('/');
  const record = {
    fullName,
    name: repo?.name || derivedName,
    description: repo?.description || 'No description provided',
    language: repo?.language || 'Unknown',
    stars: Number.isFinite(Number(repo?.stars)) ? Number(repo.stars) : 0,
    forks: Number.isFinite(Number(repo?.forks)) ? Number(repo.forks) : 0,
    updatedAt: repo?.updatedAt || null,
    addedAt: repo?.addedAt || addedAtFallback || new Date().toISOString()
  };

  if (repo?.latestRelease !== undefined) {
    record.latestRelease = repo.latestRelease;
  }

  if (repo?.private !== undefined) {
    record.private = repo.private;
  }

  if (repo?.archived !== undefined) {
    record.archived = repo.archived;
  }

  return record;
}

export function normalizeWatchedRepos(repos = []) {
  return (Array.isArray(repos) ? repos : [])
    .map(repo => normalizeWatchedRepoRecord(repo))
    .filter(Boolean);
}

export async function normalizeRepoInput(rawInput) {
  let repo = String(rawInput || '').trim();

  if (!repo) {
    return {
      valid: false,
      error: 'Repository name is required'
    };
  }

  const urlMatch = repo.match(/github\.com\/([^/]+\/[^/]+)/);

  if (urlMatch) {
    repo = urlMatch[1].replace(/\.git$/, '');
  } else if (!repo.includes('/') || repo.startsWith('@')) {
    const npmResult = await fetchGitHubRepoFromNpm(repo);

    if (!npmResult.success) {
      return {
        valid: false,
        error: npmResult.error
      };
    }

    repo = npmResult.repo;
  }

  if (!VALIDATION_PATTERNS.REPOSITORY_NAME.test(repo)) {
    return {
      valid: false,
      error: 'Invalid format. Use: owner/repo, GitHub URL, or npm package'
    };
  }

  return {
    valid: true,
    normalizedRepo: repo
  };
}

export async function validateWatchedRepo(repo, githubToken) {
  const basicResult = await validateRepository(repo, githubToken);

  if (!basicResult.valid) {
    if (!githubToken) {
      const publicLookupError = String(basicResult.error || '').toLowerCase();
      if (
        publicLookupError.includes('not found')
        || publicLookupError.includes('access denied')
        || publicLookupError.includes('sign-in expired')
        || publicLookupError.includes('unauthorized')
      ) {
        return {
          valid: false,
          error: `Repository "${repo}" was not found publicly. If it's private, connect GitHub and try again.`
        };
      }
    }
    return basicResult;
  }

  if (!githubToken) {
    return {
      valid: true,
      metadata: {
        ...basicResult.metadata,
        latestRelease: null
      }
    };
  }

  try {
    const headers = createHeaders(githubToken);
    const releasesResponse = await fetch(`https://api.github.com/repos/${repo}/releases/latest`, { headers });

    let latestRelease = null;
    if (releasesResponse.ok) {
      const releaseData = await releasesResponse.json();
      latestRelease = {
        version: releaseData.tag_name,
        publishedAt: releaseData.published_at
      };
    }

    return {
      valid: true,
      metadata: {
        ...basicResult.metadata,
        latestRelease
      }
    };
  } catch (_error) {
    return {
      valid: true,
      metadata: {
        ...basicResult.metadata,
        latestRelease: null
      }
    };
  }
}

export function buildWatchedRepoRecord(metadata, options = {}) {
  return normalizeWatchedRepoRecord(metadata, {
    addedAtFallback: options.addedAt || new Date().toISOString()
  });
}

export async function resolveWatchedRepoInput(
  rawInput,
  {
    githubToken,
    existingRepos = [],
    addedAt = new Date().toISOString()
  } = {}
) {
  const normalizationResult = await normalizeRepoInput(rawInput);

  if (!normalizationResult.valid) {
    return normalizationResult;
  }

  const normalizedRepo = normalizationResult.normalizedRepo;

  if (isWatchedRepoDuplicate(existingRepos, normalizedRepo)) {
    return {
      valid: false,
      reason: 'duplicate',
      error: 'Repository already added',
      normalizedRepo
    };
  }

  const validationResult = await validateWatchedRepo(normalizedRepo, githubToken);

  if (!validationResult.valid) {
    return {
      ...validationResult,
      normalizedRepo
    };
  }

  const fullName = validationResult.metadata?.fullName || normalizedRepo;

  if (isWatchedRepoDuplicate(existingRepos, fullName)) {
    return {
      valid: false,
      reason: 'duplicate',
      error: 'Repository already added',
      normalizedRepo: fullName
    };
  }

  return {
    valid: true,
    normalizedRepo: fullName,
    metadata: validationResult.metadata,
    record: buildWatchedRepoRecord(validationResult.metadata, { addedAt })
  };
}
