import { createHeaders } from './github-api.js';

export const GITHUB_REPO_SOURCE_CONFIG = {
  watched: {
    label: 'Watched',
    modalTitle: 'Import Watched Repositories',
    emptyState: 'No watched repositories found.'
  },
  starred: {
    label: 'Starred',
    modalTitle: 'Import Starred Repositories',
    emptyState: 'No starred repositories found.'
  },
  participating: {
    label: 'Participating',
    modalTitle: 'Import Participating Repositories',
    emptyState: 'No participating repositories found.'
  },
  mine: {
    label: 'Mine',
    modalTitle: 'Import My Repositories',
    emptyState: 'No repositories found in your account yet.'
  }
};

const REPO_SOURCE_ENDPOINTS = {
  watched: 'https://api.github.com/user/subscriptions',
  starred: 'https://api.github.com/user/starred',
  participating: 'https://api.github.com/user/repos?affiliation=collaborator,organization_member&sort=pushed',
  mine: 'https://api.github.com/user/repos?type=all&sort=updated'
};

function normalizeGitHubRepoSourceItem(repo) {
  return {
    fullName: repo.full_name,
    description: repo.description || 'No description provided',
    language: repo.language || 'Unknown',
    stars: repo.stargazers_count || 0,
    forks: repo.forks_count || 0,
    updatedAt: repo.updated_at || repo.pushed_at
  };
}

function buildGitHubRepoSourceError(status) {
  if (status === 401) {
    return 'GitHub sign-in expired or was revoked';
  }

  if (status === 403) {
    return 'Rate limit exceeded or insufficient permissions';
  }

  return `GitHub API error: ${status}`;
}

export function getGitHubRepoSourceConfig(type) {
  return GITHUB_REPO_SOURCE_CONFIG[type] || {
    label: 'Repositories',
    modalTitle: 'Import Repositories',
    emptyState: 'No repositories found.'
  };
}

export async function fetchGitHubRepoSource(type, token, options = {}) {
  const url = REPO_SOURCE_ENDPOINTS[type];
  if (!url) {
    throw new Error(`Invalid import type: ${type}`);
  }

  const headers = createHeaders(token);
  const allRepos = [];
  const perPage = options.perPage ?? 100;
  const maxPages = options.maxPages ?? 100;
  const maxRepos = options.maxRepos ?? 10000;
  const timeLimitMs = options.timeLimitMs ?? 60000;

  let page = options.page ?? 1;
  let hasMorePages = true;
  const startTime = Date.now();

  while (hasMorePages && page <= maxPages && allRepos.length < maxRepos) {
    if (Date.now() - startTime > timeLimitMs) {
      break;
    }

    const urlObj = new URL(url);
    urlObj.searchParams.set('per_page', String(perPage));
    urlObj.searchParams.set('page', String(page));

    const response = await fetch(urlObj.toString(), { headers });

    if (!response.ok) {
      throw new Error(buildGitHubRepoSourceError(response.status));
    }

    const repos = await response.json();
    if (!Array.isArray(repos) || repos.length === 0) {
      break;
    }

    allRepos.push(...repos.map(normalizeGitHubRepoSourceItem));

    if (allRepos.length >= maxRepos) {
      break;
    }

    const linkHeader = response.headers.get('Link');
    if (!linkHeader || !linkHeader.includes('rel="next"')) {
      hasMorePages = false;
    } else {
      page++;
    }
  }

  return allRepos.slice(0, maxRepos);
}
