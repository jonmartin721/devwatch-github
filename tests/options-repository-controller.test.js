import { jest, describe, test, beforeEach, expect } from '@jest/globals';
import {
  toggleMuteRepo,
  trackRepoUnmuted,
  togglePinRepo
} from '../options/controllers/repository-controller.js';

describe('Options Repository Controller', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    global.chrome = {
      storage: {
        sync: {
          set: jest.fn().mockResolvedValue(undefined),
          get: jest.fn()
        }
      }
    };
  });

  describe('toggleMuteRepo', () => {
    test('mutes a repository', async () => {
      const state = { mutedRepos: [] };
      const mockRender = jest.fn();

      await toggleMuteRepo('owner/repo', true, state, mockRender);

      expect(state.mutedRepos).toContain('owner/repo');
      expect(chrome.storage.sync.set).toHaveBeenCalledWith({
        mutedRepos: ['owner/repo']
      });
      expect(mockRender).toHaveBeenCalled();
    });

    test('unmutes a repository', async () => {
      const state = { mutedRepos: ['owner/repo'] };
      const mockRender = jest.fn();
      chrome.storage.sync.get.mockResolvedValue({ unmutedRepos: [] });

      await toggleMuteRepo('owner/repo', false, state, mockRender);

      expect(state.mutedRepos).not.toContain('owner/repo');
      expect(chrome.storage.sync.set).toHaveBeenCalledWith({
        mutedRepos: []
      });
      expect(mockRender).toHaveBeenCalled();
    });

    test('does not duplicate muted repositories', async () => {
      const state = { mutedRepos: ['owner/repo'] };
      const mockRender = jest.fn();

      await toggleMuteRepo('owner/repo', true, state, mockRender);

      expect(state.mutedRepos).toEqual(['owner/repo']);
    });

    test('works without render callback', async () => {
      const state = { mutedRepos: [] };

      await expect(
        toggleMuteRepo('owner/repo', true, state, null)
      ).resolves.not.toThrow();

      expect(state.mutedRepos).toContain('owner/repo');
    });
  });

  describe('trackRepoUnmuted', () => {
    test('tracks newly unmuted repository', async () => {
      chrome.storage.sync.get.mockResolvedValue({ unmutedRepos: [] });

      await trackRepoUnmuted('owner/repo');

      expect(chrome.storage.sync.set).toHaveBeenCalledWith({
        unmutedRepos: expect.arrayContaining([
          expect.objectContaining({
            repo: 'owner/repo',
            unmutedAt: expect.any(String)
          })
        ])
      });
    });

    test('updates existing unmute tracking', async () => {
      chrome.storage.sync.get.mockResolvedValue({
        unmutedRepos: [
          { repo: 'owner/repo', unmutedAt: '2025-01-01T00:00:00Z' }
        ]
      });

      await trackRepoUnmuted('owner/repo');

      expect(chrome.storage.sync.set).toHaveBeenCalledWith({
        unmutedRepos: expect.arrayContaining([
          expect.objectContaining({
            repo: 'owner/repo'
          })
        ])
      });
    });

    test('limits tracking to 100 entries', async () => {
      const unmutedRepos = Array.from({ length: 100 }, (_, i) => ({
        repo: `owner/repo${i}`,
        unmutedAt: new Date().toISOString()
      }));
      chrome.storage.sync.get.mockResolvedValue({ unmutedRepos });

      await trackRepoUnmuted('owner/newrepo');

      expect(chrome.storage.sync.set).toHaveBeenCalledWith({
        unmutedRepos: expect.arrayContaining([
          expect.objectContaining({ repo: 'owner/newrepo' })
        ])
      });

      const savedData = chrome.storage.sync.set.mock.calls[0][0];
      expect(savedData.unmutedRepos.length).toBeLessThanOrEqual(100);
    });

    test('handles errors gracefully', async () => {
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
      chrome.storage.sync.get.mockRejectedValue(new Error('Storage error'));

      await expect(trackRepoUnmuted('owner/repo')).resolves.not.toThrow();

      expect(consoleErrorSpy).toHaveBeenCalled();
      consoleErrorSpy.mockRestore();
    });
  });

  describe('togglePinRepo', () => {
    test('pins a repository', async () => {
      const state = { pinnedRepos: [] };
      const mockRender = jest.fn();

      await togglePinRepo('owner/repo', true, state, mockRender);

      expect(state.pinnedRepos).toContain('owner/repo');
      expect(chrome.storage.sync.set).toHaveBeenCalledWith({
        pinnedRepos: ['owner/repo']
      });
      expect(mockRender).toHaveBeenCalled();
    });

    test('unpins a repository', async () => {
      const state = { pinnedRepos: ['owner/repo'] };
      const mockRender = jest.fn();

      await togglePinRepo('owner/repo', false, state, mockRender);

      expect(state.pinnedRepos).not.toContain('owner/repo');
      expect(chrome.storage.sync.set).toHaveBeenCalledWith({
        pinnedRepos: []
      });
      expect(mockRender).toHaveBeenCalled();
    });

    test('does not duplicate pinned repositories', async () => {
      const state = { pinnedRepos: ['owner/repo'] };
      const mockRender = jest.fn();

      await togglePinRepo('owner/repo', true, state, mockRender);

      expect(state.pinnedRepos).toEqual(['owner/repo']);
    });

    test('works without render callback', async () => {
      const state = { pinnedRepos: [] };

      await expect(
        togglePinRepo('owner/repo', true, state, null)
      ).resolves.not.toThrow();

      expect(state.pinnedRepos).toContain('owner/repo');
    });
  });
});
