/**
 * Adapters that map our pure sync engines onto the Supabase client.
 *
 *   - `makePullFetcher(supabase)`  → satisfies the pull engine's `Fetcher`
 *     interface by calling `pull_<table>_since` RPCs.
 *   - `makeMutationCaller(supabase)` → satisfies the push engine's
 *     `MutationCaller` interface by calling `apply_<entity>_mutation`
 *     RPCs and unwrapping the JSON response.
 *
 * Pure boundary code — no React, no expo imports.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import type { Fetcher, PullRow } from "./pull-engine";
import type { MutationCaller, MutationResponse } from "./push-engine";
import type { OutboxRow } from "./outbox";

const PULL_RPC: Record<string, string> = {
  projects: "pull_projects_since",
  reports: "pull_reports_since",
  project_members: "pull_project_members_since",
  file_metadata: "pull_file_metadata_since",
};

const APPLY_RPC: Partial<Record<OutboxRow["entity"], string>> = {
  project: "apply_project_mutation",
  report: "apply_report_mutation",
  file_metadata: "apply_file_metadata_mutation",
};

export function makePullFetcher(supabase: SupabaseClient): Fetcher {
  return async (table, cursor, limit) => {
    const fn = PULL_RPC[table];
    if (!fn) throw new Error(`makePullFetcher: no RPC for table "${table}"`);
    const { data, error } = await supabase.rpc(fn, {
      p_cursor: cursor,
      p_limit: limit,
    });
    if (error) throw new Error(`${fn}: ${error.message}`);
    return (data ?? []) as PullRow[];
  };
}

export function makeMutationCaller(supabase: SupabaseClient): MutationCaller {
  return async (entity, payload) => {
    const fn = APPLY_RPC[entity];
    if (!fn) {
      throw new Error(`makeMutationCaller: no apply RPC for entity "${entity}"`);
    }
    const { data, error } = await supabase.rpc(fn, { p_payload: payload });
    if (error) throw new Error(`${fn}: ${error.message}`);
    if (!data) throw new Error(`${fn}: empty response`);
    return data as MutationResponse;
  };
}
