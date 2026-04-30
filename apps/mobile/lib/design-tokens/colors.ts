/**
 * Single source of truth for color tokens.
 *
 * Consumed by:
 *   - tailwind.config.js (NativeWind utility classes)
 *   - any .tsx file that needs a literal hex (Lucide icons,
 *     ActivityIndicator, Stack contentStyle, placeholderTextColor,
 *     react-native-svg fills, etc.)
 *
 * Do NOT inline hex strings anywhere else in `app/` or `components/`.
 *
 * Notes on this revision:
 *   - `primary.DEFAULT` darkened from `#ea6a1f` → `#c0560f` so that
 *     `primary.foreground` (white) on `primary` clears WCAG AA normal
 *     text contrast (4.5:1). The previous `#ea6a1f`+`#fffaf2` pair
 *     measured 3.07:1 and failed AA on every primary CTA.
 *   - `primary.foreground` normalised from `#fffaf2` to `#ffffff`
 *     (every consumer was already using `#ffffff`/`#f8f5ee`/`#f8f6f1`).
 *   - `muted.foreground` reconciled from `#5f5b66` → `#5c5c6e` to
 *     match the value already used in 33+ icon/text sites.
 *   - Added `muted.disabled` (replaces inline `#b0b0b8`, raised from
 *     2.15:1 to 3.4:1 for perceivable disabled state).
 *   - Added `chart.{grid, track, fill}`, `surface.shadow`, and
 *     `primary.alpha30` for surfaces that previously used off-palette
 *     literals.
 */

export const colors = {
  background: "#f8f6f1",
  foreground: "#1a1a2e",
  card: "#ffffff",
  cardForeground: "#1a1a2e",

  surface: {
    muted: "#f1eee6",
    emphasis: "#fffdf8",
    shadow: "#1a1a2e",
  },

  primary: {
    DEFAULT: "#c0560f",
    foreground: "#ffffff",
    alpha30: "rgba(192, 86, 15, 0.3)",
  },
  secondary: {
    DEFAULT: "#ece8df",
    foreground: "#1a1a2e",
  },
  muted: {
    DEFAULT: "#ebe7dd",
    foreground: "#5c5c6e",
    disabled: "#8a8693",
  },
  accent: {
    DEFAULT: "#fde2cc",
    foreground: "#7a3209",
  },
  destructive: {
    DEFAULT: "#b3261e",
    foreground: "#ffffff",
  },

  success: {
    DEFAULT: "#2f6f48",
    soft: "#edf7ef",
    text: "#245338",
    border: "#8fc2a0",
  },
  warning: {
    DEFAULT: "#b66916",
    soft: "#fff4e5",
    text: "#8e510e",
    border: "#e3b16e",
  },
  danger: {
    DEFAULT: "#b3261e",
    soft: "#fdecea",
    text: "#8f1d18",
    border: "#e0a6a1",
  },
  info: {
    DEFAULT: "#2a5a9f",
    soft: "#edf4ff",
    text: "#244b82",
    border: "#9fb7df",
  },

  border: "#c8bfae",
  input: "#c8bfae",
  ring: "#c0560f",

  chart: {
    grid: "#c8bfae",
    track: "#ebe7dd",
    fill: "#1a1a2e",
  },
} as const;

export type Colors = typeof colors;
