# Project Development Notes

## Project Overview

This is a Chrome extension built as a portfolio project for freelancing work. It demonstrates proficiency with:
- Chrome Extension development (Manifest V3)
- Vanilla JavaScript (no frameworks)
- REST API integration (GitHub API)
- Async/await patterns
- Chrome Extension APIs (Storage, Notifications, Alarms)
- Clean, maintainable code

## Development Guidelines

The project was built with these constraints in mind:
- **Sound human** - Regular commit messages, not overly detailed
- **Natural documentation** - Comments where needed, but not excessive
- **Clean code** - Following best practices without being obvious about it
- **Production ready** - Error handling, rate limit awareness, security considerations

## Key Features

1. Multi-repository monitoring
2. Browser notifications for new activity
3. Badge count on extension icon
4. Configurable check intervals
5. Activity filtering (PRs, issues, releases)
6. Secure token storage

## Technical Implementation

### Background Service Worker
- Uses Chrome Alarms API for periodic checking
- Handles GitHub API calls with proper error handling
- Groups notifications by repository
- Manages badge count updates

### Storage Strategy
- `chrome.storage.sync` for settings (token, repos, preferences)
- `chrome.storage.local` for activity data (last 100 items)
- Keeps activity history for offline viewing

### API Rate Limiting
- Default 15-minute check interval keeps well within GitHub's limits
- Each check uses ~1-3 API requests per repo
- GitHub allows 5,000 requests/hour for authenticated users

## Setup for Development

1. Load extension in Chrome dev mode
2. Configure GitHub token in settings
3. Add repos to watch
4. Check browser console for any errors

## Security Notes

- Token stored in Chrome sync storage (encrypted by Chrome)
- Only communicates with github.com
- No third-party services or tracking
- Token only used for API authentication

## Future Enhancements

Potential features that could be added:
- Comment notifications
- Mention tracking
- Custom filters/rules
- Dark mode
- Multiple GitHub accounts
- Export activity data

## Testing

The project includes unit tests for core functionality and uses GitHub Actions for CI/CD.

## Deployment

This is meant to be a demonstration project. For actual deployment to Chrome Web Store:
1. Create production icons
2. Add privacy policy
3. Create promotional images
4. Submit to Chrome Web Store

---

Built to showcase practical Chrome extension development skills for freelance opportunities.
