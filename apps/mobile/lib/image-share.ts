/**
 * Image sharing / download helpers.
 *
 * Both "Share" and "Download" funnel through `expo-sharing` — on iOS the
 * share sheet's "Save Image" entry is the standard way to get the photo
 * into Photos, and on Android it surfaces "Save to Files" / etc. Using
 * the same primitive avoids `expo-media-library`'s permission prompt.
 *
 * The image bytes are downloaded into a per-file cache slot under
 * `cacheDirectory/shared-images/` so repeat shares don't refetch.
 */
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";

export const SHARED_IMAGE_CACHE_DIR_NAME = "shared-images";

export type ImageShareIntent = "share" | "download";

const DIALOG_TITLE: Record<ImageShareIntent, string> = {
  share: "Share photo",
  download: "Save photo",
};

interface ShareImageParams {
  fileId: string;
  signedUrl: string | null | undefined;
  mimeType?: string | null;
  filename?: string | null;
  intent: ImageShareIntent;
}

const EXTENSION_BY_MIME: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/png": "png",
  "image/heic": "heic",
  "image/heif": "heif",
  "image/webp": "webp",
  "image/gif": "gif",
};

function pickExtension(mimeType: string | null | undefined, filename: string | null | undefined): string {
  if (mimeType && EXTENSION_BY_MIME[mimeType.toLowerCase()]) {
    return EXTENSION_BY_MIME[mimeType.toLowerCase()];
  }
  const fromName = filename?.match(/\.([a-zA-Z0-9]+)$/)?.[1];
  return fromName?.toLowerCase() ?? "jpg";
}

export async function shareImage({
  fileId,
  signedUrl,
  mimeType,
  filename,
  intent,
}: ShareImageParams): Promise<void> {
  if (!signedUrl) {
    throw new Error("Image is not ready yet — try again in a moment.");
  }
  if (!FileSystem.cacheDirectory) {
    throw new Error("Local cache is unavailable on this platform.");
  }
  if (!(await Sharing.isAvailableAsync())) {
    throw new Error("Sharing is not available on this device.");
  }

  const cacheDir = `${FileSystem.cacheDirectory}${SHARED_IMAGE_CACHE_DIR_NAME}/`;
  const extension = pickExtension(mimeType, filename);
  const localUri = `${cacheDir}${fileId}.${extension}`;

  const info = await FileSystem.getInfoAsync(localUri);
  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(cacheDir, { intermediates: true });
    const result = await FileSystem.downloadAsync(signedUrl, localUri);
    if (result.status >= 400) {
      throw new Error(`Could not download image (HTTP ${result.status}).`);
    }
  }

  await Sharing.shareAsync(localUri, {
    mimeType: mimeType ?? "image/jpeg",
    UTI: "public.image",
    dialogTitle: DIALOG_TITLE[intent],
  });
}
