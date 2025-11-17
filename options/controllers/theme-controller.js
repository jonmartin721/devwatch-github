import { getSyncItem } from '../../shared/storage-helpers.js';
import { applyTheme } from '../../shared/utils.js';

export function setupThemeListener() {
  const darkModeQuery = window.matchMedia('(prefers-color-scheme: dark)');
  darkModeQuery.addEventListener('change', async () => {
    const theme = await getSyncItem('theme', 'system');
    if (theme === 'system') {
      applyTheme(theme);
    }
  });
}
