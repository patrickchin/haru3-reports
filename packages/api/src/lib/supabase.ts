import { createClient, type SupabaseClient } from '@supabase/supabase-js';

let _client: SupabaseClient | undefined;

function getSupabaseUrl(): string {
  const url = process.env.SUPABASE_URL;
  if (!url) throw new Error('SUPABASE_URL not configured');
  return url;
}

function getServiceKey(): string {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error('SUPABASE_SERVICE_ROLE_KEY not configured');
  return key;
}

/** Service-role Supabase client (singleton). Use for storage operations and bypassing RLS. */
export function getSupabaseAdmin(): SupabaseClient {
  if (!_client) {
    _client = createClient(getSupabaseUrl(), getServiceKey(), {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return _client;
}

/**
 * Create a presigned upload URL for Supabase Storage.
 * Returns the signed URL and the storage path.
 */
export async function createPresignedUploadUrl(
  bucket: string,
  storagePath: string,
): Promise<{ signedUrl: string; token: string }> {
  const client = getSupabaseAdmin();
  const { data, error } = await client.storage
    .from(bucket)
    .createSignedUploadUrl(storagePath);

  if (error || !data) {
    throw new Error(`Presign upload failed: ${error?.message ?? 'unknown error'}`);
  }

  return { signedUrl: data.signedUrl, token: data.token };
}

/**
 * Create a time-limited signed download URL for an existing file.
 */
export async function createSignedDownloadUrl(
  bucket: string,
  storagePath: string,
  expiresInSeconds = 3600,
): Promise<string> {
  const client = getSupabaseAdmin();
  const { data, error } = await client.storage
    .from(bucket)
    .createSignedUrl(storagePath, expiresInSeconds);

  if (error || !data) {
    throw new Error(`Signed URL failed: ${error?.message ?? 'unknown error'}`);
  }

  return data.signedUrl;
}

/**
 * Download a file from Supabase Storage as a Buffer.
 * Used by the transcription route to fetch audio before sending to an AI provider.
 */
export async function downloadFile(
  bucket: string,
  storagePath: string,
): Promise<{ buffer: Buffer; mimeType: string }> {
  const client = getSupabaseAdmin();
  const { data, error } = await client.storage
    .from(bucket)
    .download(storagePath);

  if (error || !data) {
    throw new Error(`File download failed: ${error?.message ?? 'unknown error'}`);
  }

  const buffer = Buffer.from(await data.arrayBuffer());
  return { buffer, mimeType: data.type };
}
