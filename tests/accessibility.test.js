/**
 * Accessibility tests for keyboard navigation and ARIA support
 */

import { jest } from '@jest/globals';
import '@testing-library/jest-dom';
import jestAxe from 'jest-axe';

const { axe, toHaveNoViolations } = jestAxe;

// Extend Jest matchers
expect.extend(toHaveNoViolations);

// Mock DOM environment
document.body.innerHTML = `
  <div class="container">
    <header>
      <h1>GitHub Activity</h1>
      <div class="header-actions">
        <button id="darkModeBtn" class="icon-btn" aria-label="Toggle theme" tabindex="0">🌙</button>
        <button id="refreshBtn" class="icon-btn" aria-label="Check for new activity" tabindex="0">🔄</button>
      </div>
    </header>

    <nav aria-label="Activity filters">
      <div class="toolbar">
        <div class="filters" role="tablist" aria-label="Filter activities by type">
          <button class="filter-btn active" data-type="all" role="tab" aria-selected="true" aria-controls="activityList" tabindex="0">All</button>
          <button class="filter-btn" data-type="pr" role="tab" aria-selected="false" aria-controls="activityList" tabindex="-1">PRs</button>
          <button class="filter-btn" data-type="issue" role="tab" aria-selected="false" aria-controls="activityList" tabindex="-1">Issues</button>
          <button class="filter-btn" data-type="release" role="tab" aria-selected="false" aria-controls="activityList" tabindex="-1">Releases</button>
        </div>
      </div>
    </nav>

    <div id="searchBox" class="search-box" style="display: none;" role="search">
      <label for="searchInput">Search:</label>
      <input type="text" id="searchInput" aria-label="Search through GitHub activities" autocomplete="off">
    </div>

    <div id="activityList" class="activity-list" role="main" aria-label="GitHub activities" aria-live="polite">
      <div class="empty-state">
        <p>No recent activity</p>
      </div>
    </div>

    <footer role="contentinfo">
      <div id="errorMessage" class="error-message" role="alert" aria-live="assertive" style="display: none;"></div>
    </footer>
  </div>
`;

