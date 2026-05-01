/**
 * Backfill thumbnail_path / width / height on legacy `file_metadata`
 * rows whose `category = 'image'` was uploaded before the Phase 1
 * image-perf migration.
 *
 * Invocation (admin only, service-role JWT):
 *
 *   POST /functions/v1/backfill-file-thumbnails
 *   { "batchSize": 50, "dryRun": false }
 *
 * Approach:
 *   1. Query rows with thumbnail_path IS NULL, ordered oldest-first.
 *   2. For each: download original via storage admin client.
 *   3. Decode + resize with `imagescript` (pure-Deno PNG/JPEG codec).
 *   4. Upload `<storage_path>.thumb.jpg` to the same bucket.
 *   5. UPDATE file_metadata SET width, height, thumbnail_path.
 *
 * Failures on individual rows are recorded in the response so the
 * caller can retry. The function is idempotent — re-running on a row
 * that already has a thumbnail_path is a no-op (the WHERE clause
 * filters it out).
 */
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient, type SupabaseClient } from "jsr:@supabase/supabase-js@2";
import { Image as ImgScript } from "https://deno.land/x/imagescript@1.2.17/mod.ts";

const PROJECT_FILES_BUCKET = "project-files";
const MAX_THUMBNAIL_EDGE_PX = 400;
const THUMBNAIL_QUALITY = 70; // imagescript expects 0–100

interface BackfillRequest {
  batchSize?: number;
  dryRun?: boolean;
}

interface BackfillResult {
  processed: number;
  updated: number;
  skipped: number;
  errors: Array<{ id: string; storage_path: string; message: string }>;
}

interface FileRow {
  id: string;
  storage_path: string;
  category: string;
  mime_type: string;
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

function envOrThrow(name: string): string {
  const v = Deno.env.get(name);
  if (!v) throw new Error(`Missing env: ${name}`);
  return v;
}

function buildAdminClient(): SupabaseClient {
  return createClient(
    envOrThrow("SUPABASE_URL"),
    envOrThrow("SUPABASE_SERVICE_ROLE_KEY"),
    { auth: { persistSession: false } },
  );
}

async function authorize(req: Request): Promise<boolean> {
  // Only the service-role key may invoke this maintenance function.
  // Supabase forwards the bearer token from the caller; compare against
  // the well-known service-role JWT stored as an env var.
  const authHeader = req.headers.get("authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) return false;
  const token = authHeader.slice("Bearer ".length).trim();
  const expected = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  return expected != null && token === expected;
}

export async function backfillOne(
  client: SupabaseClient,
  row: FileRow,
  dryRun: boolean,
): Promise<{ updated: boolean }> {
  const { data: blob, error: downloadError } = await client.storage
    .from(PROJECT_FILES_BUCKET)
    .download(row.storage_path);
  if (downloadError || !blob) {
    throw new Error(`download failed: ${downloadError?.message ?? "no data"}`);
  }

  const bytes = new Uint8Array(await blob.arrayBuffer());
  const decoded = await ImgScript.decode(bytes);
  const { width, height } = decoded;

  const longEdge = Math.max(width, height);
  if (longEdge > MAX_THUMBNAIL_EDGE_PX) {
    const scale = MAX_THUMBNAIL_EDGE_PX / longEdge;
    decoded.resize(Math.round(width * scale), Math.round(height * scale));
  }
  const thumbBytes = await decoded.encodeJPEG(THUMBNAIL_QUALITY);
  const thumbPath = `${row.storage_path}.thumb.jpg`;

  if (dryRun) {
    return { updated: false };
  }

  const { error: uploadError } = await client.storage
    .from(PROJECT_FILES_BUCKET)
    .upload(thumbPath, thumbBytes, {
      contentType: "image/jpeg",
      upsert: true,
    });
  if (uploadError) {
    throw new Error(`thumb upload failed: ${uploadError.message}`);
  }

  const { error: updateError } = await client
    .from("file_metadata")
    .update({ width, height, thumbnail_path: thumbPath })
    .eq("id", row.id);
  if (updateError) {
    throw new Error(`row update failed: ${updateError.message}`);
  }
  return { updated: true };
}

async function handle(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405, headers: corsHeaders });
  }
  if (!(await authorize(req))) {
    return new Response("Forbidden", { status: 403, headers: corsHeaders });
  }

  let body: BackfillRequest = {};
  try {
    body = await req.json();
  } catch {
    // Empty body is allowed.
  }
  const batchSize = Math.min(Math.max(1, body.batchSize ?? 25), 200);
  const dryRun = body.dryRun === true;

  const client = buildAdminClient();
  const { data: rows, error } = await client
    .from("file_metadata")
    .select("id, storage_path, category, mime_type")
    .eq("category", "image")
    .is("thumbnail_path", null)
    .is("deleted_at", null)
    .order("created_at", { ascending: true })
    .limit(batchSize);

  if (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "content-type": "application/json" } },
    );
  }

  const result: BackfillResult = {
    processed: rows?.length ?? 0,
    updated: 0,
    skipped: 0,
    errors: [],
  };

  for (const row of (rows ?? []) as FileRow[]) {
    try {
      const { updated } = await backfillOne(client, row, dryRun);
      if (updated) result.updated += 1;
      else result.skipped += 1;
    } catch (err) {
      result.errors.push({
        id: row.id,
        storage_path: row.storage_path,
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return new Response(JSON.stringify(result), {
    headers: { ...corsHeaders, "content-type": "application/json" },
  });
}

// Only start the HTTP server when invoked as the main module — importing
// `index.ts` from `index.test.ts` should not bind a port.
if (import.meta.main) {
  Deno.serve(handle);
}
