# GitHub Devwatch for Chrome

A Chrome extension that helps developers stay on top of GitHub activity across multiple repositories.


## Features

- **Multi-repo monitoring** - Watch unlimited repositories for new activity
- **Smart notifications** - Get browser notifications for new PRs, issues, and releases
- **Activity filtering** - Filter by repository and activity type (PRs, issues, releases)
- **Configurable intervals** - Check for updates every 5, 15, 30, or 60 minutes
- **Badge counts** - See unread activity count directly on the extension icon
- **Secure token storage** - Your GitHub token is stored securely using Chrome's storage API

## Installation

### From Source

1. Clone this repository
```bash
git clone https://github.com/jonmartin721/devwatch-github.git
cd devwatch-github
```

2. Generate extension icons:
   - If you have ImageMagick: `cd icons && bash create_simple_icons.sh`
   - Icons are required for the extension to load properly

3. Load the extension in Chrome:
   - Open Chrome and go to `chrome://extensions/`
   - Enable "Developer mode" (toggle in top right)
   - Click "Load unpacked"
   - Select the extension directory

## Setup

1. **Create a GitHub Personal Access Token**
   - Go to https://github.com/settings/tokens/new
   - Give it a descriptive name (e.g., "GitHub Devwatch Extension")
   - Select scopes:
     - `repo` (for private repositories)
     - OR `public_repo` (for public repositories only)
   - Click "Generate token" and copy it

2. **Configure the extension**
   - Click the extension icon and open Settings
   - Paste your GitHub token
   - Add repositories to watch (format: `owner/repo`)
   - Choose which activity types to monitor
   - Set your preferred check interval
   - Click "Save Settings"

3. **Start receiving notifications**
   - The extension will now check for activity at your chosen interval
   - Click the extension icon to view recent activity
   - Click any activity item to open it in GitHub


## Usage

### Popup Interface
- **All/PRs/Issues/Releases tabs** - Filter activity by type
- **Refresh button** - Manually check for new activity
- **Search** - Filter activities by keyword
- **Archive** - View previously read activities
- **Activity items** - Click to open in GitHub

### Settings Page
- **GitHub Token** - Your personal access token
- **Watched Repositories** - Add/remove repositories, import from GitHub
- **Activity Filters** - Choose what to monitor
- **Check Interval** - How often to check for updates
- **Notifications** - Toggle browser notifications
- **Theme** - Choose dark, light, or system theme
- **Backup/Restore** - Export and import your settings

## Privacy & Security

- Your GitHub token is stored locally using Chrome's sync storage
- The extension only communicates with GitHub's official API
- No data is sent to third-party servers
- Token is only used to fetch repository activity

## Rate Limiting

GitHub's API has rate limits (5,000 requests/hour for authenticated users). This extension is designed to stay well within these limits:
- Default check interval: 15 minutes
- Each check typically uses 1-3 API requests per repository

If you're watching many repositories with frequent checks, be mindful of GitHub's rate limits.

## Development

### Project Structure
```
/devwatch-github
  /icons                  # Extension icons
  /popup                  # Popup interface
    popup.html
    popup.js
    popup.css
  /options                # Settings page
    options.html
    options.js
  /shared                 # Shared utilities
  background.js           # Service worker
  manifest.json           # Extension manifest
```

### Technologies
- Vanilla JavaScript (no frameworks)
- Chrome Extension Manifest V3
- GitHub REST API
- Chrome Storage, Notifications, and Alarms APIs

### Testing
```bash
npm test
```

## Contributing

Contributions are welcome! Please feel free to submit issues or pull requests. See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

## Documentation

- [Privacy Policy](PRIVACY.md) - How we handle your data
- [Changelog](CHANGELOG.md) - Version history and release notes
- [License](LICENSE) - MIT License

## Roadmap

Future features being considered:
- Comment notifications
- Mention tracking
- Multiple GitHub account support
- Custom notification filters
- Internationalization (i18n) support

## License

MIT License - see [LICENSE](LICENSE) file for details.

Copyright (c) 2025 Jonathan Martin

## Acknowledgments

Built with Chrome Extension Manifest V3 and GitHub's REST API.

## Support

- Report issues: [GitHub Issues](https://github.com/jonmartin721/devwatch-github/issues)
- View source: [GitHub Repository](https://github.com/jonmartin721/devwatch-github)
