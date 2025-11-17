/**
 * NPM API utilities for fetching package information
 */

/**
 * Fetches GitHub repository information from an NPM package name
 * @param {string} packageName - The NPM package name
 * @returns {Promise<Object>} Result object with success flag and repo or error
 */
export async function fetchGitHubRepoFromNpm(packageName) {
  try {
    const response = await fetch(`https://registry.npmjs.org/${packageName}`);

    if (!response.ok) {
      if (response.status === 404) {
        return { success: false, error: `NPM package "${packageName}" not found` };
      }
      return { success: false, error: `Error fetching NPM package (${response.status})` };
    }

    const data = await response.json();

    if (!data.repository) {
      return { success: false, error: `Package "${packageName}" has no repository info` };
    }

    let repoUrl = typeof data.repository === 'string' ? data.repository : data.repository.url;

    // Extract GitHub repo from URL
    const githubMatch = repoUrl.match(/github\.com[/:]([^/]+\/[^/.]+)/);
    if (!githubMatch) {
      return { success: false, error: `Package "${packageName}" is not hosted on GitHub` };
    }

    const repo = githubMatch[1].replace(/\.git$/, '');
    return { success: true, repo };
  } catch (error) {
    return { success: false, error: 'Network error fetching NPM package' };
  }
}
