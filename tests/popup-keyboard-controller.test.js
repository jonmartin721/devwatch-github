import { jest, describe, test, beforeEach, expect } from '@jest/globals';
import {
  setupKeyboardNavigation,
  updateFilterButtonAria
} from '../popup/controllers/keyboard-controller.js';

describe('Keyboard Controller', () => {
  beforeEach(() => {
    document.body.innerHTML = `
      <input id="searchBox" style="display: none" />
      <button class="filter-btn">All</button>
      <button class="filter-btn active">Unread</button>
      <button class="filter-btn">PRs</button>
    `;
  });

  describe('setupKeyboardNavigation', () => {
    test('handles "r" key for refresh', () => {
      const mockRefresh = jest.fn();
      const mockToggleSearch = jest.fn();
      const mockToggleArchive = jest.fn();

      setupKeyboardNavigation(mockRefresh, mockToggleSearch, mockToggleArchive);

      const event = new KeyboardEvent('keydown', { key: 'r' });
      document.dispatchEvent(event);

      expect(mockRefresh).toHaveBeenCalled();
    });

    test('handles "s" key for search toggle', () => {
      const mockRefresh = jest.fn();
      const mockToggleSearch = jest.fn();
      const mockToggleArchive = jest.fn();

      setupKeyboardNavigation(mockRefresh, mockToggleSearch, mockToggleArchive);

      const event = new KeyboardEvent('keydown', { key: 's' });
      document.dispatchEvent(event);

      expect(mockToggleSearch).toHaveBeenCalled();
    });

    test('handles "a" key for archive toggle', () => {
      const mockRefresh = jest.fn();
      const mockToggleSearch = jest.fn();
      const mockToggleArchive = jest.fn();

      setupKeyboardNavigation(mockRefresh, mockToggleSearch, mockToggleArchive);

      const event = new KeyboardEvent('keydown', { key: 'a' });
      document.dispatchEvent(event);

      expect(mockToggleArchive).toHaveBeenCalled();
    });

    test('handles Escape key to close search', () => {
      const mockRefresh = jest.fn();
      const mockToggleSearch = jest.fn();
      const mockToggleArchive = jest.fn();
      const searchBox = document.getElementById('searchBox');
      searchBox.style.display = 'block';

      setupKeyboardNavigation(mockRefresh, mockToggleSearch, mockToggleArchive);

      const event = new KeyboardEvent('keydown', { key: 'Escape' });
      document.dispatchEvent(event);

      expect(mockToggleSearch).toHaveBeenCalled();
    });

    test('ignores shortcuts when in input fields', () => {
      const mockRefresh = jest.fn();
      const mockToggleSearch = jest.fn();
      const mockToggleArchive = jest.fn();
      const input = document.getElementById('searchBox');

      setupKeyboardNavigation(mockRefresh, mockToggleSearch, mockToggleArchive);

      const event = new KeyboardEvent('keydown', { key: 'r', bubbles: true });
      Object.defineProperty(event, 'target', { value: input, enumerable: true });
      input.dispatchEvent(event);

      expect(mockRefresh).not.toHaveBeenCalled();
    });

    test('ignores shortcuts with ctrl/meta modifiers', () => {
      const mockRefresh = jest.fn();
      const mockToggleSearch = jest.fn();
      const mockToggleArchive = jest.fn();

      setupKeyboardNavigation(mockRefresh, mockToggleSearch, mockToggleArchive);

      const event = new KeyboardEvent('keydown', { key: 'r', ctrlKey: true });
      document.dispatchEvent(event);

      expect(mockRefresh).not.toHaveBeenCalled();
    });

    test('handles ArrowRight on filter buttons', () => {
      const mockRefresh = jest.fn();
      const mockToggleSearch = jest.fn();
      const mockToggleArchive = jest.fn();

      setupKeyboardNavigation(mockRefresh, mockToggleSearch, mockToggleArchive);

      const buttons = document.querySelectorAll('.filter-btn');
      const clickSpy = jest.spyOn(buttons[1], 'click');
      const focusSpy = jest.spyOn(buttons[1], 'focus');

      const event = new KeyboardEvent('keydown', { key: 'ArrowRight' });
      buttons[0].dispatchEvent(event);

      expect(focusSpy).toHaveBeenCalled();
      expect(clickSpy).toHaveBeenCalled();
    });

    test('handles ArrowLeft on filter buttons', () => {
      const mockRefresh = jest.fn();
      const mockToggleSearch = jest.fn();
      const mockToggleArchive = jest.fn();

      setupKeyboardNavigation(mockRefresh, mockToggleSearch, mockToggleArchive);

      const buttons = document.querySelectorAll('.filter-btn');
      const clickSpy = jest.spyOn(buttons[0], 'click');
      const focusSpy = jest.spyOn(buttons[0], 'focus');

      const event = new KeyboardEvent('keydown', { key: 'ArrowLeft' });
      buttons[1].dispatchEvent(event);

      expect(focusSpy).toHaveBeenCalled();
      expect(clickSpy).toHaveBeenCalled();
    });

    test('wraps around filter buttons navigation', () => {
      const mockRefresh = jest.fn();
      const mockToggleSearch = jest.fn();
      const mockToggleArchive = jest.fn();

      setupKeyboardNavigation(mockRefresh, mockToggleSearch, mockToggleArchive);

      const buttons = document.querySelectorAll('.filter-btn');
      const focusSpy = jest.spyOn(buttons[0], 'focus');

      // ArrowRight on last button should wrap to first
      const event = new KeyboardEvent('keydown', { key: 'ArrowRight' });
      buttons[buttons.length - 1].dispatchEvent(event);

      expect(focusSpy).toHaveBeenCalled();
    });

    test('handles Enter key on filter buttons', () => {
      const mockRefresh = jest.fn();
      const mockToggleSearch = jest.fn();
      const mockToggleArchive = jest.fn();

      setupKeyboardNavigation(mockRefresh, mockToggleSearch, mockToggleArchive);

      const buttons = document.querySelectorAll('.filter-btn');
      const clickSpy = jest.spyOn(buttons[0], 'click');

      const event = new KeyboardEvent('keydown', { key: 'Enter' });
      buttons[0].dispatchEvent(event);

      expect(clickSpy).toHaveBeenCalled();
    });

    test('handles Space key on filter buttons', () => {
      const mockRefresh = jest.fn();
      const mockToggleSearch = jest.fn();
      const mockToggleArchive = jest.fn();

      setupKeyboardNavigation(mockRefresh, mockToggleSearch, mockToggleArchive);

      const buttons = document.querySelectorAll('.filter-btn');
      const clickSpy = jest.spyOn(buttons[0], 'click');

      const event = new KeyboardEvent('keydown', { key: ' ' });
      buttons[0].dispatchEvent(event);

      expect(clickSpy).toHaveBeenCalled();
    });
  });

  describe('updateFilterButtonAria', () => {
    test('sets ARIA attributes for active button', () => {
      updateFilterButtonAria();

      const activeButton = document.querySelector('.filter-btn.active');
      expect(activeButton.getAttribute('aria-selected')).toBe('true');
      expect(activeButton.getAttribute('tabindex')).toBe('0');
    });

    test('sets ARIA attributes for inactive buttons', () => {
      updateFilterButtonAria();

      const inactiveButtons = document.querySelectorAll('.filter-btn:not(.active)');
      inactiveButtons.forEach(btn => {
        expect(btn.getAttribute('aria-selected')).toBe('false');
        expect(btn.getAttribute('tabindex')).toBe('-1');
      });
    });
  });
});
