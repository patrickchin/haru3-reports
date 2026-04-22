const STORAGE_KEY = "harpa-playground-key";
const PROVIDER_KEYS_KEY = "harpa-playground-provider-keys";

export function getKey(): string {
  return localStorage.getItem(STORAGE_KEY) ?? "";
}

export function setKey(key: string): void {
  localStorage.setItem(STORAGE_KEY, key.trim());
}

export function clearKey(): void {
  localStorage.removeItem(STORAGE_KEY);
}

export type ProviderKeys = {
  kimi?: string;
  openai?: string;
  anthropic?: string;
  google?: string;
};

export function getProviderKeys(): ProviderKeys {
  try {
    const raw = localStorage.getItem(PROVIDER_KEYS_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

export function setProviderKeys(keys: ProviderKeys): void {
  const cleaned: ProviderKeys = {};
  for (const [k, v] of Object.entries(keys)) {
    const trimmed = v?.trim();
    if (trimmed) {
      cleaned[k as keyof ProviderKeys] = trimmed;
    }
  }
  localStorage.setItem(PROVIDER_KEYS_KEY, JSON.stringify(cleaned));
}

export function clearProviderKeys(): void {
  localStorage.removeItem(PROVIDER_KEYS_KEY);
}
