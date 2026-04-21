// Storage provider abstraction for report images.
//
// MVP: only SupabaseStorageProvider is wired up. Other providers
// (S3 / GCS / R2) can be added behind the same interface without
// touching any callers.

import { backend } from "./backend";

export interface ImageStorageProvider {
  /** Upload a local file (file:// URI) to the given bucket-relative path. */
  upload(params: {
    localUri: string;
    path: string;
    mimeType: string;
  }): Promise<void>;

  /** Return a signed URL for reading the given path. */
  getSignedUrl(path: string, expiresInSeconds: number): Promise<string>;

  /** Delete one or more paths. Silently ignores missing objects. */
  delete(paths: string[]): Promise<void>;
}

const BUCKET = "report-images";

class SupabaseStorageProvider implements ImageStorageProvider {
  async upload({
    localUri,
    path,
    mimeType,
  }: {
    localUri: string;
    path: string;
    mimeType: string;
  }): Promise<void> {
    // React Native / Expo: fetch the local file as a blob and upload.
    const response = await fetch(localUri);
    const blob = await response.blob();
    const { error } = await backend.storage
      .from(BUCKET)
      .upload(path, blob, { contentType: mimeType, upsert: true });
    if (error) throw error;
  }

  async getSignedUrl(path: string, expiresInSeconds: number): Promise<string> {
    const { data, error } = await backend.storage
      .from(BUCKET)
      .createSignedUrl(path, expiresInSeconds);
    if (error || !data) throw error ?? new Error("Failed to create signed URL");
    return data.signedUrl;
  }

  async delete(paths: string[]): Promise<void> {
    if (paths.length === 0) return;
    const { error } = await backend.storage.from(BUCKET).remove(paths);
    if (error) throw error;
  }
}

let provider: ImageStorageProvider = new SupabaseStorageProvider();

export function getImageStorageProvider(): ImageStorageProvider {
  return provider;
}

// For tests.
export function setImageStorageProvider(next: ImageStorageProvider): void {
  provider = next;
}

/** Build the canonical storage path for an image. */
export function buildImageStoragePath(
  projectId: string,
  reportId: string,
  imageId: string,
  variant: "original" | "thumb",
): string {
  const suffix = variant === "thumb" ? "_thumb.jpg" : ".jpg";
  return `${projectId}/${reportId}/${imageId}${suffix}`;
}
