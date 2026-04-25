(() => {
  const THEME_CACHE_KEY = 'devwatch:theme-preferences';
  const DEFAULT_THEME = 'system';
  const DEFAULT_COLOR_THEME = 'polar';
  const DARK_MEDIA_QUERY = '(prefers-color-scheme: dark)';

  let mediaQueryList = null;
  let currentTheme = DEFAULT_THEME;
  let currentColorTheme = DEFAULT_COLOR_THEME;

  function normalizeTheme(theme) {
    return ['light', 'dark', 'system'].includes(theme) ? theme : DEFAULT_THEME;
  }

  function normalizeColorTheme(colorTheme) {
    return typeof colorTheme === 'string' && colorTheme.length > 0
      ? colorTheme
      : DEFAULT_COLOR_THEME;
  }

  function getMediaQueryList() {
    if (mediaQueryList) {
      return mediaQueryList;
    }

    if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
      mediaQueryList = window.matchMedia(DARK_MEDIA_QUERY);
    }

    return mediaQueryList;
  }

  function prefersDarkMode() {
    return Boolean(getMediaQueryList()?.matches);
  }

  function readCachedPreferences() {
    if (typeof localStorage === 'undefined') {
      return null;
    }

    try {
      const rawValue = localStorage.getItem(THEME_CACHE_KEY);
      if (!rawValue) {
        return null;
      }

      const parsedValue = JSON.parse(rawValue);
      if (!parsedValue || typeof parsedValue !== 'object') {
        return null;
      }

      return {
        theme: normalizeTheme(parsedValue.theme),
        colorTheme: normalizeColorTheme(parsedValue.colorTheme)
      };
    } catch {
      return null;
    }
  }

  function writeCachedPreferences(theme, colorTheme) {
    if (typeof localStorage === 'undefined') {
      return;
    }

    try {
      localStorage.setItem(THEME_CACHE_KEY, JSON.stringify({
        theme,
        colorTheme
      }));
    } catch {
      // Ignore localStorage write failures. The live theme still applies.
    }
  }

  function shouldUseDarkMode(theme) {
    if (theme === 'dark') {
      return true;
    }

    if (theme === 'light') {
      return false;
    }

    return prefersDarkMode();
  }

  function applyThemeToTarget(target) {
    if (!target) {
      return;
    }

    target.classList.toggle('dark-mode', shouldUseDarkMode(currentTheme));
    target.setAttribute('data-color-theme', currentColorTheme);
  }

  function syncThemeToDocument(theme = currentTheme, colorTheme = currentColorTheme) {
    currentTheme = normalizeTheme(theme);
    currentColorTheme = normalizeColorTheme(colorTheme);

    applyThemeToTarget(document.documentElement);

    if (document.documentElement) {
      document.documentElement.style.colorScheme = shouldUseDarkMode(currentTheme) ? 'dark' : 'light';
    }

    applyThemeToTarget(document.body);
  }

  const cachedPreferences = readCachedPreferences();
  syncThemeToDocument(
    cachedPreferences?.theme ?? DEFAULT_THEME,
    cachedPreferences?.colorTheme ?? DEFAULT_COLOR_THEME
  );

  if (!document.body && typeof window !== 'undefined' && typeof window.MutationObserver !== 'undefined') {
    const observer = new window.MutationObserver(() => {
      if (!document.body) {
        return;
      }

      syncThemeToDocument();
      observer.disconnect();
    });

    observer.observe(document.documentElement, { childList: true });
  }

  getMediaQueryList()?.addEventListener?.('change', () => {
    if (currentTheme === 'system') {
      syncThemeToDocument();
    }
  });

  if (typeof chrome === 'undefined' || !chrome.storage?.sync?.get) {
    return;
  }

  chrome.storage.sync.get(['theme', 'colorTheme'], (result) => {
    const theme = normalizeTheme(result?.theme ?? cachedPreferences?.theme ?? DEFAULT_THEME);
    const colorTheme = normalizeColorTheme(result?.colorTheme ?? cachedPreferences?.colorTheme ?? DEFAULT_COLOR_THEME);

    syncThemeToDocument(theme, colorTheme);
    writeCachedPreferences(theme, colorTheme);
  });
})();
