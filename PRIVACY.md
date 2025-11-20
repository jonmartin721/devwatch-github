# Privacy Policy for GitHub Devwatch

**Last Updated: November 17, 2025**

## Overview

GitHub Devwatch is a Chrome browser extension that helps you monitor activity on GitHub repositories. This privacy policy explains how the extension handles your data.

## Data Collection and Usage

### What Data We Collect

GitHub Devwatch collects and stores the following data **locally on your device only**:

1. **GitHub Personal Access Token**
   - Encrypted with AES-GCM encryption and stored securely on your device
   - Used only to authenticate with GitHub's API
   - Never transmitted to any third-party servers
   - Never shared with anyone

2. **Repository Watch List**
   - List of GitHub repositories you choose to monitor
   - Stored in Chrome's sync storage for convenience across your Chrome browsers
   - Only used to fetch activity from those repositories

3. **Extension Settings**
   - Your preferences (check interval, notification settings, theme, etc.)
   - Stored in Chrome's sync storage
   - Synced across your Chrome browsers if you're signed into Chrome

4. **Activity Data**
   - Recent activity from your watched repositories (up to 2000 items)
   - Cached locally for offline viewing
   - Automatically cleaned up when storage limits are approached

### What We DON'T Collect

- We do **NOT** collect personal information
- We do **NOT** track your browsing activity
- We do **NOT** use analytics or telemetry
- We do **NOT** share any data with third parties
- We do **NOT** transmit your data to external servers

## How Data is Used

All data collected is used exclusively to provide the extension's functionality:

- Your GitHub token authenticates API requests to GitHub
- Your repository list determines which repositories to monitor
- Your settings customize how the extension behaves
- Activity data is displayed in the extension popup for your review

## Data Storage

- All data is stored locally on your device using Chrome's storage APIs
- Chrome encrypts sensitive data (like your GitHub token) at rest
- Settings and repository lists can optionally sync across your Chrome browsers if you use Chrome Sync
- You can clear all data at any time by uninstalling the extension or using Chrome's "Clear extension data" feature

## Third-Party Services

### GitHub API

This extension communicates with GitHub's API (api.github.com) to fetch repository activity. When you use this extension:

- API requests are made directly from your browser to GitHub
- Requests include your GitHub Personal Access Token for authentication
- GitHub's privacy policy and terms of service apply to these interactions
- See GitHub's privacy policy at: https://docs.github.com/en/site-policy/privacy-policies/github-privacy-statement

### NPM Registry (Optional)

When you add a repository by NPM package name, the extension communicates with the NPM registry (registry.npmjs.org):

- This is entirely optional and only happens when you use the "Add by NPM package" feature
- Used to look up the GitHub repository associated with an NPM package
- No authentication or personal data is sent to NPM
- NPM's privacy policy applies to these interactions

### No Other Third Parties

GitHub Devwatch does **NOT**:
- Use advertising networks
- Use analytics services
- Connect to any servers we operate
- Share data with any other third-party services

## Permissions Explained

The extension requests the following Chrome permissions:

- **storage**: To save your settings, token, and activity data locally
- **alarms**: To periodically check for new repository activity
- **notifications**: To show you browser notifications for new activity
- **Host permission for api.github.com**: To fetch repository activity from GitHub's API

These permissions are used only for the stated functionality and nothing else.

## Your Control and Rights

You have complete control over your data:

- **View Your Data**: All settings are visible in the extension's options page
- **Delete Your Data**: Uninstall the extension to remove all data, or use the "Clear All Data" option in settings
- **Export Your Data**: Use the backup/restore feature to export your settings
- **Revoke Access**: Remove or regenerate your GitHub Personal Access Token at any time via GitHub's settings

## Security

We take security seriously:

- All API requests use HTTPS
- GitHub tokens are encrypted using AES-GCM encryption
- Input is sanitized to prevent XSS attacks
- Only GitHub URLs are allowed (no external redirects)
- Content Security Policy prevents malicious script injection

## Changes to This Policy

We may update this privacy policy from time to time. Changes will be reflected in:
- The "Last Updated" date at the top of this document
- The extension's release notes in CHANGELOG.md

## Children's Privacy

This extension is not directed at children under 13. We do not knowingly collect information from children.

## Contact

If you have questions about this privacy policy or the extension:

- Open an issue on GitHub: https://github.com/jonmartin721/devwatch-github/issues
- Developer: Jonathan Martinez

## Open Source

This extension is open source. You can review the code to verify these privacy claims:
https://github.com/jonmartin721/devwatch-github

## Consent

By installing and using GitHub Devwatch, you consent to this privacy policy.
