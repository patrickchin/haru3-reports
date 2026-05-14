/**
 * Re-export shim. The canonical colour ramp lives in
 * `@harpa/report-ui/tokens` so the lib and the mobile app share a
 * single source of truth (Tailwind preset + literal-hex consumers).
 *
 * Edit values in `packages/report-ui/src/tokens/colors.ts`, not here.
 */
export { colors, type Colors } from "@harpa/report-ui/tokens";
