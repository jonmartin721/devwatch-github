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

  if (systemIcon) {
    systemIcon.style.display = 'none';
    systemIcon.style.visibility = 'hidden';
  }

  if (moonIcon) {
    const moonDisplay = currentTheme === 'dark' ? 'none' : 'block';
    const moonVisibility = currentTheme === 'dark' ? 'hidden' : 'visible';
    moonIcon.style.display = moonDisplay;
    moonIcon.style.visibility = moonVisibility;
  }

  if (sunIcon) {
    const sunDisplay = currentTheme === 'dark' ? 'block' : 'none';
    const sunVisibility = currentTheme === 'dark' ? 'visible' : 'hidden';
    sunIcon.style.display = sunDisplay;
    sunIcon.style.visibility = sunVisibility;
  }
}
