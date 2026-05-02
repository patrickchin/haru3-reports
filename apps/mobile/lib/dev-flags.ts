/**
 * Module-level dev-only flags driven by the in-app Developer section
 * (and queryable from any subsystem). Exists so Maestro flows can
 * toggle behaviours like "force offline" deterministically without
 * needing to drive `simctl` or airplane mode.
 *
 * Flags are NOT persisted across app launches by design — they are a
 * debugging aid, not a user setting.
 */
import { useSyncExternalStore } from "react";

export type DevFlags = {
  forceOffline: boolean;
};

const initial: DevFlags = { forceOffline: false };

let state: DevFlags = initial;
const listeners = new Set<() => void>();

export function getDevFlags(): DevFlags {
  return state;
}

export function setDevFlag<K extends keyof DevFlags>(key: K, value: DevFlags[K]): void {
  if (state[key] === value) return;
  state = { ...state, [key]: value };
  for (const l of listeners) l();
}

export function subscribeDevFlags(cb: () => void): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

export function useDevFlags(): DevFlags {
  return useSyncExternalStore(subscribeDevFlags, getDevFlags, getDevFlags);
}

/**
 * `true` when the Developer section is exposed in the UI. Production
 * builds keep it hidden. We trust the standard Expo dev flag, the
 * dev-phone-auth env var that already gates other test affordances
 * (see `subflows/ensure-logged-out.yaml`), and the E2E voice-note
 * mock flag baked into Maestro Release builds (`pnpm ios:mock:release`)
 * so the offline toggle is reachable from those builds without
 * requiring a separate dev rebuild.
 */
export const DEV_TOOLS_VISIBLE: boolean =
  // eslint-disable-next-line no-undef
  Boolean(typeof __DEV__ !== "undefined" && __DEV__) ||
  process.env.EXPO_PUBLIC_ENABLE_DEV_PHONE_AUTH === "true" ||
  process.env.EXPO_PUBLIC_E2E_MOCK_VOICE_NOTE === "true";
