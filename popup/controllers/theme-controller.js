import { getSyncItem } from '../../shared/storage-helpers.js';
import { applyTheme } from '../../shared/utils.js';

export async function toggleDarkMode() {
  const currentTheme = await getSyncItem('theme', 'light');
  const newTheme = currentTheme === 'dark' ? 'light' : 'dark';

  chrome.storage.sync.set({ theme: newTheme });
  applyTheme(newTheme);
  updateDarkModeIcon();
}

export async function updateDarkModeIcon() {
  const btn = document.getElementById('darkModeBtn');
  if (!btn) return;

  const systemIcon = btn.querySelector('.system-icon');
  const moonIcon = btn.querySelector('.moon-icon');
  const sunIcon = btn.querySelector('.sun-icon');

  const currentTheme = await getSyncItem('theme', 'light');

  // Always hide system icon
  if (systemIcon) {
    systemIcon.classList.add('hidden');
    systemIcon.style.display = 'none';
    systemIcon.style.visibility = 'hidden';
  }

  // Show moon icon for light theme, hide for dark theme
  if (moonIcon) {
    if (currentTheme === 'dark') {
      moonIcon.classList.add('hidden');
      moonIcon.style.display = 'none';
      moonIcon.style.visibility = 'hidden';
    } else {
      moonIcon.classList.remove('hidden');
      moonIcon.style.display = 'block';
      moonIcon.style.visibility = 'visible';
    }
  }

  // Show sun icon for dark theme, hide for light theme
  if (sunIcon) {
    if (currentTheme === 'dark') {
      sunIcon.classList.remove('hidden');
      sunIcon.style.display = 'block';
      sunIcon.style.visibility = 'visible';
    } else {
      sunIcon.classList.add('hidden');
      sunIcon.style.display = 'none';
      sunIcon.style.visibility = 'hidden';
    }
  }
}
