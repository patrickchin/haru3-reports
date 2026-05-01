/**
 * Voice-note disk cache.
 *
 * `useVoiceNotePlayer` plays from a local URI under `cacheDirectory/voice-notes/`,
 * downloading the remote file on first play if the cache is empty. When we
 * just *recorded* a voice note locally, that download is wasteful — the
 * audio is already on the device. `seedVoiceNoteCache` copies the local
 * recording into the player cache under the same canonical filename so the
 * card never has to flip into a "Downloading" state for audio that came
 * from this device.
 *
 * Pure module: takes its filesystem ops via the optional injected `fs`
 * argument so it's unit-testable without `expo-file-system`.
 */
import * as FileSystem from "expo-file-system/legacy";

export const VOICE_NOTE_CACHE_DIR_NAME = "voice-notes";

export type VoiceNoteCacheFs = {
  cacheDirectory: string | null;
  getInfoAsync: (uri: string) => Promise<{ exists: boolean; uri?: string }>;
  makeDirectoryAsync: (
    uri: string,
    options?: { intermediates?: boolean },
  ) => Promise<void>;
  copyAsync: (params: { from: string; to: string }) => Promise<void>;
};

const defaultFs: VoiceNoteCacheFs = {
  get cacheDirectory() {
    return FileSystem.cacheDirectory ?? null;
  },
  getInfoAsync: (uri) => FileSystem.getInfoAsync(uri) as Promise<{ exists: boolean; uri?: string }>,
  makeDirectoryAsync: (uri, options) => FileSystem.makeDirectoryAsync(uri, options),
  copyAsync: (params) => FileSystem.copyAsync(params),
};

/** Sanitize a Supabase storage path to a flat filename for the local cache. */
export function toVoiceNoteCacheFilename(storagePath: string): string {
  return storagePath.replace(/[^a-zA-Z0-9._-]/g, "_");
}

/**
 * Build the full local URI a voice note would live at in the cache.
 * Returns null if the platform has no cache directory.
 */
export function getVoiceNoteCacheUri(
  storagePath: string,
  fs: VoiceNoteCacheFs = defaultFs,
): string | null {
  if (!fs.cacheDirectory) return null;
  return `${fs.cacheDirectory}${VOICE_NOTE_CACHE_DIR_NAME}/${toVoiceNoteCacheFilename(storagePath)}`;
}

/**
 * Copy a local recording into the voice-note cache so the player picks it
 * up on first play instead of downloading from Supabase.
 *
 * Best-effort: returns false on any failure (missing source, no cache
 * directory, copy error). Callers should treat it as a soft optimization
 * — playback still works, it just falls back to the network path.
 */
export async function seedVoiceNoteCache(
  storagePath: string,
  localUri: string,
  fs: VoiceNoteCacheFs = defaultFs,
): Promise<boolean> {
  if (!storagePath || !localUri) return false;
  if (!fs.cacheDirectory) return false;
  const cacheDir = `${fs.cacheDirectory}${VOICE_NOTE_CACHE_DIR_NAME}/`;
  const destUri = `${cacheDir}${toVoiceNoteCacheFilename(storagePath)}`;

  try {
    // Skip if already populated (e.g. a re-upload of a file we already cached).
    const existing = await fs.getInfoAsync(destUri);
    if (existing.exists) return true;

    await fs.makeDirectoryAsync(cacheDir, { intermediates: true });
    await fs.copyAsync({ from: localUri, to: destUri });
    return true;
  } catch {
    return false;
  }
}
