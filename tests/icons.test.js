import { describe, test, expect } from '@jest/globals';

const {
  BELL_ICON,
  BELL_SLASH_ICON,
  CHEVRON_DOWN_ICON,
  SNOOZE_ICON,
  CHECK_ICON,
  STAR_ICON,
  PIN_ICON,
  PIN_FILLED_ICON,
  LINK_ICON,
  createSvg,
  getMuteIcon,
  getPinIcon
} = await import('../shared/icons.js');

describe('Icons', () => {
  describe('Icon Constants', () => {
    test('BELL_ICON is defined', () => {
      expect(BELL_ICON).toBeDefined();
      expect(BELL_ICON).toContain('<path');
    });

    test('BELL_SLASH_ICON is defined', () => {
      expect(BELL_SLASH_ICON).toBeDefined();
      expect(BELL_SLASH_ICON).toContain('<path');
    });

    test('CHEVRON_DOWN_ICON is defined', () => {
      expect(CHEVRON_DOWN_ICON).toBeDefined();
      expect(CHEVRON_DOWN_ICON).toContain('<path');
    });

    test('SNOOZE_ICON is defined', () => {
      expect(SNOOZE_ICON).toBeDefined();
      expect(SNOOZE_ICON).toContain('<path');
    });

    test('CHECK_ICON is defined', () => {
      expect(CHECK_ICON).toBeDefined();
      expect(CHECK_ICON).toContain('<path');
    });

    test('STAR_ICON is defined', () => {
      expect(STAR_ICON).toBeDefined();
      expect(STAR_ICON).toContain('<path');
    });

    test('PIN_ICON is defined', () => {
      expect(PIN_ICON).toBeDefined();
      expect(PIN_ICON).toContain('<path');
    });

    test('PIN_FILLED_ICON is defined', () => {
      expect(PIN_FILLED_ICON).toBeDefined();
      expect(PIN_FILLED_ICON).toContain('<path');
    });

    test('LINK_ICON is defined', () => {
      expect(LINK_ICON).toBeDefined();
      expect(LINK_ICON).toContain('<path');
    });
  });

  describe('createSvg', () => {
    test('creates SVG with default dimensions', () => {
      const svg = createSvg('<path d="M0 0"/>');
      expect(svg).toContain('width="16"');
      expect(svg).toContain('height="16"');
      expect(svg).toContain('viewBox="0 0 16 16"');
      expect(svg).toContain('<path d="M0 0"/>');
    });

    test('creates SVG with custom dimensions', () => {
      const svg = createSvg('<path d="M0 0"/>', 24, 24);
      expect(svg).toContain('width="24"');
      expect(svg).toContain('height="24"');
    });

    test('creates SVG with className', () => {
      const svg = createSvg('<path d="M0 0"/>', 16, 16, 'my-icon');
      expect(svg).toContain('class="my-icon"');
    });

    test('creates SVG without className when not provided', () => {
      const svg = createSvg('<path d="M0 0"/>');
      expect(svg).not.toContain('class=');
    });

    test('includes fill="currentColor"', () => {
      const svg = createSvg('<path d="M0 0"/>');
      expect(svg).toContain('fill="currentColor"');
    });
  });

  describe('getMuteIcon', () => {
    test('returns bell icon when not muted', () => {
      const icon = getMuteIcon(false);
      expect(icon).toContain(BELL_ICON);
      expect(icon).toContain('<svg');
      expect(icon).toContain('</svg>');
    });

    test('returns bell slash icon when muted', () => {
      const icon = getMuteIcon(true);
      expect(icon).toContain(BELL_SLASH_ICON);
      expect(icon).toContain('<svg');
      expect(icon).toContain('</svg>');
    });
  });

  describe('getPinIcon', () => {
    test('returns pin icon when not pinned', () => {
      const icon = getPinIcon(false);
      expect(icon).toContain(PIN_ICON);
      expect(icon).toContain('<svg');
      expect(icon).toContain('</svg>');
    });

    test('returns pin filled icon when pinned', () => {
      const icon = getPinIcon(true);
      expect(icon).toContain(PIN_FILLED_ICON);
      expect(icon).toContain('<svg');
      expect(icon).toContain('</svg>');
    });
  });
});
