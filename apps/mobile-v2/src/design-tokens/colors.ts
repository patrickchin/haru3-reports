export const colors = {
  background: "#f8f6f1",
  foreground: "#2d3a5a",
  card: "#ffffff",
  cardForeground: "#2d3a5a",

  surface: {
    muted: "#f1eee6",
    emphasis: "#fffdf8",
    shadow: "#1a1a2e",
  },

  primary: {
    DEFAULT: "#2d3a5a",
    foreground: "#f8f6f1",
    alpha30: "rgba(45, 58, 90, 0.3)",
  },
  secondary: {
    DEFAULT: "#ece8df",
    foreground: "#2d3a5a",
  },
  muted: {
    DEFAULT: "#ebe7dd",
    foreground: "#5f5b66",
    disabled: "#8a8693",
  },
  accent: {
    DEFAULT: "#ea580c",
    foreground: "#ffffff",
  },
  destructive: {
    DEFAULT: "#b91c1c",
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
    DEFAULT: "#b91c1c",
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
  ring: "#2d3a5a",

  chart: {
    grid: "#b9b4a8",
    track: "#ebe7dd",
    fill: "#2d3a5a",
  },
} as const;

export type Colors = typeof colors;
