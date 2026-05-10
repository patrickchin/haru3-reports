/**
 * Voice-note sharing / download helpers.
 *
 * Both "Share" and "Download" funnel through `expo-sharing` — on iOS the
 * share sheet's "Save to Files" entry is the standard way to save the
 * audio to the device, and on Android it surfaces the system "Save to
 * folder" picker. Different `dialogTitle`s let users distinguish intent.
 *
 * The helpers expect the audio to already exist in the voice-note cache
 * (the player preloads on mount). If the cache file is missing, callers
 * should `await player.preload()` before invoking these.
 */
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import { getVoiceNoteCacheUri } from "@/lib/voice-note-cache";

export type VoiceNoteShareIntent = "share" | "download";

const DIALOG_TITLE: Record<VoiceNoteShareIntent, string> = {
  share: "Share voice note",
  download: "Save voice note",
};

interface ShareVoiceNoteParams {
  storagePath: string;
  mimeType?: string | null;
  intent: VoiceNoteShareIntent;
}

export async function shareVoiceNote({
  storagePath,
  mimeType,
  intent,
}: ShareVoiceNoteParams): Promise<void> {
  const localUri = getVoiceNoteCacheUri(storagePath);
  if (!localUri) {
    throw new Error("Local cache is unavailable on this platform.");
  }
  const info = await FileSystem.getInfoAsync(localUri);
  if (!info.exists) {
    throw new Error("Voice note is not cached yet — try playing it first.");
  }
  if (!(await Sharing.isAvailableAsync())) {
    throw new Error("Sharing is not available on this device.");
  }
  await Sharing.shareAsync(localUri, {
    mimeType: mimeType ?? "audio/m4a",
    UTI: "public.audio",
    dialogTitle: DIALOG_TITLE[intent],
  });
}
