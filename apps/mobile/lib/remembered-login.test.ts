import { describe, expect, it, vi } from "vitest";
import {
  clearRememberedPhoneNumber,
  getRememberedPhoneNumber,
  REMEMBERED_PHONE_STORAGE_KEY,
  rememberPhoneNumber,
} from "./remembered-login";

function createStorage(initialValue: string | null = null) {
  const values = new Map<string, string>();

  if (initialValue !== null) {
    values.set(REMEMBERED_PHONE_STORAGE_KEY, initialValue);
  }

  return {
    getItem: vi.fn(async (key: string) => values.get(key) ?? null),
    setItem: vi.fn(async (key: string, value: string) => {
      values.set(key, value);
    }),
    removeItem: vi.fn(async (key: string) => {
      values.delete(key);
    }),
  };
}

describe("getRememberedPhoneNumber", () => {
  it("returns null when there is no stored phone number", async () => {
    const storage = createStorage();

    await expect(getRememberedPhoneNumber(storage)).resolves.toBeNull();
  });

  it("trims stored values", async () => {
    const storage = createStorage("  +15550000000  ");

    await expect(getRememberedPhoneNumber(storage)).resolves.toBe("+15550000000");
  });
});

describe("rememberPhoneNumber", () => {
  it("stores a trimmed phone number", async () => {
    const storage = createStorage();

    await expect(rememberPhoneNumber("  +15550000000  ", storage)).resolves.toBe(
      "+15550000000",
    );
    expect(storage.setItem).toHaveBeenCalledWith(
      REMEMBERED_PHONE_STORAGE_KEY,
      "+15550000000",
    );
  });

  it("clears storage when the phone number is blank", async () => {
    const storage = createStorage("+15550000000");

    await expect(rememberPhoneNumber("   ", storage)).resolves.toBeNull();
    expect(storage.removeItem).toHaveBeenCalledWith(
      REMEMBERED_PHONE_STORAGE_KEY,
    );
  });
});

describe("clearRememberedPhoneNumber", () => {
  it("removes the stored phone number", async () => {
    const storage = createStorage("+15550000000");

    await clearRememberedPhoneNumber(storage);

    expect(storage.removeItem).toHaveBeenCalledWith(
      REMEMBERED_PHONE_STORAGE_KEY,
    );
  });
});
