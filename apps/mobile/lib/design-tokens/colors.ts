/**
 * Single source of truth for color tokens.
 *
 * Consumed by:
 *   - tailwind.config.js (NativeWind utility classes)
 *   - any .tsx file that needs a literal hex (Lucide icons,
 *     ActivityIndicator, Stack contentStyle, placeholderTextColor,
 *     react-native-svg fills, surface shadows, etc.)
 *
 * Do NOT inline hex strings anywhere else in `app/` or `components/`.
 *
 * Direction: warm-paper background with a near-black navy primary.
 * This matches the pre-orange palette established in commit b649f60
 * ("redesign UI to formal boxed report-style aesthetic"). The orange
 * accent direction (commit 46d504e) and the cool-slate redesign that
 * followed (PR #5) are both reverted.
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
    DEFAULT: "#1a1a2e",
    foreground: "#f8f6f1",
    alpha30: "rgba(26, 26, 46, 0.3)",
  },
  secondary: {
    DEFAULT: "#ece8df",
    foreground: "#1a1a2e",
  },
  muted: {
    DEFAULT: "#ebe7dd",
    foreground: "#5f5b66",
    disabled: "#8a8693",
  },
  accent: {
    DEFAULT: "#ebe7dd",
    foreground: "#1a1a2e",
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

  border: "#b9b4a8",
  input: "#b9b4a8",
  ring: "#1a1a2e",

  chart: {
    grid: "#b9b4a8",
    track: "#ebe7dd",
    fill: "#1a1a2e",
  },
} as const;

export type Colors = typeof colors;
