/**
 * Shared helpers for Supabase RLS integration tests.
 *
 * Resolves the target Supabase URL + anon key in this order:
 *   1. SUPABASE_URL / SUPABASE_ANON_KEY            (local stack via `supabase status -o env`)
 *   2. EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_ANON_KEY (CI / hosted dev)
 *   3. apps/mobile/.env.local                      (local convenience fallback)
 *
 * The same suite runs against either a local `supabase start` stack or the
 * hosted dev project. See supabase/tests/README.md.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

export const MIKE = {
  id: "11111111-1111-1111-1111-111111111111",
  email: "mike@example.com",
  password: "test1234",
} as const;

export const SARAH = {
  id: "22222222-2222-2222-2222-222222222222",
  email: "sarah@example.com",
  password: "test1234",
} as const;

function readDotEnv(path: string): Record<string, string> {
  if (!existsSync(path)) return {};
  const env: Record<string, string> = {};
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (m) env[m[1]] = m[2].trim();
  }
  return env;
}

function loadEnv(): { url: string; anonKey: string } {
  // 1. Process env (local stack or CI)
  let url = process.env.SUPABASE_URL ?? process.env.EXPO_PUBLIC_SUPABASE_URL;
  let anonKey =
    process.env.SUPABASE_ANON_KEY ?? process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

  // 2. Fallback: apps/mobile/.env.local for local dev convenience
  if (!url || !anonKey) {
    const file = readDotEnv(resolve(__dirname, "../../apps/mobile/.env.local"));
    url = url ?? file.EXPO_PUBLIC_SUPABASE_URL;
    anonKey = anonKey ?? file.EXPO_PUBLIC_SUPABASE_ANON_KEY;
  }

  if (!url || !anonKey) {
    throw new Error(
      "RLS tests need SUPABASE_URL/SUPABASE_ANON_KEY (local stack) or " +
        "EXPO_PUBLIC_SUPABASE_URL/EXPO_PUBLIC_SUPABASE_ANON_KEY (hosted), " +
        "or apps/mobile/.env.local."
    );
  }
  return { url, anonKey };
}

export function anonClient(): SupabaseClient {
  const { url, anonKey } = loadEnv();
  return createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export async function signIn(
  creds: { email: string; password: string }
): Promise<SupabaseClient> {
  const client = anonClient();
  const { error } = await client.auth.signInWithPassword(creds);
  if (error) throw error;
  return client;
}

/**
 * Creates a throwaway project owned by the signed-in user.
 * Returned id is already safe to pass into cleanup helpers.
 */
export async function createOwnedProject(
  client: SupabaseClient,
  ownerId: string,
  name = `vitest-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
): Promise<string> {
  const { data, error } = await client
    .from("projects")
    .insert({ name, owner_id: ownerId })
    .select("id")
    .single();
  if (error) throw error;
  return data!.id;
}

/**
 * Deletes any projects created by the signed-in owner whose names begin
 * with the given prefix. Use in afterAll to keep the dev DB tidy.
 */
export async function cleanupProjects(
  client: SupabaseClient,
  ids: string[]
): Promise<void> {
  if (ids.length === 0) return;
  // Hard-delete via admin: we don't have service role here, so rely on
  // owner RLS DELETE policy. Soft-delete would remain in the table, so
  // we use DELETE which fully removes rows for the signed-in owner.
  await client.from("projects").delete().in("id", ids);
}

/**
 * Hard-delete file_metadata rows by id. Caller must be uploader or admin
 * (RLS will silently ignore rows that don't match).
 */
export async function cleanupFileMetadata(
  client: SupabaseClient,
  ids: string[]
): Promise<void> {
  if (ids.length === 0) return;
  await client.from("file_metadata").delete().in("id", ids);
}

/**
 * Best-effort cleanup of storage objects. Pass paths relative to the bucket
 * (no bucket prefix). Caller must have DELETE permission via RLS.
 */
export async function cleanupStorageObjects(
  client: SupabaseClient,
  bucket: string,
  paths: string[]
): Promise<void> {
  if (paths.length === 0) return;
  await client.storage.from(bucket).remove(paths);
}
