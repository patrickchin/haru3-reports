/**
 * Shared helpers for Supabase RLS integration tests.
 *
 * Loads the remote project URL/anon key from apps/mobile/.env.local and
 * provides small utilities to sign in as the seeded demo users.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
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

function loadEnv(): { url: string; anonKey: string } {
  const envPath = resolve(__dirname, "../../apps/mobile/.env.local");
  const env: Record<string, string> = {};
  for (const line of readFileSync(envPath, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (m) env[m[1]] = m[2].trim();
  }
  const url = env.EXPO_PUBLIC_SUPABASE_URL;
  const anonKey = env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    throw new Error(
      "Missing EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_ANON_KEY in apps/mobile/.env.local"
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
