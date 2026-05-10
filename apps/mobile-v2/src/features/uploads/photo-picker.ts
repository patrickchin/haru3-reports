/**
 * Photo picker wrapper around expo-image-picker.
 *
 * Returns array of local URIs ready to enqueue. Multi-select by default.
 */
import * as ImagePicker from "expo-image-picker";

export interface PickPhotosOptions {
  allowsMultipleSelection?: boolean;
  quality?: number;
}

export interface PickedPhoto {
  uri: string;
  filename: string;
  mimeType: string;
  width: number;
  height: number;
  fileSize: number;
}

export async function pickPhotos(
  opts: PickPhotosOptions = {},
): Promise<PickedPhoto[]> {
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: "images",
    allowsMultipleSelection: opts.allowsMultipleSelection ?? true,
    quality: opts.quality ?? 1,
  });

  if (result.canceled) return [];

  return result.assets.map((asset) => ({
    uri: asset.uri,
    filename: asset.fileName ?? `photo-${Date.now()}.jpg`,
    mimeType: asset.mimeType ?? "image/jpeg",
    width: asset.width,
    height: asset.height,
    fileSize: asset.fileSize ?? 0,
  }));
}
