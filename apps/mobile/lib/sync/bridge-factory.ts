/**
 * Bridge factory — selects the sync transport (Supabase RPC or REST API)
 * based on the `EXPO_PUBLIC_USE_REST_API` build-time flag.
 *
 * Metro inlines `EXPO_PUBLIC_*` at bundle time, so flipping this flag
 * requires a rebuild (documented in AGENTS.md). The factory exists so
 * the SyncProvider — and any future call site — can stay agnostic.
 *
 * Default (flag unset / "0") = Supabase bridge, identical behaviour to
 * pre-migration builds. Once the REST cutover (P7) is rolled out, set
 * the flag to "1" in the relevant env file and rebuild.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import type { Fetcher } from "./pull-engine";
import type { MutationCaller } from "./push-engine";
import type { GenerateFn } from "./generation-worker";
import {
  makeMutationCaller as makeSupabaseMutationCaller,
  makePullFetcher as makeSupabasePullFetcher,
} from "./supabase-bridge";
import {
  makeRestMutationCaller,
  makeRestPullFetcher,
} from "./rest-bridge";
import {
  makeGenerateFn,
  type MakeGenerateFnDeps,
} from "./make-generate-fn";
import {
  makeGenerateFnRest,
  type MakeGenerateFnRestDeps,
} from "./make-generate-fn-rest";

export type BridgeMode = "supabase" | "rest";

export function getBridgeMode(): BridgeMode {
  return process.env.EXPO_PUBLIC_USE_REST_API === "1" ? "rest" : "supabase";
}

export function makePullFetcherForMode(
  supabase: SupabaseClient,
  mode: BridgeMode = getBridgeMode(),
): Fetcher {
  return mode === "rest"
    ? makeRestPullFetcher()
    : makeSupabasePullFetcher(supabase);
}

export function makeMutationCallerForMode(
  supabase: SupabaseClient,
  mode: BridgeMode = getBridgeMode(),
): MutationCaller {
  return mode === "rest"
    ? makeRestMutationCaller()
    : makeSupabaseMutationCaller(supabase);
}

export function makeGenerateFnForMode(
  deps: MakeGenerateFnDeps,
  mode: BridgeMode = getBridgeMode(),
): GenerateFn {
  if (mode === "rest") {
    const restDeps: MakeGenerateFnRestDeps = {
      db: deps.db,
      clock: deps.clock,
      newId: deps.newId,
      ...(deps.getProvider !== undefined && { getProvider: deps.getProvider }),
      ...(deps.getModel !== undefined && { getModel: deps.getModel }),
    };
    return makeGenerateFnRest(restDeps);
  }
  return makeGenerateFn(deps);
}
