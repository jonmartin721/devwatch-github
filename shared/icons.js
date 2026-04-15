/**
 * Shared SVG icon constants — Lucide stroke-based icons
 */

/**
 * Bell icon (unmuted state) - Lucide bell
 */
export const BELL_ICON = '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>';

/**
 * Bell with slash icon (muted state) - Lucide bell-off
 */
export const BELL_SLASH_ICON = '<path d="M8.7 3A6 6 0 0 1 18 8a21.3 21.3 0 0 0 .6 5"/><path d="M17 17H3s3-2 3-9a4.67 4.67 0 0 1 .3-1.7"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/><line x1="2" x2="22" y1="2" y2="22"/>';

/**
 * Chevron down icon (for collapsible sections) - Lucide chevron-down
 */
export const CHEVRON_DOWN_ICON = '<path d="m6 9 6 6 6-6"/>';

/**
 * Snooze/clock icon - Lucide clock
 */
export const SNOOZE_ICON = '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>';

/**
 * Check/checkmark icon - Lucide check
 */
export const CHECK_ICON = '<path d="M20 6 9 17l-5-5"/>';

/**
 * Star icon - Lucide star
 */
export const STAR_ICON = '<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>';

/**
 * Pin icon (unpinned state) - Lucide pin
 */
export const PIN_ICON = '<line x1="12" x2="12" y1="17" y2="22"/><path d="M5 17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V6h1a2 2 0 0 0 0-4H8a2 2 0 0 0 0 4h1v4.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24Z"/>';

/**
 * Pin filled icon (pinned state) - Lucide pin with fill
 */
export const PIN_FILLED_ICON = '<line x1="12" x2="12" y1="17" y2="22"/><path fill="currentColor" d="M5 17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V6h1a2 2 0 0 0 0-4H8a2 2 0 0 0 0 4h1v4.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24Z"/>';

/**
 * External link icon - Lucide external-link
 */
export const LINK_ICON = '<path d="M15 3h6v6"/><path d="M10 14 21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>';

/**
 * Helper to create a complete SVG element (Lucide stroke-based)
 * @param {string} path - SVG path data
 * @param {number} width - Width in pixels (default: 16)
 * @param {number} height - Height in pixels (default: 16)
 * @param {string} className - Optional CSS class
 * @returns {string} Complete SVG element string
 */
export function createSvg(path, width = 16, height = 16, className = '') {
  const classAttr = className ? ` class="${className}"` : '';
  return `<svg width="${width}" height="${height}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"${classAttr}>${path}</svg>`;
}

/**
 * Get mute button icon based on state
 * @param {boolean} isMuted - Whether the item is muted
 * @returns {string} SVG element string
 */
export function getMuteIcon(isMuted) {
  return createSvg(isMuted ? BELL_SLASH_ICON : BELL_ICON, 16, 16);
}

/**
 * Get pin button icon based on state
 * @param {boolean} isPinned - Whether the item is pinned
 * @returns {string} SVG element string
 */
export function getPinIcon(isPinned) {
  return createSvg(isPinned ? PIN_FILLED_ICON : PIN_ICON, 16, 16);
}
