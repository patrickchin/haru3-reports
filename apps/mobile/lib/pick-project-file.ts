import * as DocumentPicker from "expo-document-picker";
import * as ImagePicker from "expo-image-picker";
import * as FileSystem from "expo-file-system/legacy";
import { type FileCategory } from "@/lib/file-validation";
import { preprocessImageForUpload } from "@/lib/preprocess-image";

export type PickedProjectFile = {
  fileUri: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  /** Pixel width (image picks only). */
  width?: number | null;
  /** Pixel height (image picks only). */
  height?: number | null;
  /** Local URI of a small JPEG thumbnail (image picks only). */
  thumbnailUri?: string | null;
  /** Thumbnail mime type — always `image/jpeg` for now. */
  thumbnailMimeType?: string | null;
  /** Encoded BlurHash placeholder (image picks only). */
  blurhash?: string | null;
};

export type PickResult =
  | { kind: "picked"; file: PickedProjectFile }
  | { kind: "canceled" }
  | { kind: "error"; message: string };

/**
 * Launches the appropriate native picker for a project file category and
 * returns the picked asset normalized for `useFileUpload`. Cancelation and
 * permission errors are returned as discriminated results so callers can
 * surface UI without try/catch noise.
 *
 * For `image` / `icon` picks, the original asset is preprocessed at
 * capture time (resize + JPEG re-compress) and a sibling thumbnail is
 * produced — both URIs and the new dimensions are returned so the
 * upload mutation can persist them as a single transaction.
 */
export async function pickProjectFile(
  category: Exclude<FileCategory, "avatar" | "voice-note">,
): Promise<PickResult> {
  try {
    if (category === "image" || category === "icon") {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        return { kind: "error", message: "Photo library permission denied" };
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        // We re-compress in `preprocessImageForUpload`, so request the
        // highest-quality bytes the picker will give us.
        quality: 1,
      });
      if (result.canceled || !result.assets[0]) return { kind: "canceled" };
      const asset = result.assets[0];

      const srcWidth = asset.width ?? 0;
      const srcHeight = asset.height ?? 0;
      const preprocessed = await preprocessImageForUpload(
        asset.uri,
        srcWidth,
        srcHeight,
      );
      const sizeBytes = await fileSize(preprocessed.originalUri, asset.fileSize);

      return {
        kind: "picked",
        file: {
          fileUri: preprocessed.originalUri,
          filename: asset.fileName ?? `image-${Date.now()}.jpg`,
          mimeType: preprocessed.mimeType,
          sizeBytes,
          width: preprocessed.width,
          height: preprocessed.height,
          thumbnailUri: preprocessed.thumbnailUri,
          thumbnailMimeType: preprocessed.mimeType,
          blurhash: preprocessed.blurhash,
        },
      };
    }

    const result = await DocumentPicker.getDocumentAsync({
      copyToCacheDirectory: true,
      multiple: false,
    });
    if (result.canceled || !result.assets[0]) return { kind: "canceled" };
    const asset = result.assets[0];
    return {
      kind: "picked",
      file: {
        fileUri: asset.uri,
        filename: asset.name,
        mimeType: asset.mimeType ?? "application/octet-stream",
        sizeBytes: asset.size ?? 0,
      },
    };
  } catch (err) {
    return {
      kind: "error",
      message: err instanceof Error ? err.message : "Could not pick file",
    };
  }
}

async function fileSize(uri: string, fallback: number | undefined): Promise<number> {
  try {
    const info = await FileSystem.getInfoAsync(uri);
    if (info.exists && "size" in info && typeof info.size === "number") {
      return info.size;
    }
  } catch {
    // ignore — fall through to fallback
  }
  return fallback ?? 0;
}
