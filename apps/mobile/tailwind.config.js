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
      borderRadius: {
        lg: "2px",
        md: "2px",
        sm: "1px",
      },
      colors: {
        background: "#f8f6f1",
        foreground: "#1a1a2e",
        card: "#ffffff",
        "card-foreground": "#1a1a2e",
        primary: {
          DEFAULT: "#1a1a2e",
          foreground: "#f8f6f1",
        },
        secondary: {
          DEFAULT: "#eae7df",
          foreground: "#1a1a2e",
        },
        muted: {
          DEFAULT: "#eae7df",
          foreground: "#5c5c6e",
        },
        accent: {
          DEFAULT: "#eae7df",
          foreground: "#1a1a2e",
        },
        destructive: {
          DEFAULT: "#8b0000",
          foreground: "#ffffff",
        },
        border: "#c2bfb5",
        input: "#c2bfb5",
        ring: "#1a1a2e",
      },
    },
  },
  plugins: [],
};
