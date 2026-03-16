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
        lg: "16px",
        md: "12px",
        sm: "8px",
      },
      colors: {
        background: "#ffffff",
        foreground: "#0a0a0b",
        card: "#ffffff",
        "card-foreground": "#0a0a0b",
        primary: {
          DEFAULT: "#f47316",
          foreground: "#ffffff",
        },
        secondary: {
          DEFAULT: "#f1f1f4",
          foreground: "#1a1a1e",
        },
        muted: {
          DEFAULT: "#f1f1f4",
          foreground: "#6e6e77",
        },
        accent: {
          DEFAULT: "#f1f1f4",
          foreground: "#1a1a1e",
        },
        destructive: {
          DEFAULT: "#e5383b",
          foreground: "#ffffff",
        },
        border: "#e4e4e7",
        input: "#e4e4e7",
        ring: "#f47316",
      },
    },
  },
  plugins: [],
};
