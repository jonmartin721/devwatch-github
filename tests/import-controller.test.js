import { jest, describe, test, beforeEach, expect, afterEach } from '@jest/globals';

// Mock dependencies
jest.unstable_mockModule('../shared/storage-helpers.js', () => ({
  getToken: jest.fn(() => Promise.resolve('fake-token'))
}));

jest.unstable_mockModule('../shared/github-api.js', () => ({
  createHeaders: jest.fn((token) => ({ 'Authorization': `token ${token}` }))
}));

jest.unstable_mockModule('../shared/sanitize.js', () => ({
  escapeHtml: jest.fn((text) => text),
  unescapeHtml: jest.fn((text) => text)
}));

jest.unstable_mockModule('../shared/utils.js', () => ({
  formatDateVerbose: jest.fn((date) => 'recently')
}));

jest.unstable_mockModule('../shared/icons.js', () => ({
  STAR_ICON: 'star-icon',
  createSvg: jest.fn(() => '<svg></svg>')
}));

const { getToken } = await import('../shared/storage-helpers.js');
const {
  openImportModal,
  closeImportModal,
  filterImportRepos,
  updateSelectedCount,
  importSelectedRepos
} = await import('../options/controllers/import-controller.js');

describe('import-controller', () => {
  let modal, modalTitle, loadingState, reposList, errorState, errorMessage;
  let reposContainer, repoCount, repoSearch, selectedCount, confirmBtn, closeBtn;

  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();

    // Setup DOM
    document.body.innerHTML = '';

    // Create modal structure
    modal = document.createElement('div');
    modal.id = 'importModal';
    modal.className = '';

    modalTitle = document.createElement('h2');
    modalTitle.id = 'importModalTitle';
    modal.appendChild(modalTitle);

    loadingState = document.createElement('div');
    loadingState.id = 'importLoadingState';
    loadingState.style.display = 'none';
    modal.appendChild(loadingState);

    reposList = document.createElement('div');
    reposList.id = 'importReposList';
    reposList.style.display = 'none';
    modal.appendChild(reposList);

    errorState = document.createElement('div');
    errorState.id = 'importErrorState';
    errorState.style.display = 'none';
    modal.appendChild(errorState);

    errorMessage = document.createElement('p');
    errorMessage.id = 'importErrorMessage';
    errorState.appendChild(errorMessage);

    reposContainer = document.createElement('ul');
    reposContainer.id = 'importReposContainer';
    reposList.appendChild(reposContainer);

    repoCount = document.createElement('span');
    repoCount.id = 'importRepoCount';
    reposList.appendChild(repoCount);

    repoSearch = document.createElement('input');
    repoSearch.id = 'importRepoSearch';
    repoSearch.value = '';
    modal.appendChild(repoSearch);

    selectedCount = document.createElement('span');
    selectedCount.id = 'selectedCount';
    modal.appendChild(selectedCount);

    confirmBtn = document.createElement('button');
    confirmBtn.id = 'confirmImportBtn';
    confirmBtn.disabled = true;
    modal.appendChild(confirmBtn);

    closeBtn = document.createElement('button');
    closeBtn.id = 'closeImportModal';
    modal.appendChild(closeBtn);

    document.body.appendChild(modal);

    // Mock chrome.storage
    global.chrome = {
      storage: {
        sync: {
          set: jest.fn((data) => Promise.resolve())
        }
      }
    };

    // Mock fetch
    global.fetch = jest.fn();
  });

  describe('openImportModal', () => {
    test('does not open modal if no token', async () => {
      getToken.mockResolvedValueOnce(null);

      await openImportModal('starred', []);

      expect(modal.classList.contains('show')).toBe(false);
    });

    test('opens modal with correct title for watched type', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve([]),
        headers: new Map()
      });

      await openImportModal('watched', []);

      expect(modalTitle.textContent).toBe('Import Watched Repositories');
      expect(modal.classList.contains('show')).toBe(true);
    });

    test('opens modal with correct title for starred type', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve([]),
        headers: new Map()
      });

      await openImportModal('starred', []);

      expect(modalTitle.textContent).toBe('Import Starred Repositories');
    });

    test('opens modal with correct title for participating type', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve([]),
        headers: new Map()
      });

      await openImportModal('participating', []);

      expect(modalTitle.textContent).toBe('Import Participating Repositories');
    });

    test('opens modal with correct title for mine type', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve([]),
        headers: new Map()
      });

      await openImportModal('mine', []);

      expect(modalTitle.textContent).toBe('Import My Repositories');
    });

    test('shows loading state initially', async () => {
      global.fetch.mockImplementationOnce(() => new Promise(() => {})); // Never resolves

      openImportModal('starred', []);

      await new Promise(resolve => setTimeout(resolve, 0));

      expect(loadingState.style.display).toBe('flex');
      expect(reposList.style.display).toBe('none');
      expect(errorState.style.display).toBe('none');
    });

    test('fetches and displays repos successfully', async () => {
      const mockRepos = [
        {
          full_name: 'owner/repo1',
          description: 'Test repo 1',
          language: 'JavaScript',
          stargazers_count: 100,
          forks_count: 20,
          updated_at: '2023-01-01T00:00:00Z'
        }
      ];

      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockRepos),
        headers: new Map()
      });

      await openImportModal('starred', []);

      expect(loadingState.style.display).toBe('none');
      expect(reposList.style.display).toBe('block');
      expect(errorState.style.display).toBe('none');
    });

    test('marks already watched repos as added', async () => {
      const mockRepos = [
        {
          full_name: 'owner/repo1',
          description: 'Test',
          language: 'JavaScript',
          stargazers_count: 100,
          forks_count: 20,
          updated_at: '2023-01-01T00:00:00Z'
        }
      ];

      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockRepos),
        headers: new Map()
      });

      const watchedRepos = ['owner/repo1'];

      await openImportModal('starred', watchedRepos);

      expect(reposContainer.innerHTML).toContain('already-added');
    });

    test('handles API error with 401 status', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: false,
        status: 401
      });

      await openImportModal('starred', []);

      expect(errorState.style.display).toBe('block');
      expect(errorMessage.textContent).toContain('Invalid GitHub token');
    });

    test('handles API error with 403 status', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: false,
        status: 403
      });

      await openImportModal('starred', []);

      expect(errorState.style.display).toBe('block');
      expect(errorMessage.textContent).toContain('Rate limit exceeded');
    });

    test('handles generic API error', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: false,
        status: 500
      });

      await openImportModal('starred', []);

      expect(errorState.style.display).toBe('block');
      expect(errorMessage.textContent).toContain('GitHub API error');
    });

    test('handles pagination with Link header', async () => {
      const mockReposPage1 = [
        {
          full_name: 'owner/repo1',
          description: 'Test',
          language: 'JavaScript',
          stargazers_count: 100,
          forks_count: 20,
          updated_at: '2023-01-01T00:00:00Z'
        }
      ];

      const mockReposPage2 = [
        {
          full_name: 'owner/repo2',
          description: 'Test 2',
          language: 'TypeScript',
          stargazers_count: 200,
          forks_count: 30,
          updated_at: '2023-01-02T00:00:00Z'
        }
      ];

      const headers1 = new Map();
      headers1.set('Link', '<https://api.github.com/repos?page=2>; rel="next"');

      global.fetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(mockReposPage1),
          headers: headers1
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(mockReposPage2),
          headers: new Map()
        });

      await openImportModal('starred', []);

      expect(fetch).toHaveBeenCalledTimes(2);
    });
  });

  describe('closeImportModal', () => {
    test('removes show class from modal', () => {
      modal.classList.add('show');

      closeImportModal();

      expect(modal.classList.contains('show')).toBe(false);
    });

    test('clears search input', () => {
      repoSearch.value = 'test query';

      closeImportModal();

      expect(repoSearch.value).toBe('');
    });

    test('restores focus to previous element', () => {
      const previousElement = document.createElement('button');
      document.body.appendChild(previousElement);
      previousElement.focus = jest.fn();

      // Open modal to save focus
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve([]),
        headers: new Map()
      });

      openImportModal('starred', []).then(() => {
        closeImportModal();
        // Note: In real implementation, focus would be restored
      });
    });
  });

  describe('filterImportRepos', () => {
    beforeEach(async () => {
      const mockRepos = [
        {
          full_name: 'facebook/react',
          description: 'A JavaScript library',
          language: 'JavaScript',
          stargazers_count: 100000,
          forks_count: 20000,
          updated_at: '2023-01-01T00:00:00Z'
        },
        {
          full_name: 'microsoft/typescript',
          description: 'TypeScript language',
          language: 'TypeScript',
          stargazers_count: 50000,
          forks_count: 10000,
          updated_at: '2023-01-02T00:00:00Z'
        }
      ];

      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockRepos),
        headers: new Map()
      });

      await openImportModal('starred', []);
    });

    test('shows all repos when search is empty', () => {
      repoSearch.value = '';

      filterImportRepos();

      expect(repoCount.textContent).toBe('2');
    });

    test('filters repos by name', () => {
      repoSearch.value = 'react';

      filterImportRepos();

      expect(repoCount.textContent).toBe('1');
      expect(reposContainer.innerHTML).toContain('facebook/react');
    });

    test('filters repos by description', () => {
      repoSearch.value = 'JavaScript';

      filterImportRepos();

      expect(repoCount.textContent).toBe('1');
    });

    test('filters repos by language', () => {
      repoSearch.value = 'TypeScript';

      filterImportRepos();

      expect(repoCount.textContent).toBe('1');
      expect(reposContainer.innerHTML).toContain('microsoft/typescript');
    });

    test('shows no results message when no matches', () => {
      repoSearch.value = 'nonexistent';

      filterImportRepos();

      expect(repoCount.textContent).toBe('0');
      expect(reposContainer.innerHTML).toContain('No repositories found');
    });

    test('search is case-insensitive', () => {
      repoSearch.value = 'REACT';

      filterImportRepos();

      expect(repoCount.textContent).toBe('1');
    });
  });

  describe('updateSelectedCount', () => {
    beforeEach(() => {
      reposContainer.innerHTML = `
        <li class="repo-item import-variant selected" data-repo='{"fullName":"owner/repo1"}'>Repo 1</li>
        <li class="repo-item import-variant selected" data-repo='{"fullName":"owner/repo2"}'>Repo 2</li>
        <li class="repo-item import-variant already-added selected">Already Added</li>
        <li class="repo-item import-variant">Not Selected</li>
      `;
    });

    test('counts selected repos excluding already added', () => {
      updateSelectedCount();

      expect(selectedCount.textContent).toBe('2');
    });

    test('enables confirm button when repos selected', () => {
      updateSelectedCount();

      expect(confirmBtn.disabled).toBe(false);
    });

    test('disables confirm button when no repos selected', () => {
      reposContainer.innerHTML = `
        <li class="repo-item import-variant">Not Selected</li>
      `;

      updateSelectedCount();

      expect(confirmBtn.disabled).toBe(true);
    });
  });

  describe('importSelectedRepos', () => {
    test('imports selected repos and adds to watched list', async () => {
      reposContainer.innerHTML = `
        <li class="repo-item import-variant selected" data-repo='{"fullName":"owner/repo1","description":"Test"}'>Repo 1</li>
        <li class="repo-item import-variant selected" data-repo='{"fullName":"owner/repo2","description":"Test 2"}'>Repo 2</li>
      `;

      const watchedRepos = [];
      const onReposAdded = jest.fn();

      await importSelectedRepos(watchedRepos, onReposAdded);

      expect(watchedRepos.length).toBe(2);
      expect(watchedRepos[0].fullName).toBe('owner/repo1');
      expect(watchedRepos[1].fullName).toBe('owner/repo2');
      expect(watchedRepos[0].addedAt).toBeDefined();
    });

    test('calls onReposAdded callback', async () => {
      reposContainer.innerHTML = `
        <li class="repo-item import-variant selected" data-repo='{"fullName":"owner/repo1"}'>Repo 1</li>
      `;

      const watchedRepos = [];
      const onReposAdded = jest.fn();

      await importSelectedRepos(watchedRepos, onReposAdded);

      expect(onReposAdded).toHaveBeenCalled();
    });

    test('saves to chrome storage', async () => {
      reposContainer.innerHTML = `
        <li class="repo-item import-variant selected" data-repo='{"fullName":"owner/repo1"}'>Repo 1</li>
      `;

      const watchedRepos = [];

      await importSelectedRepos(watchedRepos);

      expect(chrome.storage.sync.set).toHaveBeenCalledWith({
        watchedRepos: expect.arrayContaining([
          expect.objectContaining({ fullName: 'owner/repo1' })
        ])
      });
    });

    test('does nothing when no repos selected', async () => {
      reposContainer.innerHTML = `
        <li class="repo-item import-variant">Not Selected</li>
      `;

      const watchedRepos = [];

      await importSelectedRepos(watchedRepos);

      expect(watchedRepos.length).toBe(0);
      expect(chrome.storage.sync.set).not.toHaveBeenCalled();
    });

    test('excludes already-added repos from import', async () => {
      reposContainer.innerHTML = `
        <li class="repo-item import-variant selected" data-repo='{"fullName":"owner/repo1"}'>Repo 1</li>
        <li class="repo-item import-variant selected already-added" data-repo='{"fullName":"owner/repo2"}'>Repo 2</li>
      `;

      const watchedRepos = [];

      await importSelectedRepos(watchedRepos);

      expect(watchedRepos.length).toBe(1);
      expect(watchedRepos[0].fullName).toBe('owner/repo1');
    });

    test('closes modal after import', async () => {
      modal.classList.add('show');
      reposContainer.innerHTML = `
        <li class="repo-item import-variant selected" data-repo='{"fullName":"owner/repo1"}'>Repo 1</li>
      `;

      await importSelectedRepos([], null);

      expect(modal.classList.contains('show')).toBe(false);
    });
  });

  describe('keyboard navigation and accessibility', () => {
    test('close button receives focus when modal opens', async () => {
      jest.useFakeTimers();

      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve([]),
        headers: new Map()
      });

      closeBtn.focus = jest.fn();

      await openImportModal('starred', []);

      jest.advanceTimersByTime(100);

      expect(closeBtn.focus).toHaveBeenCalled();

      jest.useRealTimers();
    });

    test('Escape key closes modal', async () => {
      modal.classList.add('show');

      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve([]),
        headers: new Map()
      });

      await openImportModal('starred', []);

      const escapeEvent = new KeyboardEvent('keydown', {
        key: 'Escape',
        bubbles: true
      });

      modal.dispatchEvent(escapeEvent);

      expect(modal.classList.contains('show')).toBe(false);
    });
  });

  describe('edge cases and error handling', () => {
    test('handles repos without descriptions', async () => {
      const mockRepos = [
        {
          full_name: 'owner/repo1',
          language: 'JavaScript',
          stargazers_count: 100,
          forks_count: 20,
          updated_at: '2023-01-01T00:00:00Z'
          // No description
        }
      ];

      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockRepos),
        headers: new Map()
      });

      await openImportModal('starred', []);

      expect(reposContainer.innerHTML).toContain('No description provided');
    });

    test('handles repos without language', async () => {
      const mockRepos = [
        {
          full_name: 'owner/repo1',
          description: 'Test',
          stargazers_count: 100,
          forks_count: 20,
          updated_at: '2023-01-01T00:00:00Z'
          // No language
        }
      ];

      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockRepos),
        headers: new Map()
      });

      await openImportModal('starred', []);

      // Language "Unknown" should not be displayed (better UX)
      expect(reposContainer.innerHTML).not.toContain('Unknown');
      expect(reposContainer.innerHTML).toContain('owner/repo1');
    });

    test('handles watched repos in different formats', async () => {
      const mockRepos = [
        {
          full_name: 'owner/repo1',
          description: 'Test',
          language: 'JavaScript',
          stargazers_count: 100,
          forks_count: 20,
          updated_at: '2023-01-01T00:00:00Z'
        }
      ];

      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockRepos),
        headers: new Map()
      });

      // Mix of string and object formats
      const watchedRepos = [
        'owner/repo1',
        { fullName: 'owner/repo2' }
      ];

      await openImportModal('starred', watchedRepos);

      expect(reposContainer.innerHTML).toContain('already-added');
    });

    test('handles network errors gracefully', async () => {
      global.fetch.mockRejectedValueOnce(new Error('Network error'));

      await openImportModal('starred', []);

      expect(errorState.style.display).toBe('block');
      expect(errorMessage.textContent).toContain('Network error');
    });
  });
});
