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
  secondary: '#ece8df',
  secondaryForeground: '#2d3a5a',
  muted: '#ebe7dd',
  mutedForeground: '#5f5b66',
  accent: '#ea580c',
  accentForeground: '#ffffff',
  destructive: '#b91c1c',
  destructiveForeground: '#ffffff',

  border: '#b9b4a8',
  input: '#b9b4a8',
  ring: '#2d3a5a',

  surfaceMuted: '#f1eee6',
  surfaceEmphasis: '#fffdf8',
  surfaceShadow: '#1a1a2e',

  success: '#2f6f48',
  successSoft: '#edf7ef',
  warning: '#b66916',
  warningSoft: '#fff4e5',
  danger: '#b91c1c',
  dangerSoft: '#fdecea',
  info: '#2a5a9f',
  infoSoft: '#edf4ff',
} as const;

export type ColorTokens = Record<keyof typeof colors, string>;

export const darkColors: ColorTokens = {
  background: '#1a1f2e',
  foreground: '#f0ede6',
  card: '#242a3a',
  cardForeground: '#f0ede6',

  primary: '#8ba3d4',
  primaryForeground: '#1a1f2e',
  secondary: '#2a3040',
  secondaryForeground: '#c8c3b8',
  muted: '#2a3040',
  mutedForeground: '#8a8693',
  accent: '#f97316',
  accentForeground: '#1a1f2e',
  destructive: '#f87171',
  destructiveForeground: '#1a1f2e',

  border: '#3d4456',
  input: '#3d4456',
  ring: '#8ba3d4',

  surfaceMuted: '#222838',
  surfaceEmphasis: '#2e3446',
  surfaceShadow: '#0a0c14',

  success: '#4ade80',
  successSoft: '#1a2e1f',
  warning: '#fbbf24',
  warningSoft: '#2e2816',
  danger: '#f87171',
  dangerSoft: '#2e1a1a',
  info: '#60a5fa',
  infoSoft: '#1a2440',
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
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
  h1: { fontSize: 32, fontWeight: '700' as const, lineHeight: 40 },
  h2: { fontSize: 24, fontWeight: '600' as const, lineHeight: 32 },
  h3: { fontSize: 20, fontWeight: '600' as const, lineHeight: 28 },
  body: { fontSize: 16, fontWeight: '400' as const, lineHeight: 24 },
  bodySmall: { fontSize: 14, fontWeight: '400' as const, lineHeight: 20 },
  caption: { fontSize: 12, fontWeight: '400' as const, lineHeight: 16 },
  label: { fontSize: 14, fontWeight: '500' as const, lineHeight: 20 },
} as const;
