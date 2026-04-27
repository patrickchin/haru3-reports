/**
 * Generation policy.
 *
 * Pure function returning whether the generation worker may run **right
 * now**, based on user-selected mode, network, battery, app state, and
 * a per-day cost budget. Decoupled from any platform API so it can be
 * tested exhaustively.
 *
 * Decision matrix (locked in docs/features/05-local-first-offline.md):
 *
 *   mode = 'manual'       → only run on userInitiated
 *   mode = 'auto_wifi'    → run on wifi, ≥20% battery, app foreground
 *                            OR userInitiated regardless of conditions
 *   mode = 'auto_any'     → run on any reachable network, ≥20% battery
 *                            OR userInitiated regardless of conditions
 *
 * userInitiated = the user just tapped "Generate now"; treated as an
 * explicit override of the gates (except budget — which is a hard cap).
 */
export type GenerationMode = "manual" | "auto_wifi" | "auto_any";

export type NetType = "wifi" | "cellular" | "unknown" | "none";

export type GenerationContext = {
  mode: GenerationMode;
  net: { reachable: boolean; type: NetType };
  battery: { level: number; charging: boolean };
  appState: "active" | "background" | "inactive";
  budget: { spentToday: number; limit: number };
  userInitiated: boolean;
};

export type GenerationDecision = "run" | "wait" | "skip-needs-user";

const MIN_BATTERY = 0.2;

export function shouldRunNow(ctx: GenerationContext): GenerationDecision {
  // Hard cap: budget overrides everything.
  if (ctx.budget.spentToday >= ctx.budget.limit) return "skip-needs-user";

  if (ctx.userInitiated) {
    if (!ctx.net.reachable) return "wait";
    return "run";
  }

  if (ctx.mode === "manual") return "skip-needs-user";

  if (!ctx.net.reachable) return "wait";

  // Battery: charging exempts the threshold.
  if (!ctx.battery.charging && ctx.battery.level < MIN_BATTERY) return "wait";

  if (ctx.mode === "auto_wifi" && ctx.net.type !== "wifi") return "wait";

  if (ctx.appState !== "active") return "wait";

  return "run";
}
