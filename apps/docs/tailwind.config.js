/**
 * Mirror of `apps/mobile/lib/design-tokens/colors.ts`.
 *
 * The mobile app is the source of truth; this file is a deliberate web copy
 * so the docs site doesn't need to import from the RN package. If the mobile
 * tokens change, update this file in lockstep.
 *
 * Direction: warm-paper background + softened navy chrome + single saturated
 * orange accent reserved for hero CTAs / active-tab underlines.
 */
const colors = {
  background: "#f8f6f1",
  foreground: "#2d3a5a",
  card: "#ffffff",
  "card-foreground": "#2d3a5a",
  surface: {
    muted: "#f1eee6",
    emphasis: "#fffdf8",
    shadow: "#1a1a2e",
  },
  primary: {
    DEFAULT: "#2d3a5a",
    foreground: "#f8f6f1",
  },
  secondary: {
    DEFAULT: "#ece8df",
    foreground: "#2d3a5a",
  },
  muted: {
    DEFAULT: "#ebe7dd",
    foreground: "#5f5b66",
  },
  accent: {
    DEFAULT: "#ea580c",
    foreground: "#ffffff",
  },
  warning: {
    DEFAULT: "#b66916",
    soft: "#fff4e5",
    text: "#8e510e",
  },
  success: {
    DEFAULT: "#2f6f48",
    soft: "#edf7ef",
    text: "#245338",
  },
  border: "#b9b4a8",
  ring: "#2d3a5a",
};

/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./app/**/*.{ts,tsx,md,mdx}",
    "./components/**/*.{ts,tsx}",
    "./content/**/*.{md,mdx}",
  ],
  theme: {
    extend: {
      colors,
      fontFamily: {
        sans: [
          "ui-sans-serif",
          "system-ui",
          "-apple-system",
          "Segoe UI",
          "Roboto",
          "sans-serif",
        ],
      },
      fontSize: {
        display: ["2.125rem", { lineHeight: "2.5rem", fontWeight: "700" }],
        title: ["1.625rem", { lineHeight: "2rem", fontWeight: "700" }],
        "title-sm": ["1.25rem", { lineHeight: "1.625rem", fontWeight: "700" }],
        body: ["1rem", { lineHeight: "1.5rem" }],
        label: [
          "0.8125rem",
          { lineHeight: "1rem", fontWeight: "700", letterSpacing: "0.08em" },
        ],
      },
      borderRadius: {
        xl: "12px",
        lg: "8px",
        md: "6px",
        sm: "4px",
      },
      maxWidth: {
        prose: "70ch",
      },
    },
  },
  plugins: [],
};
