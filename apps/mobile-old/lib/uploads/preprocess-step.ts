/**
 * Wraps `preprocessImageForUpload` for the queue with a small DI surface.
 *
 * For non-image jobs the step is a no-op that resolves to the original
 * URI — keeps the queue runtime free of conditionals.
 */
import { preprocessImageForUpload } from "@/lib/preprocess-image";
import type { EnqueueInput } from "./jobs";

export interface PreprocessOutcome {
  workingUri: string;
  thumbnailUri?: string;
  width?: number;
  height?: number;
  blurhash?: string | null;
}

export interface PreprocessDeps {
  preprocess: typeof preprocessImageForUpload;
}

const defaultDeps: PreprocessDeps = { preprocess: preprocessImageForUpload };

export async function runPreprocessStep(
  input: EnqueueInput,
  deps: PreprocessDeps = defaultDeps,
): Promise<PreprocessOutcome> {
  if (!input.isImage) {
    // Documents and voice notes flow straight through.
    return { workingUri: input.sourceUri };
  }

  const result = await deps.preprocess(
    input.sourceUri,
    input.width ?? 0,
    input.height ?? 0,
  );
  return {
    workingUri: result.originalUri,
    thumbnailUri: result.thumbnailUri,
    width: result.width,
    height: result.height,
    blurhash: result.blurhash,
  };
}
