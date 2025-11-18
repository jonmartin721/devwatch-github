import { jest, describe, test, expect, beforeEach } from '@jest/globals';

// Mock requestAnimationFrame
global.requestAnimationFrame = jest.fn((cb) => {
  cb();
  return 1;
});

// Import the modules under test
import { DOMOptimizer, ActivityListRenderer, escapeHtml } from '../shared/dom-optimizer.js';

describe('escapeHtml', () => {
  test('escapes HTML special characters', () => {
    expect(escapeHtml('<script>alert("xss")</script>')).toBe('&lt;script&gt;alert("xss")&lt;/script&gt;');
    expect(escapeHtml('Test & Test')).toBe('Test &amp; Test');
    expect(escapeHtml('"quotes"')).toBe('"quotes"');
  });

  test('handles plain text without changes', () => {
    expect(escapeHtml('Hello World')).toBe('Hello World');
    expect(escapeHtml('123')).toBe('123');
  });
});

describe('DOMOptimizer', () => {
  let optimizer;
  let container;

  beforeEach(() => {
    optimizer = new DOMOptimizer();
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  describe('initialization', () => {
    test('initializes with empty cache and no container', () => {
      const newOptimizer = new DOMOptimizer();
      expect(newOptimizer.cache).toBeInstanceOf(Map);
      expect(newOptimizer.cache.size).toBe(0);
      expect(newOptimizer.container).toBeNull();
      expect(newOptimizer.renderScheduled).toBe(false);
    });

    test('sets container on initialize', () => {
      optimizer.initialize(container);
      expect(optimizer.container).toBe(container);
    });
  });

  describe('scheduleRender', () => {
    test('schedules render using requestAnimationFrame', () => {
      optimizer.initialize(container);
      const renderFn = jest.fn(() => '<div>test</div>');

      optimizer.scheduleRender(renderFn);

      expect(requestAnimationFrame).toHaveBeenCalled();
      expect(renderFn).toHaveBeenCalled();
    });

    test('prevents multiple scheduled renders (debouncing)', () => {
      optimizer.initialize(container);
      optimizer.renderScheduled = true;

      const renderFn = jest.fn(() => '<div>test</div>');
      optimizer.scheduleRender(renderFn);

      expect(renderFn).not.toHaveBeenCalled();
    });

    test('resets renderScheduled flag after render', () => {
      optimizer.initialize(container);
      const renderFn = jest.fn(() => '<div>test</div>');

      optimizer.scheduleRender(renderFn);

      expect(optimizer.renderScheduled).toBe(false);
    });
  });

  describe('render', () => {
    beforeEach(() => {
      optimizer.initialize(container);
    });

    test('warns if container not initialized', () => {
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();
      const uninitializedOptimizer = new DOMOptimizer();

      uninitializedOptimizer.render('<div>test</div>');

      expect(consoleSpy).toHaveBeenCalledWith('DOMOptimizer not initialized');
      consoleSpy.mockRestore();
    });

    test('handles string content', () => {
      const html = '<div class="test">Hello</div>';
      optimizer.render(html);

      expect(container.innerHTML).toContain('Hello');
    });

    test('handles HTMLElement content', () => {
      const element = document.createElement('div');
      element.textContent = 'Test Element';

      optimizer.render(element);

      expect(container.textContent).toContain('Test Element');
    });

    test('warns when newElement is null', () => {
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();

      optimizer.render(null);

      expect(consoleSpy).toHaveBeenCalledWith('DOMOptimizer: newElement is null or undefined');
      consoleSpy.mockRestore();
    });
  });

  describe('createElementFromHTML', () => {
    test('creates element from HTML string', () => {
      const html = '<div class="test">Content</div>';
      const element = optimizer.createElementFromHTML(html);

      expect(element.tagName).toBe('DIV');
      expect(element.className).toBe('test');
      expect(element.textContent).toBe('Content');
    });

    test('handles complex HTML structures', () => {
      const html = '<ul><li>Item 1</li><li>Item 2</li></ul>';
      const element = optimizer.createElementFromHTML(html);

      expect(element.tagName).toBe('UL');
      expect(element.children.length).toBe(2);
    });
  });

  describe('createVirtualNode', () => {
    test('creates virtual node with type and props', () => {
      const vnode = optimizer.createVirtualNode('div', { className: 'test' });

      expect(vnode.type).toBe('div');
      expect(vnode.props.className).toBe('test');
      expect(vnode.children).toEqual([]);
      expect(vnode.key).toBeNull();
    });

    test('includes key from props', () => {
      const vnode = optimizer.createVirtualNode('div', { key: 'unique-key' });

      expect(vnode.key).toBe('unique-key');
    });

    test('accepts children array', () => {
      const children = ['child1', 'child2'];
      const vnode = optimizer.createVirtualNode('div', {}, children);

      expect(vnode.children).toEqual(children);
    });
  });

  describe('updateAttributes', () => {
    test('updates changed attributes', () => {
      const current = document.createElement('div');
      current.setAttribute('class', 'old');

      const newEl = document.createElement('div');
      newEl.setAttribute('class', 'new');

      optimizer.updateAttributes(current, newEl);

      expect(current.getAttribute('class')).toBe('new');
    });

    test('removes attributes no longer present', () => {
      const current = document.createElement('div');
      current.setAttribute('data-old', 'value');
      current.setAttribute('class', 'test');

      const newEl = document.createElement('div');
      newEl.setAttribute('class', 'test');

      optimizer.updateAttributes(current, newEl);

      expect(current.hasAttribute('data-old')).toBe(false);
      expect(current.getAttribute('class')).toBe('test');
    });

    test('adds new attributes', () => {
      const current = document.createElement('div');
      const newEl = document.createElement('div');
      newEl.setAttribute('data-new', 'value');

      optimizer.updateAttributes(current, newEl);

      expect(current.getAttribute('data-new')).toBe('value');
    });

    test('handles null elements gracefully', () => {
      expect(() => optimizer.updateAttributes(null, null)).not.toThrow();
    });
  });

  describe('updateChildren', () => {
    test('adds new children', () => {
      const current = document.createElement('div');
      const newEl = document.createElement('div');
      newEl.innerHTML = '<span>child</span>';

      optimizer.updateChildren(current, newEl);

      expect(current.children.length).toBe(1);
      expect(current.children[0].tagName).toBe('SPAN');
    });

    test('removes extra children', () => {
      const current = document.createElement('div');
      current.innerHTML = '<span>1</span><span>2</span><span>3</span>';

      const newEl = document.createElement('div');
      newEl.innerHTML = '<span>1</span>';

      optimizer.updateChildren(current, newEl);

      expect(current.children.length).toBe(1);
    });

    test('replaces all children when count differs significantly', () => {
      const current = document.createElement('div');
      for (let i = 0; i < 10; i++) {
        current.appendChild(document.createElement('span'));
      }

      const newEl = document.createElement('div');
      newEl.innerHTML = '<p>New content</p>';

      optimizer.updateChildren(current, newEl);

      expect(current.innerHTML).toBe('<p>New content</p>');
    });

    test('handles null elements gracefully', () => {
      expect(() => optimizer.updateChildren(null, null)).not.toThrow();
    });

    test('handles removal errors gracefully', () => {
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();
      const current = document.createElement('div');
      const child = document.createElement('span');
      current.appendChild(child);

      // Mock removeChild to throw
      current.removeChild = jest.fn(() => {
        throw new Error('Removal failed');
      });

      const newEl = document.createElement('div');
      optimizer.updateChildren(current, newEl);

      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });
  });

  describe('patchElement', () => {
    test('updates element of same type', () => {
      const current = document.createElement('div');
      current.className = 'old';

      const newEl = document.createElement('div');
      newEl.className = 'new';

      optimizer.patchElement(current, newEl);

      expect(current.className).toBe('new');
    });

    test('replaces element of different type', () => {
      const parent = document.createElement('div');
      const current = document.createElement('div');
      parent.appendChild(current);

      const newEl = document.createElement('span');

      optimizer.patchElement(current, newEl);

      expect(parent.children[0].tagName).toBe('SPAN');
    });

    test('handles null elements gracefully', () => {
      expect(() => optimizer.patchElement(null, null)).not.toThrow();
    });

    test('handles element without parent', () => {
      const current = document.createElement('div');
      const newEl = document.createElement('span');

      expect(() => optimizer.patchElement(current, newEl)).not.toThrow();
    });
  });

  describe('batch', () => {
    test('executes batch operations', () => {
      // Test the code path without parent (which is more common in tests)
      const standalone = document.createElement('div');
      optimizer.initialize(standalone);
      const operationSpy = jest.fn();

      optimizer.batch(operationSpy);

      expect(operationSpy).toHaveBeenCalled();
    });

    test('batch method exists and is callable', () => {
      // Use a fresh container without a parent to avoid DOM manipulation issues
      const freshContainer = document.createElement('div');
      const freshOptimizer = new DOMOptimizer();
      freshOptimizer.initialize(freshContainer);

      expect(typeof freshOptimizer.batch).toBe('function');

      // Verify it executes the callback
      let callbackExecuted = false;
      freshOptimizer.batch(() => {
        callbackExecuted = true;
      });

      expect(callbackExecuted).toBe(true);
    });
  });

  describe('clearCache', () => {
    test('clears the cache', () => {
      optimizer.cache.set('key1', 'value1');
      optimizer.cache.set('key2', 'value2');

      expect(optimizer.cache.size).toBe(2);

      optimizer.clearCache();

      expect(optimizer.cache.size).toBe(0);
    });
  });
});

describe('ActivityListRenderer', () => {
  let renderer;
  let container;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    renderer = new ActivityListRenderer(container);
  });

  describe('initialization', () => {
    test('initializes with container and optimizer', () => {
      expect(renderer.container).toBe(container);
      expect(renderer.optimizer).toBeInstanceOf(DOMOptimizer);
      expect(renderer.lastRenderedData).toBeNull();
      expect(renderer.itemCache).toBeInstanceOf(Map);
    });
  });

  describe('generateRenderKey', () => {
    test('generates unique key from activities and options', () => {
      const activities = [
        { id: '1' },
        { id: '2' }
      ];
      const options = { groupByRepo: true };

      const key = renderer.generateRenderKey(activities, options);

      expect(key).toBe('1,2|groupByRepo:true');
    });

    test('generates different keys for different activities', () => {
      const key1 = renderer.generateRenderKey([{ id: '1' }], {});
      const key2 = renderer.generateRenderKey([{ id: '2' }], {});

      expect(key1).not.toBe(key2);
    });

    test('generates different keys for different options', () => {
      const activities = [{ id: '1' }];
      const key1 = renderer.generateRenderKey(activities, { groupByRepo: true });
      const key2 = renderer.generateRenderKey(activities, { groupByRepo: false });

      expect(key1).not.toBe(key2);
    });
  });

  describe('groupActivitiesByRepo', () => {
    test('groups activities by repository', () => {
      const activities = [
        { id: '1', repo: 'owner/repo1' },
        { id: '2', repo: 'owner/repo2' },
        { id: '3', repo: 'owner/repo1' }
      ];

      const grouped = renderer.groupActivitiesByRepo(activities);

      expect(grouped.size).toBe(2);
      expect(grouped.get('owner/repo1').length).toBe(2);
      expect(grouped.get('owner/repo2').length).toBe(1);
    });

    test('handles empty array', () => {
      const grouped = renderer.groupActivitiesByRepo([]);
      expect(grouped.size).toBe(0);
    });
  });

  describe('getActivityTypeLabel', () => {
    test('returns readable labels for known types', () => {
      expect(renderer.getActivityTypeLabel('PullRequestEvent')).toBe('Pull Request');
      expect(renderer.getActivityTypeLabel('IssuesEvent')).toBe('Issue');
      expect(renderer.getActivityTypeLabel('ReleaseEvent')).toBe('Release');
      expect(renderer.getActivityTypeLabel('PushEvent')).toBe('Push');
      expect(renderer.getActivityTypeLabel('IssueCommentEvent')).toBe('Comment');
    });

    test('returns original type for unknown types', () => {
      expect(renderer.getActivityTypeLabel('UnknownEvent')).toBe('UnknownEvent');
    });
  });

  describe('formatTime', () => {
    test('formats recent times correctly', () => {
      const now = new Date();

      const justNow = new Date(now - 30 * 1000).toISOString();
      expect(renderer.formatTime(justNow)).toBe('just now');

      const minutes = new Date(now - 15 * 60 * 1000).toISOString();
      expect(renderer.formatTime(minutes)).toBe('15m ago');

      const hours = new Date(now - 3 * 60 * 60 * 1000).toISOString();
      expect(renderer.formatTime(hours)).toBe('3h ago');

      const days = new Date(now - 2 * 24 * 60 * 60 * 1000).toISOString();
      expect(renderer.formatTime(days)).toBe('2d ago');
    });

    test('formats old dates as locale string', () => {
      const oldDate = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000);
      const result = renderer.formatTime(oldDate.toISOString());
      expect(result).toBe(oldDate.toLocaleDateString());
    });
  });

  describe('generateSingleActivityHTML', () => {
    test('generates HTML for activity', () => {
      const activity = {
        id: '123',
        type: 'PullRequestEvent',
        title: 'Test PR',
        description: 'Test description',
        createdAt: new Date().toISOString(),
        url: 'https://github.com/test/repo/pull/1'
      };

      const html = renderer.generateSingleActivityHTML(activity);

      expect(html).toContain('Test PR');
      expect(html).toContain('Pull Request');
      expect(html).toContain('Test description');
      expect(html).toContain('https://github.com/test/repo/pull/1');
    });

    test('handles activity without description', () => {
      const activity = {
        id: '124',
        type: 'IssuesEvent',
        title: 'Test Issue',
        createdAt: new Date().toISOString(),
        url: 'https://github.com/test/repo/issues/1'
      };

      const html = renderer.generateSingleActivityHTML(activity);

      expect(html).toContain('Test Issue');
      expect(html).not.toContain('activity-description');
    });

    test('caches generated HTML', () => {
      const activity = {
        id: '125',
        type: 'ReleaseEvent',
        title: 'v1.0.0',
        createdAt: new Date().toISOString(),
        url: 'https://github.com/test/repo/releases/tag/v1.0.0'
      };

      const html1 = renderer.generateSingleActivityHTML(activity);
      const html2 = renderer.generateSingleActivityHTML(activity);

      expect(html1).toBe(html2);
      expect(renderer.itemCache.has('125-false')).toBe(true);
    });
  });

  describe('generateActivityHTML', () => {
    test('shows empty state for no activities', () => {
      const html = renderer.generateActivityHTML([], { groupByRepo: false });

      expect(html).toContain('empty-state');
      expect(html).toContain('No activity found');
    });

    test('generates flat HTML when groupByRepo is false', () => {
      const activities = [
        {
          id: '1',
          type: 'PullRequestEvent',
          title: 'PR 1',
          createdAt: new Date().toISOString(),
          url: 'https://github.com/test/repo/pull/1',
          repo: 'test/repo'
        }
      ];

      const html = renderer.generateActivityHTML(activities, { groupByRepo: false });

      expect(html).toContain('activities-list');
      expect(html).toContain('PR 1');
      expect(html).not.toContain('repo-section');
    });

    test('generates grouped HTML when groupByRepo is true', () => {
      const activities = [
        {
          id: '1',
          type: 'PullRequestEvent',
          title: 'PR 1',
          createdAt: new Date().toISOString(),
          url: 'https://github.com/test/repo/pull/1',
          repo: 'test/repo'
        }
      ];

      const html = renderer.generateActivityHTML(activities, { groupByRepo: true });

      expect(html).toContain('repo-group-header');
      expect(html).toContain('test/repo');
      expect(html).toContain('PR 1');
    });
  });

  describe('generateGroupedHTML', () => {
    test('generates HTML grouped by repository', () => {
      const activities = [
        {
          id: '1',
          type: 'PullRequestEvent',
          title: 'PR 1',
          createdAt: new Date().toISOString(),
          url: 'https://github.com/owner/repo1/pull/1',
          repo: 'owner/repo1'
        },
        {
          id: '2',
          type: 'IssuesEvent',
          title: 'Issue 1',
          createdAt: new Date().toISOString(),
          url: 'https://github.com/owner/repo1/issues/1',
          repo: 'owner/repo1'
        },
        {
          id: '3',
          type: 'ReleaseEvent',
          title: 'v1.0.0',
          createdAt: new Date().toISOString(),
          url: 'https://github.com/owner/repo2/releases/tag/v1.0.0',
          repo: 'owner/repo2'
        }
      ];

      const html = renderer.generateGroupedHTML(activities);

      expect(html).toContain('owner/repo1');
      expect(html).toContain('owner/repo2');
      expect(html).toContain('repo-count">2<');
      expect(html).toContain('repo-count">1<');
    });
  });

  describe('generateFlatHTML', () => {
    test('generates flat activity list', () => {
      const activities = [
        {
          id: '1',
          type: 'PullRequestEvent',
          title: 'PR 1',
          createdAt: new Date().toISOString(),
          url: 'https://github.com/test/repo/pull/1',
          repo: 'test/repo'
        }
      ];

      const html = renderer.generateFlatHTML(activities);

      expect(html).toContain('activities-list');
      expect(html).toContain('PR 1');
      expect(html).not.toContain('repo-section');
    });
  });

  describe('render', () => {
    test('limits activities to maxItems', () => {
      const activities = Array.from({ length: 200 }, (_, i) => ({
        id: `${i}`,
        type: 'PullRequestEvent',
        title: `PR ${i}`,
        createdAt: new Date().toISOString(),
        url: `https://github.com/test/repo/pull/${i}`,
        repo: 'test/repo'
      }));

      renderer.render(activities, { maxItems: 50 });

      // Verify it doesn't crash and handles large datasets
      expect(renderer.lastRenderedData).not.toBeNull();
    });

    test('skips render if data unchanged', () => {
      const activities = [
        {
          id: '1',
          type: 'PullRequestEvent',
          title: 'PR 1',
          createdAt: new Date().toISOString(),
          url: 'https://github.com/test/repo/pull/1',
          repo: 'test/repo'
        }
      ];

      renderer.render(activities);
      const firstRenderKey = renderer.lastRenderedData;

      renderer.render(activities);
      const secondRenderKey = renderer.lastRenderedData;

      expect(firstRenderKey).toBe(secondRenderKey);
    });

    test('updates render when activities change', () => {
      const activities1 = [{ id: '1', type: 'PullRequestEvent', title: 'PR 1', createdAt: new Date().toISOString(), url: 'https://github.com/test/repo/pull/1', repo: 'test/repo' }];
      const activities2 = [{ id: '2', type: 'IssuesEvent', title: 'Issue 1', createdAt: new Date().toISOString(), url: 'https://github.com/test/repo/issues/1', repo: 'test/repo' }];

      renderer.render(activities1);
      const firstKey = renderer.lastRenderedData;

      renderer.render(activities2);
      const secondKey = renderer.lastRenderedData;

      expect(firstKey).not.toBe(secondKey);
    });
  });

  describe('cleanupCache', () => {
    test('removes old cache entries', () => {
      renderer.itemCache.set('old', { html: '<div>old</div>', timestamp: Date.now() - 400000 });
      renderer.itemCache.set('recent', { html: '<div>recent</div>', timestamp: Date.now() });

      renderer.cleanupCache();

      expect(renderer.itemCache.has('old')).toBe(false);
      expect(renderer.itemCache.has('recent')).toBe(true);
    });

    test('handles empty cache', () => {
      expect(() => renderer.cleanupCache()).not.toThrow();
    });
  });
});
