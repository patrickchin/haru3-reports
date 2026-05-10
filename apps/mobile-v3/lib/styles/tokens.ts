export const colors = {
  background: '#FFFFFF',
  foreground: '#0F172A',
  primary: '#3B82F6',
  primaryForeground: '#FFFFFF',
  secondary: '#F1F5F9',
  secondaryForeground: '#475569',
  muted: '#F8FAFC',
  mutedForeground: '#64748B',
  accent: '#F1F5F9',
  accentForeground: '#0F172A',
  destructive: '#EF4444',
  destructiveForeground: '#FFFFFF',
  border: '#E2E8F0',
  input: '#E2E8F0',
  ring: '#3B82F6',
  card: '#FFFFFF',
  cardForeground: '#0F172A',
  success: '#22C55E',
  warning: '#F59E0B',
  error: '#EF4444',
  info: '#3B82F6',
  orange: '#F47316',
} as const;

export type ColorTokens = Record<keyof typeof colors, string>;

export const darkColors: ColorTokens = {
  background: '#0F172A',
  foreground: '#F8FAFC',
  primary: '#60A5FA',
  primaryForeground: '#0F172A',
  secondary: '#1E293B',
  secondaryForeground: '#CBD5E1',
  muted: '#1E293B',
  mutedForeground: '#94A3B8',
  accent: '#1E293B',
  accentForeground: '#F8FAFC',
  destructive: '#F87171',
  destructiveForeground: '#0F172A',
  border: '#334155',
  input: '#334155',
  ring: '#60A5FA',
  card: '#1E293B',
  cardForeground: '#F8FAFC',
  success: '#4ADE80',
  warning: '#FBBF24',
  error: '#F87171',
  info: '#60A5FA',
  orange: '#FB923C',
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
