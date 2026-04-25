import { getSyncItem, setSyncItem } from '../../shared/storage-helpers.js';
import { applyTheme } from '../../shared/utils.js';

export async function toggleDarkMode() {
  const currentTheme = await getSyncItem('theme', 'system');
  const newTheme = currentTheme === 'dark' ? 'light' : 'dark';

  await setSyncItem('theme', newTheme);
  applyTheme(newTheme);
  updateDarkModeIcon();
}

export async function updateDarkModeIcon() {
  const btn = document.getElementById('darkModeBtn');
  if (!btn) return;

  const systemIcon = btn.querySelector('.system-icon');
  const moonIcon = btn.querySelector('.moon-icon');
  const sunIcon = btn.querySelector('.sun-icon');

  const currentTheme = await getSyncItem('theme', 'system');

  if (systemIcon) {
    systemIcon.classList.toggle('hidden', currentTheme !== 'system');
  }

  if (moonIcon) {
    moonIcon.classList.toggle('hidden', currentTheme !== 'light');
  }

  if (sunIcon) {
    sunIcon.classList.toggle('hidden', currentTheme !== 'dark');
  }
}
