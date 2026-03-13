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
- OAuth session leakage or insecure storage
- Ways to access other users' data
- Privilege escalation
- Dependencies with known CVEs

## What's Not a Security Issue

These are better suited for regular issues:
- Bugs that don't have security implications
- Feature requests
- UI/UX problems
- Performance issues

## Current Security Posture

The extension includes several concrete protections, but this project has not been through a formal external security audit.

### GitHub Sign-In Storage
- GitHub auth sessions are kept in `chrome.storage.session` for the current browser session only
- Legacy on-disk auth storage is cleared by current builds during sign-in handling
- Never transmitted to third-party servers

### Content Security Policy
- Extension pages use a CSP that limits script sources and network destinations
- The current policy allows connections to the GitHub API and npm registry
- No inline scripts or eval()

### Input Validation
- The codebase includes sanitization for rendered content
- URLs are validated before opening
- Repository names are validated against GitHub's format

### API Security
- All requests use HTTPS
- OAuth access tokens are included in headers, never in URLs
- Rate limiting is respected to prevent abuse

## Supported Versions

Security fixes are targeted at the current `1.0.x` release line.

## Disclosure Policy

If you report a valid security issue:
1. I'll confirm the issue and work on a fix
2. Once fixed, I'll release a security update
3. After users have had time to update (usually 1 week), I'll publish details in CHANGELOG.md
4. You'll get credit in the release notes (if you want it)

Thanks for helping keep this extension secure.
