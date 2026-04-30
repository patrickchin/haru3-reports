import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";

import {
  resolveProvider,
  type TranscriptionProvider,
} from "../transcribe-audio/providers.ts";

// ---------------------------------------------------------------
// backfill-transcriptions
//
// Server-side admin job that re-runs transcription for every voice
// note (`report_notes.kind = 'voice'`) that is missing a transcript
// (`body IS NULL OR body = ''`). The audio is fetched from the
// `project-files` Storage bucket via `file_metadata`, run through the
// configured transcription provider, and written back to
// `report_notes.body`.
//
// Auth model: invoked with the project's `SUPABASE_SERVICE_ROLE_KEY`
// in `Authorization: Bearer <key>`. `verify_jwt` is disabled in
// config.toml; we authenticate the bearer ourselves with a
// constant-time compare so the function is callable from a CI job or
// a one-off `curl` without a real user JWT.
//
// Request (POST, JSON body, all fields optional):
//   { limit?: number,        // max rows per call, default 50, max 500
//     projectId?: string,    // restrict to one project
//     dryRun?: boolean,      // list candidates without transcribing
//     provider?: string }    // override TRANSCRIPTION_PROVIDER
//
// Response: { processed, succeeded, failed, skipped, dryRun,
//             errors: Array<{ noteId, message }> }
// ---------------------------------------------------------------

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 500;

type BackfillRequestBody = {
  limit?: number;
  projectId?: string;
  dryRun?: boolean;
  provider?: string;
};

type VoiceNoteCandidate = {
  id: string;
  file_id: string;
  project_id: string;
  file_metadata: {
    bucket: string;
    storage_path: string;
    mime_type: string;
    filename: string;
  } | null;
};

type BackfillError = { noteId: string; message: string };

type BackfillSummary = {
  processed: number;
  succeeded: number;
  failed: number;
  skipped: number;
  dryRun: boolean;
  errors: BackfillError[];
};

export type BackfillDeps = {
  supabaseClient?: SupabaseClient;
  resolveProviderFn?: (requested?: string | null) => TranscriptionProvider;
  getApiKeyFn?: (envKey: string) => string | undefined;
  authorizeFn?: (req: Request) => boolean;
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function getBearerToken(req: Request): string | null {
  const header = req.headers.get("authorization") ?? "";
  if (!header.startsWith("Bearer ")) return null;
  return header.slice("Bearer ".length).trim() || null;
}

// Constant-time string compare to avoid timing-based bearer leaks.
function safeEquals(a: string, b: string): boolean {
  const enc = new TextEncoder();
  const aBytes = enc.encode(a);
  const bBytes = enc.encode(b);
  if (aBytes.length !== bBytes.length) return false;
  let mismatch = 0;
  for (let i = 0; i < aBytes.length; i++) mismatch |= aBytes[i] ^ bBytes[i];
  return mismatch === 0;
}

function defaultAuthorize(req: Request): boolean {
  const token = getBearerToken(req);
  // Prefer a dedicated admin key (BACKFILL_ADMIN_KEY) so this job can be
  // re-keyed independently of the project's service role key. Fall back to
  // the auto-injected SUPABASE_SERVICE_ROLE_KEY for projects that haven't
  // set the dedicated key yet.
  const expected = Deno.env.get("BACKFILL_ADMIN_KEY") ??
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!token || !expected) return false;
  return safeEquals(token, expected);
}

function clampLimit(raw: unknown): number {
  const n = typeof raw === "number" ? raw : Number.parseInt(String(raw), 10);
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_LIMIT;
  return Math.min(Math.floor(n), MAX_LIMIT);
}

async function parseBody(req: Request): Promise<BackfillRequestBody> {
  if (req.method !== "POST") return {};
  const contentType = req.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) return {};
  const text = await req.text();
  if (!text.trim()) return {};
  try {
    const parsed = JSON.parse(text);
    return typeof parsed === "object" && parsed !== null ? parsed : {};
  } catch {
    throw new Error("invalid JSON body");
  }
}

function defaultClient(): SupabaseClient {
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) {
    throw new Error(
      "backfill-transcriptions: missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY",
    );
  }
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function fetchCandidates(
  client: SupabaseClient,
  options: { limit: number; projectId?: string },
): Promise<VoiceNoteCandidate[]> {
  // Voice notes whose transcription was lost in the recent refactor:
  // kind='voice', file_id present, body empty/null, not soft-deleted.
  let query = client
    .from("report_notes")
    .select(
      "id, file_id, project_id, file_metadata:file_id (bucket, storage_path, mime_type, filename)",
    )
    .eq("kind", "voice")
    .not("file_id", "is", null)
    .or("body.is.null,body.eq.")
    .is("deleted_at", null)
    .order("created_at", { ascending: true })
    .limit(options.limit);

  if (options.projectId) query = query.eq("project_id", options.projectId);

  const { data, error } = await query;
  if (error) throw new Error(`fetch candidates failed: ${error.message}`);

  // Supabase's typing returns `file_metadata` as an array for FK joins
  // even though file_id is a single FK. Normalize to a single object.
  return (data ?? []).map((row: Record<string, unknown>) => {
    const fm = row.file_metadata;
    const file = Array.isArray(fm) ? fm[0] ?? null : fm ?? null;
    return {
      id: String(row.id),
      file_id: String(row.file_id),
      project_id: String(row.project_id),
      file_metadata: file as VoiceNoteCandidate["file_metadata"],
    };
  });
}

