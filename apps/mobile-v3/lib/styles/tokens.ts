/**
 * Design tokens — warm-paper palette matching v1.
 *
 * Direction: warm-paper background (#f8f6f1) + softened navy (#2d3a5a)
 * + single bright orange accent (#ea580c) reserved for hero CTA only.
 */
export const colors = {
  background: '#f8f6f1',
  foreground: '#2d3a5a',
  card: '#ffffff',
  cardForeground: '#2d3a5a',

  primary: '#2d3a5a',
  primaryForeground: '#f8f6f1',
  primaryAlpha30: 'rgba(45, 58, 90, 0.30)',
  secondary: '#ece8df',
  secondaryForeground: '#2d3a5a',
  muted: '#ebe7dd',
  mutedForeground: '#5f5b66',
  mutedDisabled: '#c5c0b6',
  accent: '#ea580c',
  accentForeground: '#ffffff',
  destructive: '#b91c1c',
  destructiveForeground: '#ffffff',
  destructiveSoft: '#fdecea',
  destructiveSoftText: '#b91c1c',

  border: '#b9b4a8',
  input: '#b9b4a8',
  ring: '#2d3a5a',

  surfaceMuted: '#f1eee6',
  surfaceEmphasis: '#fffdf8',
  surfaceShadow: '#1a1a2e',

  success: '#2f6f48',
  successSoft: '#edf7ef',
  successText: '#1e5632',
  successBorder: '#b2dfc0',
  warning: '#b66916',
  warningSoft: '#fff4e5',
  warningText: '#8a4e0f',
  warningBorder: '#f0d4a8',
  danger: '#b91c1c',
  dangerSoft: '#fdecea',
  dangerText: '#991b1b',
  dangerBorder: '#f5b8b8',
  info: '#2a5a9f',
  infoSoft: '#edf4ff',
  infoText: '#1e4a8a',
  infoBorder: '#b0cef0',
} as const;

export type ColorTokens = Record<keyof typeof colors, string>;

export const darkColors: ColorTokens = {
  background: '#1a1f2e',
  foreground: '#f0ede6',
  card: '#242a3a',
  cardForeground: '#f0ede6',

  primary: '#8ba3d4',
  primaryForeground: '#1a1f2e',
  primaryAlpha30: 'rgba(139, 163, 212, 0.30)',
  secondary: '#2a3040',
  secondaryForeground: '#c8c3b8',
  muted: '#2a3040',
  mutedForeground: '#8a8693',
  mutedDisabled: '#4a4656',
  accent: '#f97316',
  accentForeground: '#1a1f2e',
  destructive: '#f87171',
  destructiveForeground: '#1a1f2e',
  destructiveSoft: '#2e1a1a',
  destructiveSoftText: '#f87171',

  border: '#3d4456',
  input: '#3d4456',
  ring: '#8ba3d4',

  surfaceMuted: '#222838',
  surfaceEmphasis: '#2e3446',
  surfaceShadow: '#0a0c14',

  success: '#4ade80',
  successSoft: '#1a2e1f',
  successText: '#4ade80',
  successBorder: '#2a4a32',
  warning: '#fbbf24',
  warningSoft: '#2e2816',
  warningText: '#fbbf24',
  warningBorder: '#4a3a1a',
  danger: '#f87171',
  dangerSoft: '#2e1a1a',
  dangerText: '#f87171',
  dangerBorder: '#4a2222',
  info: '#60a5fa',
  infoSoft: '#1a2440',
  infoText: '#60a5fa',
  infoBorder: '#2a3a5a',
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  screen: 20,
  lg: 24,
  xl: 32,
  '2xl': 48,
} as const;

export const radii = {
  none: 0,
  sm: 4,
  md: 8,
  lg: 12,
  xl: 16,
  '2xl': 24,
  full: 9999,
} as const;

export const typography = {
  display: { fontSize: 34, fontWeight: '700' as const, lineHeight: 42 },
  h1: { fontSize: 32, fontWeight: '700' as const, lineHeight: 40 },
  title: { fontSize: 26, fontWeight: '700' as const, lineHeight: 34 },
  h2: { fontSize: 24, fontWeight: '600' as const, lineHeight: 32 },
  titleSm: { fontSize: 20, fontWeight: '700' as const, lineHeight: 28 },
  h3: { fontSize: 20, fontWeight: '600' as const, lineHeight: 28 },
  bodyLg: { fontSize: 18, fontWeight: '400' as const, lineHeight: 26 },
  body: { fontSize: 16, fontWeight: '400' as const, lineHeight: 24 },
  bodySmall: { fontSize: 14, fontWeight: '400' as const, lineHeight: 20 },
  label: { fontSize: 13, fontWeight: '700' as const, lineHeight: 18, letterSpacing: 0.08 * 13 },
  caption: { fontSize: 12, fontWeight: '400' as const, lineHeight: 16 },
} as const;

/* ------------------------------------------------------------------ */
/*  Surface depth helpers                                             */
/* ------------------------------------------------------------------ */

export type SurfaceDepth = 'flat' | 'raised' | 'floating';

const depthStyles = {
  flat: {
    shadowColor: 'transparent',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0,
    shadowRadius: 0,
    elevation: 0,
  },
  raised: {
    shadowColor: '#1a1a2e',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 2,
  },
  floating: {
    shadowColor: '#1a1a2e',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.12,
    shadowRadius: 24,
    elevation: 8,
  },
} as const;

export function getSurfaceDepthStyle(depth: SurfaceDepth = 'flat') {
  return depthStyles[depth];
}
