# GitHub Notifications for Chrome

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
git clone https://github.com/yourusername/github-notifications-chrome.git
cd github-notifications-chrome
```

2. Generate extension icons (choose one method):
   - Open `generate-icons.html` in your browser and download the generated icons to the `icons/` folder
   - Or if you have ImageMagick: `cd icons && bash create_simple_icons.sh`

3. Load the extension in Chrome:
   - Open Chrome and go to `chrome://extensions/`
   - Enable "Developer mode" (toggle in top right)
   - Click "Load unpacked"
   - Select the extension directory

## Setup

1. **Create a GitHub Personal Access Token**
   - Go to https://github.com/settings/tokens/new
   - Give it a descriptive name (e.g., "GitHub Notifications Extension")
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
- **Activity items** - Click to open in GitHub

### Settings Page
- **GitHub Token** - Your personal access token
- **Watched Repositories** - Add/remove repositories
- **Activity Filters** - Choose what to monitor
- **Check Interval** - How often to check for updates

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
/github-notifications-chrome
  /icons                  # Extension icons
  /popup                  # Popup interface
    popup.html
    popup.js
    popup.css
  /options                # Settings page
    options.html
    options.js
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

Contributions are welcome! Please feel free to submit issues or pull requests.

## License

MIT License - see LICENSE file for details

## Acknowledgments

Built with Chrome Extension Manifest V3 and GitHub's REST API.
