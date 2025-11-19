# Security Policy

## Reporting a Vulnerability

If you find a security issue, please **don't open a public issue**. Instead, email me directly at jonmartin721@gmail.com with:

- Description of the vulnerability
- Steps to reproduce
- Potential impact
- Any suggested fixes (if you have ideas)

I'll respond within 48 hours and work with you to understand and address the issue.

## What Qualifies as a Security Issue

Things I want to know about:
- XSS vulnerabilities or ways to inject malicious code
- Token leakage or insecure storage
- Ways to access other users' data
- Privilege escalation
- Dependencies with known CVEs

## What's Not a Security Issue

These are better suited for regular issues:
- Bugs that don't have security implications
- Feature requests
- UI/UX problems
- Performance issues

## Security Measures

The extension implements several security practices:

### Token Storage
- GitHub tokens are encrypted using AES-GCM with 256-bit keys
- Stored in Chrome's secure storage API
- Never transmitted to third-party servers
- Session caching for performance without compromising security

### Content Security Policy
- Strict CSP prevents unauthorized script execution
- Only allows connections to GitHub API and npm registry
- No inline scripts or eval()

### Input Validation
- All user inputs are sanitized
- URLs are validated before opening
- Repository names are validated against GitHub's format

### API Security
- All requests use HTTPS
- Tokens are included in headers, never in URLs
- Rate limiting is respected to prevent abuse

## Supported Versions

Currently supporting version 1.0.0. Security updates will be released as patch versions (e.g., 1.0.1).

## Disclosure Policy

If you report a valid security issue:
1. I'll confirm the issue and work on a fix
2. Once fixed, I'll release a security update
3. After users have had time to update (usually 1 week), I'll publish details in CHANGELOG.md
4. You'll get credit in the release notes (if you want it)

Thanks for helping keep this extension secure.