async function downloadAudio(
  client: SupabaseClient,
  bucket: string,
  storagePath: string,
): Promise<Uint8Array> {
  const { data, error } = await client.storage.from(bucket).download(
    storagePath,
  );
  if (error || !data) {
    throw new Error(
      `storage download failed (${bucket}/${storagePath}): ${
        error?.message ?? "no data"
      }`,
    );
  }
  return new Uint8Array(await data.arrayBuffer());
}

async function transcribeOne(
  client: SupabaseClient,
  candidate: VoiceNoteCandidate,
  provider: TranscriptionProvider,
  apiKey: string,
): Promise<string> {
  const file = candidate.file_metadata;
  if (!file) throw new Error("file_metadata missing for note");
  const audio = await downloadAudio(client, file.bucket, file.storage_path);
  if (audio.byteLength === 0) throw new Error("audio file is empty");

  const result = await provider.transcribe(
    {
      audio,
      mimeType: file.mime_type || "audio/m4a",
      filename: file.filename || "audio.m4a",
    },
    apiKey,
  );

  const text = (result.text ?? "").trim();
  if (!text) throw new Error("provider returned empty transcript");
  return text;
}

async function persistTranscript(
  client: SupabaseClient,
  noteId: string,
  body: string,
): Promise<void> {
  const { error } = await client
    .from("report_notes")
    .update({ body })
    .eq("id", noteId);
  if (error) throw new Error(`update failed: ${error.message}`);
}

export function createHandler(deps: BackfillDeps = {}) {
  return async (req: Request): Promise<Response> => {
    if (req.method === "OPTIONS") {
      return new Response("ok", { headers: corsHeaders });
    }
    if (req.method !== "POST") {
      return jsonResponse({ error: "method not allowed" }, 405);
    }

    const authorize = deps.authorizeFn ?? defaultAuthorize;
    if (!authorize(req)) return jsonResponse({ error: "unauthorized" }, 401);

    let body: BackfillRequestBody;
    try {
      body = await parseBody(req);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return jsonResponse({ error: msg }, 400);
    }

    const limit = clampLimit(body.limit);
    const dryRun = body.dryRun === true;

    let client: SupabaseClient;
    try {
      client = deps.supabaseClient ?? defaultClient();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return jsonResponse({ error: msg }, 500);
    }

    const provider = (deps.resolveProviderFn ?? resolveProvider)(
      body.provider ?? null,
    );
    const getApiKey = deps.getApiKeyFn ?? ((k) => Deno.env.get(k));
    const apiKey = getApiKey(provider.envKey);
    if (!apiKey && !dryRun) {
      return jsonResponse(
        {
          error:
            `provider "${provider.id}" is not configured (missing ${provider.envKey})`,
        },
        503,
      );
    }

    let candidates: VoiceNoteCandidate[];
    try {
      candidates = await fetchCandidates(client, {
        limit,
        projectId: body.projectId,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return jsonResponse({ error: msg }, 500);
    }

    const summary: BackfillSummary = {
      processed: candidates.length,
      succeeded: 0,
      failed: 0,
      skipped: 0,
      dryRun,
      errors: [],
    };

    if (dryRun) {
      return jsonResponse({
        ...summary,
        candidates: candidates.map((c) => ({
          id: c.id,
          project_id: c.project_id,
          file_id: c.file_id,
          storage_path: c.file_metadata?.storage_path ?? null,
        })),
      });
    }

    // Sequential processing — keeps memory + provider rate limits sane.
    // Tune by calling this function repeatedly with a small `limit`.
    for (const candidate of candidates) {
      if (!candidate.file_metadata) {
        summary.skipped += 1;
        summary.errors.push({
          noteId: candidate.id,
          message: "file_metadata missing or deleted",
        });
        continue;
      }
      try {
        const text = await transcribeOne(client, candidate, provider, apiKey!);
        await persistTranscript(client, candidate.id, text);
        summary.succeeded += 1;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(
          `backfill-transcriptions failed for note ${candidate.id}:`,
          msg,
        );
        summary.failed += 1;
        summary.errors.push({ noteId: candidate.id, message: msg });
      }
    }

    return jsonResponse(summary);
  };
}

export const handler = createHandler();

if (import.meta.main) {
  Deno.serve(handler);
}
