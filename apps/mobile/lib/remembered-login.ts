import AsyncStorage from "@react-native-async-storage/async-storage";

export const REMEMBERED_PHONE_STORAGE_KEY = "remembered_login_phone";

type StorageLike = {
  getItem: (key: string) => Promise<string | null>;
  setItem: (key: string, value: string) => Promise<void>;
  removeItem: (key: string) => Promise<void>;
};

export async function getRememberedPhoneNumber(
  storage: StorageLike = AsyncStorage,
): Promise<string | null> {
  const value = await storage.getItem(REMEMBERED_PHONE_STORAGE_KEY);
  const normalizedValue = value?.trim() ?? "";

  return normalizedValue.length > 0 ? normalizedValue : null;
}

export async function rememberPhoneNumber(
  phoneNumber: string,
  storage: StorageLike = AsyncStorage,
): Promise<string | null> {
  const normalizedValue = phoneNumber.trim();

  if (normalizedValue.length === 0) {
    await storage.removeItem(REMEMBERED_PHONE_STORAGE_KEY);
    return null;
  }

  await storage.setItem(REMEMBERED_PHONE_STORAGE_KEY, normalizedValue);
  return normalizedValue;
}

export async function clearRememberedPhoneNumber(
  storage: StorageLike = AsyncStorage,
) {
  await storage.removeItem(REMEMBERED_PHONE_STORAGE_KEY);
}
