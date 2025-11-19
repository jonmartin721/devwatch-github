# Changelog

All notable changes to GitHub Devwatch will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2025-11-18

**Initial stable release** of GitHub Devwatch - A Chrome extension for monitoring GitHub repository activity across multiple repos with real-time notifications.

### Core Features

**Repository Monitoring**
- Multi-repository monitoring with GitHub API integration
- Support for watching unlimited repositories (within GitHub API rate limits)
- Parallel repository fetching for improved performance
- Automatic activity polling with configurable intervals (5, 15, 30, 60 minutes)
- Activity filtering by type (Pull Requests, Issues, Releases)
- Real-time badge counter showing unread activity count
- Browser notifications for new activity (configurable per-repo)
- Repository pinning to keep important repos at the top
- Repository mute and snooze controls for temporary notification silencing
- Optional mark-as-read when snoozing repositories
- Bulk import from GitHub (watched, starred, and participating repos)

**User Interface**
- Clean, modern popup interface with activity feed
- Collapsible repository sections for better organization
- Search and filter functionality for activities
- Archive view for viewing previously read activities
- Onboarding wizard for first-time setup
- Dark mode, light mode, and system theme support
- Responsive design with mobile-friendly layout
- Custom scrollbar styling for better aesthetics
- Toast notifications for user feedback
- Keyboard navigation support throughout the UI

**Settings & Configuration**
- Redesigned options page with tabbed navigation (Setup, Repositories, Settings, Help)
- Token input integrated into setup wizard
- Repository management with visual cards and action buttons
- Activity type filters (enable/disable PRs, Issues, Releases)
- Configurable item expiry (auto-hide old activities)
- Settings backup and restore functionality
- GitHub token import from multiple sources
- Enhanced help documentation with changelog viewer

**Security & Privacy**
- AES-256 encrypted token storage with session caching
- Automatic token migration from unencrypted to encrypted storage
- Content Security Policy to prevent script injection
- XSS protection through input sanitization
- URL validation to prevent malicious redirects
- Repository name validation against GitHub's format
- No third-party services or analytics
- All data stored locally on user's device

**Developer Experience**
- MVC architecture with modular code organization
- Shared utility modules for better maintainability
- Comprehensive test suite with Jest (316+ tests)
- GitHub Actions CI/CD pipeline with automated testing
- Codecov integration for test coverage tracking
- Automated CHANGELOG validation before releases
- Dependabot for automated dependency updates
- ESLint and Prettier for code quality
- Pre-commit hooks for linting
- Pre-push validation (lint, typecheck, test, build)
- Build validation script for extension packaging
- Chrome extension packaging script

**Accessibility**
- WCAG 2.1 Level A compliance
- Full keyboard navigation support
- ARIA labels and roles throughout the UI
- Screen reader friendly error messages
- Focus indicators for interactive elements
- Semantic HTML structure

### Recent Improvements

**Project Governance**
- Added CODE_OF_CONDUCT.md for contributor guidelines
- Added SECURITY.md with vulnerability reporting process and security measures

**CI/CD Enhancements**
- Integrated Codecov for automated test coverage tracking
- Added CHANGELOG validation in release workflow (blocks releases without changelog entries)
- Enabled Dependabot for npm and GitHub Actions dependencies
- Weekly dependency update schedule with grouped minor/patch updates
- Added pre-commit hook for linting

**Documentation Updates**
- Updated README with AES-256 encryption details and Codecov badge
- Updated PRIVACY.md to reflect encrypted token storage
- Added comprehensive release process documentation to CONTRIBUTING.md
- Included version guidelines and CHANGELOG requirements for maintainers

**Code Quality**
- Removed debug console.log statements across codebase
- Cleaned up unused imports and variables
- Fixed badge count to respect item expiry settings
- Made updateLastUpdated async and use actual lastCheck timestamp
- Various bug fixes and performance improvements

**UI/UX Improvements**
- Redesigned options page with improved visual hierarchy
- Moved token input into primary setup step card
- Added repository section cards with icons and count badges
- Improved mobile responsiveness throughout settings
- Added changelog viewer to help section
- Enhanced scrollbar styling in popup
- Added hover effects and animations for better feedback

**Testing**
- Added test coverage for activity-item-view component
- Added test coverage for repository-validator
- Updated and improved existing test suites
- Achieved 58% overall test coverage

### Technical Details

- **Manifest Version:** 3 (Chrome Extension Manifest V3)
- **Framework:** Vanilla JavaScript (no external dependencies for core functionality)
- **Architecture:** Model-View-Controller (MVC) pattern
- **Storage:** Chrome Storage API (sync for settings, local for activity data)
- **API:** GitHub REST API v3
- **Testing:** Jest with jsdom
- **Build Tools:** Node.js build scripts
- **Supported Browsers:** Chrome, Edge, and other Chromium-based browsers

### Known Limitations

- GitHub API rate limit: 5,000 requests/hour for authenticated users
- Extension uses ~1-3 API requests per repository per check
- Recommended check interval: 15+ minutes for multiple repos
- Maximum sync storage: 100KB (used for settings)
- Maximum local storage: 5MB+ (used for activity history)

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
