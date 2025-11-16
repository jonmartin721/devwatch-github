# Changelog

All notable changes to GitHub Devwatch will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2025-11-18

### Added
- Multi-repository monitoring with GitHub API integration
- Browser notifications for new PRs, issues, and releases
- Badge counter on extension icon showing unread activity count
- Activity filtering by type (PRs, Issues, Releases)
- Configurable check intervals (5, 15, 30, 60 minutes)
- Search functionality for filtering activities
- Archive view for viewing read activities
- Repository mute and snooze controls for managing notifications
- Collapsible repository sections in activity list
- Bulk import for watched, starred, and participating repositories
- Settings backup and restore functionality
- Dark mode, light mode, and system theme support
- Notification toggle for browser notifications
- Offline support with cached activity data
- Accessibility features including keyboard navigation and ARIA labels
- Security hardening with XSS protection and input sanitization
- Content Security Policy implementation
- Modern UI with hover effects and visual feedback
- Shared utility modules for better code organization
- Comprehensive test suite with Jest
- GitHub Actions CI/CD pipeline
- ESLint and Prettier configuration
- Build validation script

### Changed
- Renamed extension to "GitHub Devwatch"
- Updated extension icon to git branch design
- Redesigned settings page with modern tabbed UI
- Refactored code into modular shared utilities
- Switched to SVG icons throughout the UI
- Moved toast notifications to bottom-right corner
- Replaced mute toggle with eye icon for better UX
- Improved import UI with better visual hierarchy

### Fixed
- Jest configuration and test syntax errors
- ESLint errors in build scripts
- Module exports and imports
- Unused imports cleaned up
- Test suite re-enabled for accessibility tests

### Security
- XSS protection through input sanitization
- URL validation to prevent malicious redirects
- Content Security Policy to prevent script injection
- Secure token storage using Chrome's local storage

---

## Future Releases

Features planned for upcoming versions:
- Comment notifications
- Mention tracking
- Multiple GitHub account support
- Custom notification filters
- Custom notification sounds
- Internationalization (i18n) support

---

[1.0.0]: https://github.com/jonmartin721/devwatch-github/releases/tag/v1.0.0
