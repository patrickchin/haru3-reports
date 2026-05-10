/**
 * Document picker wrapper around expo-document-picker.
 *
 * Returns array of local URIs ready to enqueue.
 */
import * as DocumentPicker from "expo-document-picker";

export interface PickedDocument {
  uri: string;
  filename: string;
  mimeType: string;
  fileSize: number;
}

export async function pickDocuments(): Promise<PickedDocument[]> {
  const result = await DocumentPicker.getDocumentAsync({
    type: "*/*",
    multiple: true,
    copyToCacheDirectory: true,
  });

  if (result.canceled) return [];

  return result.assets.map((asset) => ({
    uri: asset.uri,
    filename: asset.name,
    mimeType: asset.mimeType ?? "application/octet-stream",
    fileSize: asset.size ?? 0,
  }));
}
