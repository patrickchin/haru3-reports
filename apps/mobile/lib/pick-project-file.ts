import * as DocumentPicker from "expo-document-picker";
import * as ImagePicker from "expo-image-picker";
import { type FileCategory } from "@/lib/file-validation";

export type PickedProjectFile = {
  fileUri: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
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
        quality: 0.8,
      });
      if (result.canceled || !result.assets[0]) return { kind: "canceled" };
      const asset = result.assets[0];
      return {
        kind: "picked",
        file: {
          fileUri: asset.uri,
          filename: asset.fileName ?? `image-${Date.now()}.jpg`,
          mimeType: asset.mimeType ?? "image/jpeg",
          sizeBytes: asset.fileSize ?? 0,
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
