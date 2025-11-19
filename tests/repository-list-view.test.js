/**
 * Tests for options/views/repository-list-view.js
 */

import { jest } from '@jest/globals';
import { renderRepoList } from '../options/views/repository-list-view.js';

describe('repository-list-view', () => {
  let mockState;
  let mockOnToggleMute;
  let mockOnTogglePin;
  let mockOnRemove;
  let repoList;
  let paginationControls;
  let hidePinnedToggleBtn;
  let repoCountBadge;
  let prevPageBtn;
  let nextPageBtn;
  let pageInfo;

  beforeEach(() => {
    // Set up DOM elements
    document.body.innerHTML = `
      <div id="repoList"></div>
      <div id="paginationControls" style="display: none;">
        <button id="prevPage">Previous</button>
        <span id="pageInfo"></span>
        <button id="nextPage">Next</button>
      </div>
      <button id="hidePinnedToggleBtn2" style="display: none;"></button>
      <span id="repoCountBadge">0</span>
    `;

    repoList = document.getElementById('repoList');
    paginationControls = document.getElementById('paginationControls');
    hidePinnedToggleBtn = document.getElementById('hidePinnedToggleBtn2');
    repoCountBadge = document.getElementById('repoCountBadge');
    prevPageBtn = document.getElementById('prevPage');
    nextPageBtn = document.getElementById('nextPage');
    pageInfo = document.getElementById('pageInfo');

    mockState = {
      watchedRepos: [],
      mutedRepos: [],
      pinnedRepos: [],
      currentPage: 1,
      reposPerPage: 10,
      searchQuery: '',
      hidePinnedRepos: false
    };

    mockOnToggleMute = jest.fn();
    mockOnTogglePin = jest.fn();
    mockOnRemove = jest.fn();
  });

  describe('empty state', () => {
    test('should render empty state when no repos exist', () => {
      renderRepoList(mockState, mockOnToggleMute, mockOnTogglePin, mockOnRemove);

      expect(repoList.querySelector('.empty-repos-card')).not.toBeNull();
      expect(repoList.textContent).toContain('No Repositories Yet');
      expect(paginationControls.style.display).toBe('none');
      expect(hidePinnedToggleBtn.style.display).toBe('none');
      expect(repoCountBadge.textContent).toBe('0');
    });

    test('should show helpful message in empty state', () => {
      renderRepoList(mockState, mockOnToggleMute, mockOnTogglePin, mockOnRemove);

      expect(repoList.textContent).toContain('Add button above');
      expect(repoList.textContent).toContain('Import from GitHub');
    });
  });

  describe('with repositories', () => {
    beforeEach(() => {
      mockState.watchedRepos = [
        {
          fullName: 'facebook/react',
          description: 'A JavaScript library for building user interfaces',
          language: 'JavaScript',
          stars: 228000,
          updatedAt: '2024-01-15T10:00:00Z',
          latestRelease: { version: 'v18.2.0' }
        },
        {
          fullName: 'microsoft/vscode',
          description: 'Visual Studio Code',
          language: 'TypeScript',
          stars: 162000,
          updatedAt: '2024-01-14T09:00:00Z',
          latestRelease: null
        }
      ];
    });

    test('should render repository list', () => {
      renderRepoList(mockState, mockOnToggleMute, mockOnTogglePin, mockOnRemove);

      const repoItems = repoList.querySelectorAll('.repo-item');
      expect(repoItems.length).toBe(2);
      expect(hidePinnedToggleBtn.style.display).toBe('flex');
      expect(repoCountBadge.textContent).toBe('2');
    });

    test('should display repository details correctly', () => {
      renderRepoList(mockState, mockOnToggleMute, mockOnTogglePin, mockOnRemove);

      const firstRepo = repoList.querySelectorAll('.repo-item')[0];
      expect(firstRepo.textContent).toContain('facebook/react');
      expect(firstRepo.textContent).toContain('A JavaScript library');
      expect(firstRepo.textContent).toContain('JavaScript');
      expect(firstRepo.textContent).toContain('v18.2.0');
    });

    test('should format large star counts with k suffix', () => {
      renderRepoList(mockState, mockOnToggleMute, mockOnTogglePin, mockOnRemove);

      const firstRepo = repoList.querySelectorAll('.repo-item')[0];
      expect(firstRepo.textContent).toContain('228k');
    });

    test('should format smaller star counts without k suffix', () => {
      mockState.watchedRepos = [
        {
          fullName: 'test/repo',
          description: 'Test',
          language: 'JavaScript',
          stars: 999,
          updatedAt: '2024-01-15T10:00:00Z'
        }
      ];

      renderRepoList(mockState, mockOnToggleMute, mockOnTogglePin, mockOnRemove);

      const firstRepo = repoList.querySelectorAll('.repo-item')[0];
      expect(firstRepo.textContent).toContain('999');
      expect(firstRepo.textContent).not.toContain('k');
    });

    test('should handle repos without language', () => {
      mockState.watchedRepos = [
        {
          fullName: 'test/repo',
          description: 'Test',
          language: null,
          stars: 100,
          updatedAt: '2024-01-15T10:00:00Z'
        }
      ];

      renderRepoList(mockState, mockOnToggleMute, mockOnTogglePin, mockOnRemove);

      const firstRepo = repoList.querySelectorAll('.repo-item')[0];
      expect(firstRepo.querySelector('.repo-meta').textContent).not.toContain('null');
    });

    test('should handle repos without description', () => {
      mockState.watchedRepos = [
        {
          fullName: 'test/repo',
          description: null,
          language: 'JavaScript',
          stars: 100,
          updatedAt: '2024-01-15T10:00:00Z'
        }
      ];

      renderRepoList(mockState, mockOnToggleMute, mockOnTogglePin, mockOnRemove);

      const firstRepo = repoList.querySelectorAll('.repo-item')[0];
      const description = firstRepo.querySelector('.repo-description');
      expect(description.textContent).toBe('');
    });

    test('should handle repos with missing or invalid star counts', () => {
      mockState.watchedRepos = [
        {
          fullName: 'test/repo1',
          description: 'Test',
          language: 'JavaScript',
          stars: null,
          updatedAt: '2024-01-15T10:00:00Z'
        },
        {
          fullName: 'test/repo2',
          description: 'Test',
          language: 'JavaScript',
          stars: undefined,
          updatedAt: '2024-01-15T10:00:00Z'
        }
      ];

      renderRepoList(mockState, mockOnToggleMute, mockOnTogglePin, mockOnRemove);

      const repos = repoList.querySelectorAll('.repo-item');
      expect(repos[0].textContent).toContain('0');
      expect(repos[1].textContent).toContain('0');
    });
  });

  describe('muted and pinned states', () => {
    beforeEach(() => {
      mockState.watchedRepos = [
        {
          fullName: 'facebook/react',
          description: 'Test',
          language: 'JavaScript',
          stars: 100,
          updatedAt: '2024-01-15T10:00:00Z'
        },
        {
          fullName: 'microsoft/vscode',
          description: 'Test',
          language: 'TypeScript',
          stars: 100,
          updatedAt: '2024-01-15T10:00:00Z'
        }
      ];
      mockState.mutedRepos = ['facebook/react'];
      mockState.pinnedRepos = ['microsoft/vscode'];
    });

    test('should apply muted class to muted repos', () => {
      renderRepoList(mockState, mockOnToggleMute, mockOnTogglePin, mockOnRemove);

      const repos = repoList.querySelectorAll('.repo-item');
      // After sorting: microsoft/vscode (pinned) is first, facebook/react (muted) is second
      expect(repos[0].classList.contains('muted')).toBe(false); // vscode not muted
      expect(repos[1].classList.contains('muted')).toBe(true); // react is muted
    });

    test('should apply pinned class to pinned repos', () => {
      renderRepoList(mockState, mockOnToggleMute, mockOnTogglePin, mockOnRemove);

      const repos = repoList.querySelectorAll('.repo-item');
      expect(repos[0].classList.contains('pinned')).toBe(true);
      expect(repos[1].classList.contains('pinned')).toBe(false);
    });

    test('should sort pinned repos to the top', () => {
      renderRepoList(mockState, mockOnToggleMute, mockOnTogglePin, mockOnRemove);

      const repos = repoList.querySelectorAll('.repo-item');
      // microsoft/vscode should be first because it's pinned
      expect(repos[0].textContent).toContain('microsoft/vscode');
      expect(repos[1].textContent).toContain('facebook/react');
    });
  });

  describe('pagination', () => {
    beforeEach(() => {
      // Create 25 repos to test pagination (more than 10 per page)
      mockState.watchedRepos = Array.from({ length: 25 }, (_, i) => ({
        fullName: `test/repo${i}`,
        description: `Description ${i}`,
        language: 'JavaScript',
        stars: 100,
        updatedAt: '2024-01-15T10:00:00Z'
      }));
    });

    test('should show pagination controls when repos exceed page size', () => {
      renderRepoList(mockState, mockOnToggleMute, mockOnTogglePin, mockOnRemove);

      expect(paginationControls.style.display).toBe('flex');
      expect(pageInfo.textContent).toBe('Page 1 of 3');
    });

    test('should display correct number of repos per page', () => {
      renderRepoList(mockState, mockOnToggleMute, mockOnTogglePin, mockOnRemove);

      const repoItems = repoList.querySelectorAll('.repo-item');
      expect(repoItems.length).toBe(10); // reposPerPage is 10
    });

    test('should disable previous button on first page', () => {
      mockState.currentPage = 1;
      renderRepoList(mockState, mockOnToggleMute, mockOnTogglePin, mockOnRemove);

      expect(prevPageBtn.disabled).toBe(true);
      expect(nextPageBtn.disabled).toBe(false);
    });

    test('should disable next button on last page', () => {
      mockState.currentPage = 3;
      renderRepoList(mockState, mockOnToggleMute, mockOnTogglePin, mockOnRemove);

      expect(prevPageBtn.disabled).toBe(false);
      expect(nextPageBtn.disabled).toBe(true);
      expect(pageInfo.textContent).toBe('Page 3 of 3');
    });

    test('should hide pagination when repos fit on one page', () => {
      mockState.watchedRepos = Array.from({ length: 5 }, (_, i) => ({
        fullName: `test/repo${i}`,
        description: 'Test',
        language: 'JavaScript',
        stars: 100,
        updatedAt: '2024-01-15T10:00:00Z'
      }));

      renderRepoList(mockState, mockOnToggleMute, mockOnTogglePin, mockOnRemove);

      expect(paginationControls.style.display).toBe('none');
    });
  });

  describe('search filtering', () => {
    beforeEach(() => {
      mockState.watchedRepos = [
        {
          fullName: 'facebook/react',
          description: 'A JavaScript library',
          language: 'JavaScript',
          stars: 100,
          updatedAt: '2024-01-15T10:00:00Z'
        },
        {
          fullName: 'vuejs/vue',
          description: 'The Progressive Framework',
          language: 'JavaScript',
          stars: 100,
          updatedAt: '2024-01-15T10:00:00Z'
        },
        {
          fullName: 'angular/angular',
          description: 'One framework',
          language: 'TypeScript',
          stars: 100,
          updatedAt: '2024-01-15T10:00:00Z'
        }
      ];
    });

    test('should filter repos by name', () => {
      mockState.searchQuery = 'react';
      renderRepoList(mockState, mockOnToggleMute, mockOnTogglePin, mockOnRemove);

      const repoItems = repoList.querySelectorAll('.repo-item');
      expect(repoItems.length).toBe(1);
      expect(repoItems[0].textContent).toContain('facebook/react');
    });

    test('should filter repos by description', () => {
      mockState.searchQuery = 'progressive';
      renderRepoList(mockState, mockOnToggleMute, mockOnTogglePin, mockOnRemove);

      const repoItems = repoList.querySelectorAll('.repo-item');
      expect(repoItems.length).toBe(1);
      expect(repoItems[0].textContent).toContain('vuejs/vue');
    });

    test('should filter repos by language', () => {
      mockState.searchQuery = 'typescript';
      renderRepoList(mockState, mockOnToggleMute, mockOnTogglePin, mockOnRemove);

      const repoItems = repoList.querySelectorAll('.repo-item');
      expect(repoItems.length).toBe(1);
      expect(repoItems[0].textContent).toContain('angular/angular');
    });

    test('should be case insensitive', () => {
      mockState.searchQuery = 'REACT';
      renderRepoList(mockState, mockOnToggleMute, mockOnTogglePin, mockOnRemove);

      const repoItems = repoList.querySelectorAll('.repo-item');
      expect(repoItems.length).toBe(1);
    });

    test('should show message when search returns no results', () => {
      mockState.searchQuery = 'nonexistent';
      renderRepoList(mockState, mockOnToggleMute, mockOnTogglePin, mockOnRemove);

      expect(repoList.textContent).toContain('No repositories match your search');
      expect(paginationControls.style.display).toBe('none');
    });
  });

  describe('hide pinned repos', () => {
    beforeEach(() => {
      mockState.watchedRepos = [
        {
          fullName: 'facebook/react',
          description: 'Test',
          language: 'JavaScript',
          stars: 100,
          updatedAt: '2024-01-15T10:00:00Z'
        },
        {
          fullName: 'vuejs/vue',
          description: 'Test',
          language: 'JavaScript',
          stars: 100,
          updatedAt: '2024-01-15T10:00:00Z'
        }
      ];
      mockState.pinnedRepos = ['facebook/react'];
    });

    test('should hide pinned repos when hidePinnedRepos is true', () => {
      mockState.hidePinnedRepos = true;
      renderRepoList(mockState, mockOnToggleMute, mockOnTogglePin, mockOnRemove);

      const repoItems = repoList.querySelectorAll('.repo-item');
      expect(repoItems.length).toBe(1);
      expect(repoItems[0].textContent).toContain('vuejs/vue');
    });

    test('should show pinned repos when hidePinnedRepos is false', () => {
      mockState.hidePinnedRepos = false;
      renderRepoList(mockState, mockOnToggleMute, mockOnTogglePin, mockOnRemove);

      const repoItems = repoList.querySelectorAll('.repo-item');
      expect(repoItems.length).toBe(2);
    });
  });

  describe('event handlers', () => {
    beforeEach(() => {
      mockState.watchedRepos = [
        {
          fullName: 'facebook/react',
          description: 'Test',
          language: 'JavaScript',
          stars: 100,
          updatedAt: '2024-01-15T10:00:00Z'
        }
      ];
      mockState.mutedRepos = ['facebook/react'];
      mockState.pinnedRepos = [];
    });

    test('should call onTogglePin when pin button is clicked', () => {
      renderRepoList(mockState, mockOnToggleMute, mockOnTogglePin, mockOnRemove);

      const pinBtn = repoList.querySelector('.pin-btn');
      pinBtn.click();

      expect(mockOnTogglePin).toHaveBeenCalledWith('facebook/react', true);
    });

    test('should call onToggleMute when mute button is clicked', () => {
      renderRepoList(mockState, mockOnToggleMute, mockOnTogglePin, mockOnRemove);

      const muteBtn = repoList.querySelector('.mute-btn');
      muteBtn.click();

      expect(mockOnToggleMute).toHaveBeenCalledWith('facebook/react', false);
    });

    test('should call onRemove when remove button is clicked', () => {
      renderRepoList(mockState, mockOnToggleMute, mockOnTogglePin, mockOnRemove);

      const removeBtn = repoList.querySelector('button.danger');
      removeBtn.click();

      expect(mockOnRemove).toHaveBeenCalledWith('facebook/react');
    });

    test('should not call handlers if they are not provided', () => {
      renderRepoList(mockState, null, null, null);

      const pinBtn = repoList.querySelector('.pin-btn');
      const muteBtn = repoList.querySelector('.mute-btn');
      const removeBtn = repoList.querySelector('button.danger');

      // Should not throw
      pinBtn.click();
      muteBtn.click();
      removeBtn.click();
    });
  });

  describe('security - XSS prevention', () => {
    test('should escape HTML entities in displayed repository names', () => {
      mockState.watchedRepos = [
        {
          fullName: '<script>alert("xss")</script>',
          description: 'Test',
          language: 'JavaScript',
          stars: 100,
          updatedAt: '2024-01-15T10:00:00Z'
        }
      ];

      renderRepoList(mockState, mockOnToggleMute, mockOnTogglePin, mockOnRemove);

      // Verify escaping in displayed content
      const repoName = repoList.querySelector('.repo-name');
      expect(repoName.innerHTML).toContain('&lt;script&gt;');
      expect(repoName.textContent).toContain('<script>');
    });

    test('should escape HTML in descriptions', () => {
      mockState.watchedRepos = [
        {
          fullName: 'test/repo',
          description: '<img src=x onerror=alert(1)>',
          language: 'JavaScript',
          stars: 100,
          updatedAt: '2024-01-15T10:00:00Z'
        }
      ];

      renderRepoList(mockState, mockOnToggleMute, mockOnTogglePin, mockOnRemove);

      const description = repoList.querySelector('.repo-description');
      expect(description.innerHTML).toContain('&lt;img');
      expect(description.textContent).toContain('<img');
    });

    test('should escape HTML in language', () => {
      mockState.watchedRepos = [
        {
          fullName: 'test/repo',
          description: 'Test',
          language: '<b>Bold</b>',
          stars: 100,
          updatedAt: '2024-01-15T10:00:00Z'
        }
      ];

      renderRepoList(mockState, mockOnToggleMute, mockOnTogglePin, mockOnRemove);

      const meta = repoList.querySelector('.repo-meta');
      expect(meta.innerHTML).toContain('&lt;b&gt;');
      expect(meta.textContent).toContain('<b>Bold</b>');
    });
  });
});
