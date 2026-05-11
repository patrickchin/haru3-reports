import { describe, it, expect } from 'vitest';
import {
  colors,
  darkColors,
  spacing,
  radii,
  typography,
  getSurfaceDepthStyle,
} from '../tokens';
import type { SurfaceDepth } from '../tokens';

// ---------------------------------------------------------------------------
// Color validation helpers
// ---------------------------------------------------------------------------

const HEX_RE = /^#[0-9a-fA-F]{6}$/;
const RGBA_RE = /^rgba\(\s*\d{1,3},\s*\d{1,3},\s*\d{1,3},\s*[\d.]+\s*\)$/;

function isValidColor(value: string): boolean {
  return HEX_RE.test(value) || RGBA_RE.test(value);
}

// ---------------------------------------------------------------------------
// Colors
// ---------------------------------------------------------------------------

describe('colors (light)', () => {
  it('every value is a valid hex or rgba color', () => {
    for (const [key, value] of Object.entries(colors)) {
      expect(isValidColor(value), `colors.${key} = "${value}" is not valid`).toBe(true);
    }
  });
});

describe('darkColors', () => {
  it('every value is a valid hex or rgba color', () => {
    for (const [key, value] of Object.entries(darkColors)) {
      expect(isValidColor(value), `darkColors.${key} = "${value}" is not valid`).toBe(true);
    }
  });

  it('has the same keys as light colors', () => {
    const lightKeys = Object.keys(colors).sort();
    const darkKeys = Object.keys(darkColors).sort();
    expect(darkKeys).toEqual(lightKeys);
  });
});

// ---------------------------------------------------------------------------
// Spacing & Radii
// ---------------------------------------------------------------------------

describe('spacing', () => {
  it('has expected keys', () => {
    expect(Object.keys(spacing)).toEqual(
      expect.arrayContaining(['xs', 'sm', 'md', 'lg', 'xl', '2xl', 'screen']),
    );
  });

  it('all values are positive numbers', () => {
    for (const [key, value] of Object.entries(spacing)) {
      expect(typeof value, `spacing.${key}`).toBe('number');
      expect(value, `spacing.${key}`).toBeGreaterThan(0);
    }
  });
});

describe('radii', () => {
  it('has expected keys', () => {
    expect(Object.keys(radii)).toEqual(
      expect.arrayContaining(['none', 'sm', 'md', 'lg', 'xl', '2xl', 'full']),
    );
  });

  it('all values are non-negative numbers', () => {
    for (const [key, value] of Object.entries(radii)) {
      expect(typeof value, `radii.${key}`).toBe('number');
      expect(value, `radii.${key}`).toBeGreaterThanOrEqual(0);
    }
  });
});

// ---------------------------------------------------------------------------
// Typography
// ---------------------------------------------------------------------------

describe('typography', () => {
  it('every entry has fontSize, fontWeight, lineHeight', () => {
    for (const [key, style] of Object.entries(typography)) {
      expect(style, `typography.${key}`).toHaveProperty('fontSize');
      expect(style, `typography.${key}`).toHaveProperty('fontWeight');
      expect(style, `typography.${key}`).toHaveProperty('lineHeight');
      expect(typeof style.fontSize).toBe('number');
      expect(typeof style.lineHeight).toBe('number');
    }
  });

  it('lineHeight >= fontSize for every entry', () => {
    for (const [key, style] of Object.entries(typography)) {
      expect(
        style.lineHeight,
        `typography.${key}: lineHeight (${style.lineHeight}) < fontSize (${style.fontSize})`,
      ).toBeGreaterThanOrEqual(style.fontSize);
    }
  });
});

// ---------------------------------------------------------------------------
// getSurfaceDepthStyle
// ---------------------------------------------------------------------------

describe('getSurfaceDepthStyle', () => {
  it('returns flat style by default', () => {
    const style = getSurfaceDepthStyle();
    expect(style.elevation).toBe(0);
    expect(style.shadowOpacity).toBe(0);
  });

  it.each<[SurfaceDepth, number]>([
    ['flat', 0],
    ['raised', 2],
    ['floating', 4],
  ])('depth "%s" returns elevation %d', (depth, expectedElevation) => {
    const style = getSurfaceDepthStyle(depth);
    expect(style.elevation).toBe(expectedElevation);
    expect(style).toHaveProperty('shadowColor');
    expect(style).toHaveProperty('shadowOffset');
    expect(style).toHaveProperty('shadowOpacity');
    expect(style).toHaveProperty('shadowRadius');
  });

  it('raised has greater shadowOpacity than flat', () => {
    expect(getSurfaceDepthStyle('raised').shadowOpacity).toBeGreaterThan(
      getSurfaceDepthStyle('flat').shadowOpacity,
    );
  });

  it('floating has greater shadowOpacity than raised', () => {
    expect(getSurfaceDepthStyle('floating').shadowOpacity).toBeGreaterThan(
      getSurfaceDepthStyle('raised').shadowOpacity,
    );
  });
});

// ---------------------------------------------------------------------------
// Snapshot — catches accidental token changes
// ---------------------------------------------------------------------------

describe('token snapshots', () => {
  it('light colors snapshot', () => {
    expect(colors).toMatchSnapshot();
  });

  it('dark colors snapshot', () => {
    expect(darkColors).toMatchSnapshot();
  });

  it('spacing snapshot', () => {
    expect(spacing).toMatchSnapshot();
  });

  it('radii snapshot', () => {
    expect(radii).toMatchSnapshot();
  });

  it('typography snapshot', () => {
    expect(typography).toMatchSnapshot();
  });
});
