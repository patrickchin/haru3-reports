import { describe, expect, it } from "vitest";
import { createSecureStorage, type SecureStoreLike } from "@/lib/secure-storage";

function makeMemoryStore(): SecureStoreLike & { dump: () => Map<string, string> } {
  const map = new Map<string, string>();
  return {
    async getItemAsync(key) {
      return map.has(key) ? map.get(key)! : null;
    },
    async setItemAsync(key, value) {
      map.set(key, value);
    },
    async deleteItemAsync(key) {
      map.delete(key);
    },
    async isAvailableAsync() {
      return true;
    },
    dump: () => map,
  };
}

describe("createSecureStorage", () => {
  it("round-trips small values via SecureStore", async () => {
    const store = makeMemoryStore();
    const storage = createSecureStorage({ secureStore: store });

    await storage.setItem("session", "abc");
    expect(await storage.getItem("session")).toBe("abc");

    await storage.removeItem("session");
    expect(await storage.getItem("session")).toBeNull();
    expect(store.dump().size).toBe(0);
  });

  it("chunks large values across multiple keys", async () => {
    const store = makeMemoryStore();
    const storage = createSecureStorage({ secureStore: store, chunkSize: 4 });
    const value = "abcdefghij"; // 10 chars, expect 3 chunks

    await storage.setItem("k", value);
    expect(store.dump().get("k::__chunks")).toBe("3");
    expect(store.dump().get("k::0")).toBe("abcd");
    expect(store.dump().get("k::1")).toBe("efgh");
    expect(store.dump().get("k::2")).toBe("ij");
    expect(await storage.getItem("k")).toBe(value);
  });

  it("removeItem cleans up all chunks", async () => {
    const store = makeMemoryStore();
    const storage = createSecureStorage({ secureStore: store, chunkSize: 4 });
    await storage.setItem("k", "abcdefghij");
    await storage.removeItem("k");
    expect(store.dump().size).toBe(0);
  });

  it("falls back to plaintext storage when SecureStore is unavailable", async () => {
    const fallback = new Map<string, string>();
    const fb = {
      async getItem(k: string) {
        return fallback.has(k) ? fallback.get(k)! : null;
      },
      async setItem(k: string, v: string) {
        fallback.set(k, v);
      },
      async removeItem(k: string) {
        fallback.delete(k);
      },
    };
    const unavailable: SecureStoreLike = {
      async getItemAsync() {
        return null;
      },
      async setItemAsync() {},
      async deleteItemAsync() {},
      async isAvailableAsync() {
        return false;
      },
    };
    const storage = createSecureStorage({ secureStore: unavailable, fallback: fb });

    await storage.setItem("k", "v");
    expect(fallback.get("k")).toBe("v");
    expect(await storage.getItem("k")).toBe("v");

    await storage.removeItem("k");
    expect(fallback.size).toBe(0);
  });

  it("throws when neither SecureStore nor fallback is available", async () => {
    const storage = createSecureStorage({});
    await expect(storage.getItem("k")).rejects.toThrow(/unavailable/);
  });
});
