// Tailwind theme tokens come from the shared `@harpa/report-ui`
// preset so the library and the mobile app render the same colour
// ramp, typography, and spacing scale. Edit values in
// `packages/report-ui/tailwind-preset.cjs` (and its underlying
// `src/tokens/colors.ts`), not here.
const reportUiPreset = require("@harpa/report-ui/tailwind-preset");

/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./app/**/*.{js,jsx,ts,tsx}",
    "./components/**/*.{js,jsx,ts,tsx}",
    "../../packages/report-ui/src/**/*.{ts,tsx}",
  ],
  presets: [require("nativewind/preset"), reportUiPreset],
};
