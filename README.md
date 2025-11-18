# GitHub Devwatch for Chrome

<div align="center">

**Stay on top of GitHub activity across all your repositories**

[![Chrome Web Store](https://img.shields.io/badge/Chrome-Web_Store-green?logo=google-chrome)](https://chrome.google.com/webstore)
[![License](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![CI](https://github.com/jonma/devwatch-github/workflows/CI/badge.svg)](https://github.com/jonma/devwatch-github/actions)
[![Tests](https://img.shields.io/badge/tests-316%20passing-brightgreen)](tests/)
[![Coverage](https://img.shields.io/badge/coverage-58%25-brightgreen)](tests/)

*Keep track of PRs, issues, and releases without constantly refreshing GitHub pages*

</div>

## ✨ Key Features

- **🚀 Guided Setup Wizard** - Interactive onboarding walks you through the entire setup process
- **🔔 Smart Notifications** - Get browser notifications for new PRs, issues, and releases
- **📊 Multi-Repo Monitoring** - Watch up to 50 repositories from a single interface
- **⚡ Real-time Updates** - Configurable check intervals (5, 15, 30, or 60 minutes)
- **🎯 Activity Filtering** - Filter by repository and activity type with search
- **🏷️ Badge Counts** - See unread activity count directly on the extension icon
- **🔒 Secure & Private** - Token stored securely, no third-party data sharing

## 📸 Screenshots

### Guided Setup Wizard
<div align="center">
  <img src="screenshots/onboarding-welcome.png" alt="Interactive setup wizard welcome screen" width="500">
  <br><em>Interactive setup wizard guides you through configuration in under 2 minutes</em>
</div>

### Extension Interface
<table>
  <tr>
    <td width="50%">
      <img src="screenshots/popup-interface.png" alt="Popup interface showing GitHub activity feed">
      <br><em>Popup interface with activity feed and filtering</em>
    </td>
    <td width="50%">
      <img src="screenshots/settings-page.png" alt="Settings page for configuring repositories">
      <br><em>Settings page with repository management</em>
    </td>
  </tr>
  <tr>
    <td width="50%">
      <img src="screenshots/browser-notification.png" alt="Browser notification example">
      <br><em>Real-time browser notifications</em>
    </td>
    <td width="50%">
      <img src="screenshots/badge-count.png" alt="Extension badge count">
      <br><em>Badge showing unread activity count</em>
    </td>
  </tr>
</table>

## 🚀 Installation

### From Chrome Web Store (Recommended)

1. Visit the Chrome Web Store (coming soon)
2. Click "Add to Chrome"
3. Grant permissions when prompted
4. Follow the guided setup wizard on first launch

### Manual Installation (For Development)

1. Clone this repository
```bash
git clone https://github.com/jonmartin721/devwatch-github.git
cd devwatch-github
```

2. Load the extension in Chrome:
   - Open Chrome and go to `chrome://extensions/`
   - Enable "Developer mode" (toggle in top right)
   - Click "Load unpacked"
   - Select the extension directory

3. Click the extension icon and follow the setup wizard

## ⚙️ Quick Setup

### First-Time Setup
When you first install the extension, an **interactive setup wizard** guides you through:

1. **Welcome** - Overview of features and capabilities
2. **GitHub Token** - Create and validate your personal access token with step-by-step instructions
3. **Add Repositories** - Select which repositories to monitor
4. **Activity Preferences** - Choose which types of activity to track (PRs, Issues, Releases)
5. **Done!** - Start monitoring immediately

The entire setup takes about 2 minutes and requires no prior configuration knowledge.

### Ongoing Use
- The extension automatically checks for activity at your configured interval (default: 15 minutes)
- Click the extension icon to view your activity feed
- Get browser notifications for new activity
- Badge count shows unread items at a glance
- Manage repositories and preferences anytime in Settings

## 🎯 How to Use

### Popup Interface
- **Tabs**: Filter between All/PRs/Issues/Releases
- **Search**: Filter activities by keyword
- **Refresh**: Manually check for new activity
- **Archive**: View previously read activities
- **Activity Items**: Click to open in GitHub

### Settings Page
- **GitHub Token**: Secure storage of your personal access token
- **Watched Repositories**: Add/remove repositories, import from GitHub
- **Activity Filters**: Choose what types of activity to monitor
- **Check Interval**: Configure how often to check for updates
- **Notifications**: Toggle browser notifications on/off
- **Theme**: Choose dark, light, or system theme
- **Backup/Restore**: Export and import your settings

## ♿ Accessibility

GitHub Devwatch is built with accessibility in mind to ensure everyone can use it effectively:

### WCAG 2.1 Level A Compliance
- **Form Labels**: All form inputs have proper visible labels for screen readers
- **Keyboard Navigation**: Full keyboard support with intuitive shortcuts
- **Focus Management**: Proper focus indicators and logical tab order
- **ARIA Landmarks**: Semantic HTML with proper ARIA roles and labels
- **Screen Reader Support**: Descriptive labels and live region announcements

### Keyboard Shortcuts
- **R** - Refresh activity
- **S** - Toggle search
- **A** - Toggle archive view
- **Escape** - Close modals and search
- **Arrow Keys** - Navigate between filter tabs
- **Enter/Space** - Activate buttons and links

### Testing & Validation
- Automated accessibility testing with axe-core
- Manual testing with NVDA and JAWS screen readers
- Keyboard-only navigation verified
- Focus trap implementation in modals

For accessibility issues or suggestions, please [open an issue](https://github.com/jonmartin721/devwatch-github/issues).

## 🔒 Privacy & Security

Your privacy and security are top priorities:

- **Local Storage Only** - Your GitHub token is stored locally using Chrome's encrypted sync storage
- **API-Only Communication** - The extension only communicates with GitHub's official API
- **No Third Parties** - No data is sent to external servers or analytics services
- **Minimal Permissions** - Token is used exclusively for fetching repository activity
- **Open Source** - Full transparency - you can review the entire codebase and suggest changes, and raise/fix issues if you see them

## 📊 Rate Limiting
GitHub's API has very relaxed rate limits that this extension benefits from and optimizes for:

- **5,000 requests/hour** for authenticated users (compared to 60 for unauthenticated)
- **Default interval**: 15 minutes (well within rate limits)
- **Efficient checking**: Each repo typically uses 1-3 API requests per check
- **Smart batching**: Groups requests to minimize API usage

You can safely monitor dozens of repositories without approaching GitHub's limits. 
We do limit the maximum number of repositories to 50 to make sure you don't reach that limit however.

## 🛠️ Development

### Project Structure
```
/devwatch-github
  /icons                  # Extension icons in various sizes
  /popup                  # Popup interface
    /controllers         # Popup business logic
    /views               # Popup view components
    popup.html
    popup.js
    popup.css
  /options                # Settings page
    /controllers         # Settings business logic
    /views               # Settings view components
    options.html
    options.js
  /shared                 # Shared utilities
    /api                 # GitHub API integration
    /ui                  # Shared UI components
  background.js           # Service worker for background tasks
  manifest.json           # Extension manifest (Manifest V3)
```

### Technologies Used
- **Vanilla JavaScript** - No frameworks, pure JS for maximum compatibility
- **Chrome Extension Manifest V3** - Latest extension standards
- **GitHub REST API** - Direct integration with GitHub's API
- **Chrome APIs** - Storage, Notifications, and Alarms for core functionality

### Running Tests
```bash
npm test
```

### Local Development
1. Clone the repository
2. Run `npm install` for dependencies
3. Load as unpacked extension in Chrome
4. Make changes and reload the extension from `chrome://extensions/`

## 🤝 Contributing

Contributions are very welcome! Please feel free to submit issues or pull requests. See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

### How to Contribute
- **Bug Reports**: Use GitHub Issues with clear reproduction steps
- **Feature Requests**: Open an issue describing the feature and use case
- **Pull Requests**: Fork, branch, and submit with clear commit messages
- **Code Style**: Follow existing patterns and use ESLint configuration

## 📚 Documentation

- [**Privacy Policy**](PRIVACY.md) - How we handle your data
- [**Changelog**](CHANGELOG.md) - Version history and release notes
- [**License**](LICENSE) - MIT License
- [**Contributing Guidelines**](CONTRIBUTING.md) - How to contribute

## 🗺️ Roadmap

Future features being considered (that you could help with!):
- **Comment notifications** - Track new comments on issues and PRs
- **Mention tracking** - Get notified when you're mentioned
- **Multiple GitHub accounts** - Switch between different accounts
- **Custom notification filters** - Advanced filtering rules
- **Internationalization** - Support for multiple languages
- **Dashboard view** - Full-page dashboard for all activity
- **Integration with other platforms** - GitLab, Bitbucket support

## 📄 License

MIT License - see [LICENSE](LICENSE) file for details.

Copyright (c) 2025 Jonathan Martin

## 🙋‍♂️ Support

- **Report issues**: [GitHub Issues](https://github.com/jonmartin721/devwatch-github/issues)
- **Feature requests**: [GitHub Discussions](https://github.com/jonmartin721/devwatch-github/discussions)

---

<div align="center">

**Built for developers who want to stay productive**

[⭐ Star this repo](https://github.com/jonmartin721/devwatch-github) if you find it useful!

</div>
