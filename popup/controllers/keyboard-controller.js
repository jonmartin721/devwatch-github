/**
 * Sets up keyboard navigation and shortcuts for the popup
 * @param {Function} handleRefreshCallback - Callback for refresh action (r key)
 * @param {Function} toggleSearchCallback - Callback for search toggle (s key)
 * @param {Function} toggleArchiveCallback - Callback for archive toggle (a key)
 */
export function setupKeyboardNavigation(
  handleRefreshCallback,
  toggleSearchCallback,
  toggleArchiveCallback
) {
  const searchBox = document.getElementById('searchBox');

  // Handle keyboard shortcuts
  document.addEventListener('keydown', (e) => {
    // Only handle shortcuts when not in input fields
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
      return;
    }

    switch (e.key) {
      case 'r':
      case 'R':
        if (!e.ctrlKey && !e.metaKey) {
          e.preventDefault();
          handleRefreshCallback();
        }
        break;
      case 's':
      case 'S':
        if (!e.ctrlKey && !e.metaKey) {
          e.preventDefault();
          toggleSearchCallback();
        }
        break;
      case 'a':
      case 'A':
        if (!e.ctrlKey && !e.metaKey) {
          e.preventDefault();
          toggleArchiveCallback();
        }
        break;
      case 'Escape':
        if (searchBox && searchBox.style.display !== 'none') {
          toggleSearchCallback();
        }
        break;
    }
  });

  // Enhanced tab navigation for filter buttons
  const filterButtons = document.querySelectorAll('.filter-btn');
  filterButtons.forEach((btn, index) => {
    btn.addEventListener('keydown', (e) => {
      switch (e.key) {
        case 'ArrowRight':
        case 'ArrowDown': {
          e.preventDefault();
          const nextIndex = (index + 1) % filterButtons.length;
          filterButtons[nextIndex].focus();
          filterButtons[nextIndex].click();
          break;
        }
        case 'ArrowLeft':
        case 'ArrowUp': {
          e.preventDefault();
          const prevIndex = (index - 1 + filterButtons.length) % filterButtons.length;
          filterButtons[prevIndex].focus();
          filterButtons[prevIndex].click();
          break;
        }
        case 'Enter':
        case ' ':
          e.preventDefault();
          btn.click();
          break;
      }
    });
  });
}

/**
 * Updates ARIA attributes for filter buttons to improve accessibility
 * Should be called after renderActivities to keep ARIA states in sync
 */
export function updateFilterButtonAria() {
  const filterButtons = document.querySelectorAll('.filter-btn');
  filterButtons.forEach(btn => {
    const isActive = btn.classList.contains('active');
    btn.setAttribute('aria-selected', isActive.toString());
    btn.setAttribute('tabindex', isActive ? '0' : '-1');
  });
}