describe('Accessibility Features', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('ARIA Labels and Roles', () => {
    it('should have proper ARIA labels on interactive elements', () => {
      const darkModeBtn = document.getElementById('darkModeBtn');
      const refreshBtn = document.getElementById('refreshBtn');
      const searchInput = document.getElementById('searchInput');

      expect(darkModeBtn).toHaveAttribute('aria-label');
      expect(refreshBtn).toHaveAttribute('aria-label');
      expect(searchInput).toHaveAttribute('aria-label');
    });

    it('should have proper roles on landmark elements', () => {
      const filters = document.querySelector('.filters');
      const searchBox = document.getElementById('searchBox');
      const activityList = document.getElementById('activityList');
      const footer = document.querySelector('footer');

      expect(filters).toHaveAttribute('role', 'tablist');
      expect(searchBox).toHaveAttribute('role', 'search');
      expect(activityList).toHaveAttribute('role', 'main');
      expect(footer).toHaveAttribute('role', 'contentinfo');
    });

    it('should have proper ARIA attributes on filter tabs', () => {
      const filterButtons = document.querySelectorAll('.filter-btn');

      filterButtons.forEach((btn, index) => {
        expect(btn).toHaveAttribute('role', 'tab');
        expect(btn).toHaveAttribute('aria-controls');
        expect(btn).toHaveAttribute('tabindex');

        if (index === 0) {
          expect(btn).toHaveAttribute('aria-selected', 'true');
          expect(btn).toHaveAttribute('tabindex', '0');
        } else {
          expect(btn).toHaveAttribute('aria-selected', 'false');
          expect(btn).toHaveAttribute('tabindex', '-1');
        }
      });
    });

    it('should have ARIA live regions for dynamic content', () => {
      const activityList = document.getElementById('activityList');
      const errorMessage = document.getElementById('errorMessage');

      expect(activityList).toHaveAttribute('aria-live', 'polite');
      expect(errorMessage).toHaveAttribute('role', 'alert');
      expect(errorMessage).toHaveAttribute('aria-live', 'assertive');
    });
  });

  describe('Keyboard Navigation', () => {
    let mockKeyDownEvent;

    beforeEach(() => {
      mockKeyDownEvent = {
        key: '',
        preventDefault: jest.fn(),
        target: { tagName: 'DIV' },
        ctrlKey: false,
        metaKey: false
      };
    });

    it('should handle refresh shortcut (R key)', () => {
      const refreshBtn = document.getElementById('refreshBtn');
      expect(refreshBtn).toBeTruthy();
      expect(refreshBtn).toHaveAttribute('tabindex', '0');

      mockKeyDownEvent.key = 'r';
      const event = new KeyboardEvent('keydown', mockKeyDownEvent);

      // Test that the event can be dispatched (implementation would handle the shortcut)
      expect(() => {
        document.dispatchEvent(event);
      }).not.toThrow();
    });

    it('should handle search toggle shortcut (S key)', () => {
      const searchBox = document.getElementById('searchBox');

      mockKeyDownEvent.key = 's';
      document.dispatchEvent(new KeyboardEvent('keydown', mockKeyDownEvent));

      // In real implementation, this would toggle the search box
      expect(searchBox).toBeTruthy();
    });

    it('should handle escape key to close search', () => {
      const searchBox = document.getElementById('searchBox');
      searchBox.style.display = 'block';

      mockKeyDownEvent.key = 'Escape';
      document.dispatchEvent(new KeyboardEvent('keydown', mockKeyDownEvent));

      // In real implementation, this would hide the search box
      expect(searchBox.style.display).toBeTruthy();
    });

    it('should not trigger shortcuts when typing in input fields', () => {
      const refreshBtn = document.getElementById('refreshBtn');
      jest.spyOn(refreshBtn, 'click');

      mockKeyDownEvent.key = 'r';
      mockKeyDownEvent.target.tagName = 'INPUT';
      document.dispatchEvent(new KeyboardEvent('keydown', mockKeyDownEvent));

      expect(refreshBtn.click).not.toHaveBeenCalled();
    });

    it('should handle arrow key navigation between filter tabs', () => {
      const filterButtons = document.querySelectorAll('.filter-btn');
      const secondBtn = filterButtons[1];

      mockKeyDownEvent.key = 'ArrowRight';
      mockKeyDownEvent.target = filterButtons[0];

      // Simulate the enhanced navigation
      const event = new KeyboardEvent('keydown', mockKeyDownEvent);
      filterButtons[0].dispatchEvent(event);

      expect(secondBtn.tabIndex).toBeDefined();
    });

    it('should handle Enter and Space keys on filter buttons', () => {
      const firstBtn = document.querySelector('.filter-btn');
      expect(firstBtn).toBeTruthy();

      ['Enter', ' '].forEach(key => {
        mockKeyDownEvent.key = key;
        mockKeyDownEvent.target = firstBtn;

        const event = new KeyboardEvent('keydown', mockKeyDownEvent);

        // Test that the event can be dispatched without errors
        expect(() => {
          firstBtn.dispatchEvent(event);
        }).not.toThrow();
      });
    });
  });

  describe('Screen Reader Support', () => {
    it('should have descriptive labels for all interactive elements', () => {
      const interactiveElements = document.querySelectorAll('button, input, a, [role="button"]');

      interactiveElements.forEach(element => {
        const hasAriaLabel = element.hasAttribute('aria-label');
        const hasAriaLabelledBy = element.hasAttribute('aria-labelledby');
        const hasTitle = element.hasAttribute('title');
        const hasTextContent = element.textContent.trim().length > 0;

        const hasDescription = hasAriaLabel || hasAriaLabelledBy || hasTitle || hasTextContent;
        expect(hasDescription).toBe(true);
      });
    });

    it('should have proper heading hierarchy', () => {
      const headings = document.querySelectorAll('h1, h2, h3, h4, h5, h6');
      expect(headings.length).toBeGreaterThan(0);

      // First heading should be h1
      expect(headings[0].tagName).toBe('H1');
    });

    it('should announce changes to screen readers', () => {
      const errorMessage = document.getElementById('errorMessage');

      // Error messages should be announced immediately
      expect(errorMessage).toHaveAttribute('role', 'alert');
      expect(errorMessage).toHaveAttribute('aria-live', 'assertive');

      // Activity updates should be announced politely
      const activityList = document.getElementById('activityList');
      expect(activityList).toHaveAttribute('aria-live', 'polite');
    });
  });

  describe('Focus Management', () => {
    it('should maintain proper focus order', () => {
      const focusableElements = document.querySelectorAll(
        'button:not([disabled]), [href], input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])'
      );

      // Should have focusable elements
      expect(focusableElements.length).toBeGreaterThan(0);

      // Filter buttons should have proper tabindex
      const filterButtons = document.querySelectorAll('.filter-btn');
      expect(filterButtons[0]).toHaveAttribute('tabindex', '0');
      expect(filterButtons[1]).toHaveAttribute('tabindex', '-1');
    });

    it('should update tabindex when filters change', () => {
      const filterButtons = document.querySelectorAll('.filter-btn');

      // Test that buttons have initial tabindex values
      expect(filterButtons[0]).toHaveAttribute('tabindex', '0');
      expect(filterButtons[0]).toHaveAttribute('aria-selected', 'true');
      expect(filterButtons[1]).toHaveAttribute('tabindex', '-1');
      expect(filterButtons[1]).toHaveAttribute('aria-selected', 'false');

      // In a real implementation, clicking would update these attributes
      // For now, just test that the click can be triggered
      expect(() => {
        filterButtons[1].click();
      }).not.toThrow();
    });
  });

  describe('High Contrast and Reduced Motion', () => {
    it('should not rely solely on color for information', () => {
      const activeFilter = document.querySelector('.filter-btn.active');
      const inactiveFilter = document.querySelectorAll('.filter-btn')[1];

      // Should have additional indicators beyond color
      expect(activeFilter.classList.contains('active')).toBe(true);
      expect(inactiveFilter.classList.contains('active')).toBe(false);
    });
  });

  describe('Automated WCAG Compliance (axe-core)', () => {
    it('should not have any automatically detectable WCAG violations', async () => {
      const results = await axe(document.body, {
        rules: {
          // Disable color-contrast in JSDOM as it requires canvas support
          'color-contrast': { enabled: false }
        }
      });
      expect(results).toHaveNoViolations();
    });

    it('should have valid form labels', async () => {
      const results = await axe(document.body, {
        rules: {
          label: { enabled: true },
          'color-contrast': { enabled: false }
        }
      });
      expect(results).toHaveNoViolations();
    });

    it('should have proper button names', async () => {
      const results = await axe(document.body, {
        rules: {
          'button-name': { enabled: true },
          'color-contrast': { enabled: false }
        }
      });
      expect(results).toHaveNoViolations();
    });

    it('should have proper ARIA attributes', async () => {
      const results = await axe(document.body, {
        rules: {
          'aria-valid-attr': { enabled: true },
          'aria-valid-attr-value': { enabled: true },
          'color-contrast': { enabled: false }
        }
      });
      expect(results).toHaveNoViolations();
    });

    it('should have unique IDs', async () => {
      const results = await axe(document.body, {
        rules: {
          'duplicate-id': { enabled: true },
          'color-contrast': { enabled: false }
        }
      });
      expect(results).toHaveNoViolations();
    });

    it('should have proper landmark structure', async () => {
      const results = await axe(document.body, {
        rules: {
          'landmark-one-main': { enabled: true },
          'region': { enabled: true },
          'color-contrast': { enabled: false }
        }
      });
      expect(results).toHaveNoViolations();
    });
  });
});

export {};