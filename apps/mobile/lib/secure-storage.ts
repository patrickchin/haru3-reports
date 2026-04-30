/**
 * Secure storage adapter for Supabase auth session tokens.
 *
 * SOC 2 CC6.1: persists auth tokens in iOS Keychain / Android Keystore via
 * `expo-secure-store` (encrypted at rest) instead of plaintext AsyncStorage.
 *
 * Notes:
 * - `expo-secure-store` only supports values up to ~2KB on Android; large
 *   values are chunked across multiple keys with a manifest entry that
 *   records the chunk count. Supabase session JSON is typically <2KB but we
 *   chunk defensively to stay safe across SDK upgrades.
 * - On non-native runtimes (web/jest/vitest) where SecureStore is a no-op,
 *   we fall back to the provided `fallback` storage so tests stay simple.
 */

const CHUNK_SIZE = 1800; // bytes; well below the Android 2048 cap

export type AsyncStorageLike = {
  getItem: (key: string) => Promise<string | null>;
  setItem: (key: string, value: string) => Promise<void>;
  removeItem: (key: string) => Promise<void>;
};

export type SecureStoreLike = {
  getItemAsync: (key: string) => Promise<string | null>;
  setItemAsync: (key: string, value: string) => Promise<void>;
  deleteItemAsync: (key: string) => Promise<void>;
  isAvailableAsync?: () => Promise<boolean>;
};

export type SecureStorageOptions = {
  /** SecureStore implementation (defaults to expo-secure-store at runtime). */
  secureStore?: SecureStoreLike;
  /** Plaintext fallback used only when SecureStore is unavailable. */
  fallback?: AsyncStorageLike;
  /** Override chunk size (mainly for tests). */
  chunkSize?: number;
};

function manifestKey(key: string) {
  return `${key}::__chunks`;
}

function chunkKey(key: string, index: number) {
  return `${key}::${index}`;
}

function chunkString(value: string, chunkSize: number): string[] {
  if (value.length <= chunkSize) {
    return [value];
  }
  const chunks: string[] = [];
  for (let i = 0; i < value.length; i += chunkSize) {
    chunks.push(value.slice(i, i + chunkSize));
  }
  return chunks;
}

/**
 * Build a Supabase-compatible storage adapter (`getItem`/`setItem`/`removeItem`)
 * backed by `expo-secure-store`. Falls back to the provided plaintext storage
 * when SecureStore is unavailable (web, vitest).
 */
export function createSecureStorage(
  options: SecureStorageOptions = {},
): AsyncStorageLike {
  const { secureStore, fallback, chunkSize = CHUNK_SIZE } = options;

  let availability: Promise<boolean> | null = null;

  const isSecureAvailable = async (): Promise<boolean> => {
    if (!secureStore) return false;
    if (!secureStore.isAvailableAsync) return true;
    if (!availability) {
      availability = secureStore.isAvailableAsync().catch(() => false);
    }
    return availability;
  };

  const usingFallback = async () => {
    if (await isSecureAvailable()) return null;
    if (!fallback) {
      throw new Error(
        "Secure storage is unavailable and no fallback storage was provided.",
      );
    }
    return fallback;
  };

  return {
    async getItem(key) {
      const fb = await usingFallback();
      if (fb) return fb.getItem(key);

      const store = secureStore!;
      const manifest = await store.getItemAsync(manifestKey(key));
      if (!manifest) {
        // Backwards-compatible single-key path
        return store.getItemAsync(key);
      }
      const count = Number.parseInt(manifest, 10);
      if (!Number.isFinite(count) || count <= 0) return null;
      const parts: string[] = [];
      for (let i = 0; i < count; i += 1) {
        const part = await store.getItemAsync(chunkKey(key, i));
        if (part === null) return null;
        parts.push(part);
      }
      return parts.join("");
    },

    async setItem(key, value) {
      const fb = await usingFallback();
      if (fb) {
        await fb.setItem(key, value);
        return;
      }

      const store = secureStore!;
      // Clear any prior single-key value that might collide.
      await store.deleteItemAsync(key).catch(() => {});

      const chunks = chunkString(value, chunkSize);
      for (let i = 0; i < chunks.length; i += 1) {
        await store.setItemAsync(chunkKey(key, i), chunks[i]!);
      }
      await store.setItemAsync(manifestKey(key), String(chunks.length));
    },

    async removeItem(key) {
      const fb = await usingFallback();
      if (fb) {
        await fb.removeItem(key);
        return;
      }

      const store = secureStore!;
      const manifest = await store.getItemAsync(manifestKey(key));
      await store.deleteItemAsync(key).catch(() => {});
      await store.deleteItemAsync(manifestKey(key)).catch(() => {});
      if (manifest) {
        const count = Number.parseInt(manifest, 10);
        if (Number.isFinite(count)) {
          for (let i = 0; i < count; i += 1) {
            await store.deleteItemAsync(chunkKey(key, i)).catch(() => {});
          }
        }
      }
    },
  };
}
