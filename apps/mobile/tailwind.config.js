/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./app/**/*.{js,jsx,ts,tsx}",
    "./components/**/*.{js,jsx,ts,tsx}",
  ],
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      fontFamily: {
        sans: ["System", "sans-serif"],
      },
      fontSize: {
        display: ["2.125rem", { lineHeight: "2.5rem", fontWeight: "700" }],
        title: ["1.625rem", { lineHeight: "2rem", fontWeight: "700" }],
        "title-sm": ["1.25rem", { lineHeight: "1.625rem", fontWeight: "700" }],
        metric: ["2rem", { lineHeight: "2.25rem", fontWeight: "700" }],
        body: ["1rem", { lineHeight: "1.5rem" }],
        "body-lg": ["1.125rem", { lineHeight: "1.625rem" }],
        label: ["0.8125rem", { lineHeight: "1rem", fontWeight: "700", letterSpacing: "0.08em" }],
      },
      borderRadius: {
        xl: "12px",
        lg: "8px",
        md: "6px",
        sm: "4px",
      },
      minHeight: {
        touch: "44px",
        "touch-lg": "52px",
      },
      height: {
        touch: "44px",
        "touch-lg": "52px",
      },
      spacing: {
        4.5: "18px",
        5.5: "22px",
        18: "72px",
      },
      colors: {
        background: "#f8f6f1",
        foreground: "#1a1a2e",
        card: "#ffffff",
        "card-foreground": "#1a1a2e",
        surface: {
          muted: "#f1eee6",
          emphasis: "#fffdf8",
        },
        primary: {
          DEFAULT: "#1a1a2e",
          foreground: "#f8f6f1",
        },
        secondary: {
          DEFAULT: "#ece8df",
          foreground: "#1a1a2e",
        },
        muted: {
          DEFAULT: "#ebe7dd",
          foreground: "#5f5b66",
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
      },
    },
  },
  plugins: [],
};
