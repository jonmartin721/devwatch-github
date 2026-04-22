import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { expect, jest } from '@jest/globals';
import '@testing-library/jest-dom';
import jestAxe from 'jest-axe';

const { axe, toHaveNoViolations } = jestAxe;

expect.extend(toHaveNoViolations);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const optionsHtml = readFileSync(
  path.join(__dirname, '..', 'options', 'options.html'),
  'utf8'
);
const bodyMarkup = optionsHtml.match(/<body[^>]*>([\s\S]*)<\/body>/i)?.[1] ?? optionsHtml;

const { setupTabNavigation } = await import('../options/options.js');

function loadOptionsFixture() {
  localStorage.clear();
  history.replaceState(null, '', '/options/options.html');
  document.body.innerHTML = bodyMarkup;
}

function getTab(tabName) {
  return document.querySelector(`.tab-button[data-tab="${tabName}"]`);
}

function getPanel(tabName) {
  return document.querySelector(`.tab-panel[data-tab="${tabName}"]`);
}

describe('Options accessibility', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    loadOptionsFixture();
  });

  it('uses shipped tablist and tabpanel relationships', () => {
    setupTabNavigation();

    const tablist = document.querySelector('[role="tablist"]');
    const tabs = Array.from(document.querySelectorAll('[role="tab"]'));
    const panels = Array.from(document.querySelectorAll('[role="tabpanel"]'));

    expect(tablist).toHaveAttribute('aria-orientation', 'vertical');
    expect(tabs).toHaveLength(6);
    expect(panels).toHaveLength(6);

    tabs.forEach(tab => {
      const panelId = tab.getAttribute('aria-controls');
      const panel = document.getElementById(panelId);

      expect(tab).toHaveAttribute('id');
      expect(panel).toHaveAttribute('role', 'tabpanel');
      expect(panel).toHaveAttribute('aria-labelledby', tab.id);
    });
  });

  it('activates the saved tab with roving tabindex and hidden panels', () => {
    localStorage.setItem('activeTab', 'filters');

    setupTabNavigation();

    expect(getTab('filters')).toHaveAttribute('aria-selected', 'true');
    expect(getTab('filters')).toHaveAttribute('tabindex', '0');
    expect(getPanel('filters')).not.toHaveAttribute('hidden');

    expect(getTab('setup')).toHaveAttribute('aria-selected', 'false');
    expect(getTab('setup')).toHaveAttribute('tabindex', '-1');
    expect(getPanel('setup')).toHaveAttribute('hidden');
  });

  it('supports arrow-key navigation in the shipped tab order', () => {
    setupTabNavigation();

    const tabs = Array.from(document.querySelectorAll('[role="tab"]'));
    const setupTab = getTab('setup');
    const setupIndex = tabs.indexOf(setupTab);
    const expectedNextTab = tabs[(setupIndex + 1) % tabs.length];

    setupTab.focus();
    setupTab.dispatchEvent(new KeyboardEvent('keydown', {
      key: 'ArrowDown',
      bubbles: true
    }));

    expect(document.activeElement).toBe(expectedNextTab);
    expect(expectedNextTab).toHaveAttribute('aria-selected', 'true');
    expect(expectedNextTab).toHaveAttribute('tabindex', '0');
    expect(getPanel(expectedNextTab.dataset.tab)).not.toHaveAttribute('hidden');
    expect(getPanel('setup')).toHaveAttribute('hidden');
    expect(localStorage.getItem('activeTab')).toBe(expectedNextTab.dataset.tab);
  });

  it('supports Home and End keys across the vertical tablist', () => {
    setupTabNavigation();

    const tabs = Array.from(document.querySelectorAll('[role="tab"]'));
    const firstTab = tabs[0];
    const lastTab = tabs[tabs.length - 1];
    const setupTab = getTab('setup');

    setupTab.dispatchEvent(new KeyboardEvent('keydown', {
      key: 'End',
      bubbles: true
    }));
    expect(document.activeElement).toBe(lastTab);
    expect(lastTab).toHaveAttribute('aria-selected', 'true');

    lastTab.dispatchEvent(new KeyboardEvent('keydown', {
      key: 'Home',
      bubbles: true
    }));
    expect(document.activeElement).toBe(firstTab);
    expect(firstTab).toHaveAttribute('aria-selected', 'true');
  });

  it('lets setup-step links switch tabs without losing keyboard focus', () => {
    setupTabNavigation();

    const repositoriesStep = document.querySelector('.setup-step.clickable[data-tab="repositories"]');

    repositoriesStep.dispatchEvent(new window.MouseEvent('click', {
      bubbles: true,
      cancelable: true
    }));

    expect(document.activeElement).toBe(getTab('repositories'));
    expect(getPanel('repositories')).not.toHaveAttribute('hidden');
    expect(getTab('repositories')).toHaveAttribute('aria-selected', 'true');
  });

  it('has no automated axe violations in the shipped settings shell', async () => {
    setupTabNavigation();

    const results = await axe(document.querySelector('.container'));

    expect(results).toHaveNoViolations();
  });
});
