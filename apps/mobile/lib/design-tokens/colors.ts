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
 * Design references:
 *   - shadcn/ui theming (semantic token shape, fg-on-bg pairing)
 *     https://ui.shadcn.com/docs/theming
 *   - Radix Colors 12-step semantic scale (functional roles per step)
 *     https://www.radix-ui.com/colors/docs/palette-composition/scales
 *   - Anthropic frontend-design SKILL.md (commit to a confident direction)
 *     https://github.com/anthropics/skills/blob/main/skills/frontend-design
 *
 * Direction (this revision):
 *   The previous warm-paper + clay-orange palette read as a hobbyist café
 *   aesthetic and clashed with the construction-site-report domain. This
 *   revision moves to a cool slate neutral with a saturated safety-amber
 *   accent — grounded, professional, and outdoor-legible. Status colors
 *   are unified into a single family (Tailwind {hue}-700 text on {hue}-100
 *   surface with {hue}-300 border, ~8:1 contrast across all four).
 *
 * Contrast (WCAG AA, target 4.5:1 normal text / 3:1 large text & UI):
 *   foreground on bg                #0f172a on #f7f8fa  16.80
 *   foreground on card              #0f172a on #ffffff  17.85
 *   muted.foreground on bg          #475569 on #f7f8fa   7.13
 *   muted.foreground on card        #475569 on #ffffff   7.58
 *   muted.disabled on card          #64748b on #ffffff   4.76
 *   primary.foreground on primary   #ffffff on #c2410c   5.18
 *   destructive.fg on destructive   #ffffff on #b91c1c   6.47
 *   accent.foreground on accent     #7c2d12 on #fed7aa   6.92
 *   success.text on success.soft    #14532d on #dcfce7   8.30
 *   warning.text on warning.soft    #713f12 on #fef9c3   8.07
 *   danger.text  on danger.soft     #7f1d1d on #fee2e2   8.20
 *   info.text    on info.soft       #1e3a8a on #dbeafe   8.49
 *   ring on bg                      #c2410c on #f7f8fa   4.87
 *   input border on card            #64748b on #ffffff   4.76 (>3:1 UI)
 *
 * Decorative `border` (#e2e8f0) is intentionally low-contrast — it
 * separates surfaces visually without carrying meaning. State-bearing
 * boundaries use `input` (slate-500), `ring` (primary), or status borders.
 */

export const colors = {
  // App surfaces (Radix step 1–2)
  background: "#f7f8fa",
  foreground: "#0f172a",
  card: "#ffffff",
  cardForeground: "#0f172a",

  surface: {
    muted: "#eef0f4",
    emphasis: "#fbfcfd",
    shadow: "#0f172a",
  },

  // Brand: safety-amber. Construction/site-work association,
  // strong in sunlight, passes 4.5:1 on white with white text.
  primary: {
    DEFAULT: "#c2410c", // amber-700
    foreground: "#ffffff",
    alpha30: "rgba(194, 65, 12, 0.3)",
  },
  secondary: {
    DEFAULT: "#e2e8f0", // slate-200
    foreground: "#0f172a",
  },
  muted: {
    DEFAULT: "#eef0f4",
    foreground: "#475569", // slate-600
    disabled: "#64748b", // slate-500 — perceivable disabled, 4.76:1 on card
  },
  accent: {
    DEFAULT: "#fed7aa", // amber-200 surface
    foreground: "#7c2d12", // amber-900 text — 6.92:1
  },
  destructive: {
    DEFAULT: "#b91c1c", // red-700
    foreground: "#ffffff",
  },

  // Status family — Tailwind {hue}-700 / {hue}-100 / {hue}-300 conventions.
  // All four hues share the same lightness/saturation tier so they read
  // as one family rather than four random colors.
  success: {
    DEFAULT: "#15803d", // green-700
    soft: "#dcfce7", // green-100
    text: "#14532d", // green-900
    border: "#86efac", // green-300
  },
  warning: {
    DEFAULT: "#a16207", // yellow-700
    soft: "#fef9c3", // yellow-100
    text: "#713f12", // yellow-900
    border: "#fde047", // yellow-300
  },
  danger: {
    DEFAULT: "#b91c1c", // red-700
    soft: "#fee2e2", // red-100
    text: "#7f1d1d", // red-900
    border: "#fca5a5", // red-300
  },
  info: {
    DEFAULT: "#1d4ed8", // blue-700
    soft: "#dbeafe", // blue-100
    text: "#1e3a8a", // blue-900
    border: "#93c5fd", // blue-300
  },

  border: "#e2e8f0", // decorative (slate-200)
  input: "#64748b", // state-bearing input border (slate-500), 4.76:1 on card
  ring: "#c2410c", // focus ring matches primary

  chart: {
    grid: "#e2e8f0",
    track: "#eef0f4",
    fill: "#0f172a",
  },
} as const;

export type Colors = typeof colors;
