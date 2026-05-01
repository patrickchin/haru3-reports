import { useState, useEffect, useCallback } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useQuery } from "@tanstack/react-query";
import { backend } from "@/lib/backend";

const PROVIDER_STORAGE_KEY = "ai_provider";
const MODEL_STORAGE_KEY = "ai_model";

export const AI_PROVIDERS = [
  { key: "kimi", label: "Kimi", desc: "Cheapest, good for dev" },
  { key: "openai", label: "OpenAI", desc: "Balanced quality / price" },
  { key: "anthropic", label: "Anthropic", desc: "Strong instruction following" },
  { key: "google", label: "Google", desc: "Fast, large context" },
  { key: "zai", label: "Z.AI", desc: "Strong reasoning (GLM)" },
  { key: "deepseek", label: "DeepSeek", desc: "Cheap, capable" },
] as const;

export type AiProviderKey = (typeof AI_PROVIDERS)[number]["key"];

/**
 * Catalogue of selectable models per provider. First entry is the default.
 * Keep in sync with supabase/functions/generate-report/index.ts:PROVIDER_MODELS
 * and apps/playground/src/lib/providers.ts:PROVIDER_MODELS.
 */
export const PROVIDER_MODELS: Record<AiProviderKey, { id: string; label: string }[]> = {
  kimi: [
    { id: "kimi-k2-0711-preview", label: "Kimi K2 (preview)" },
    { id: "moonshot-v1-32k", label: "Moonshot v1 32k" },
    { id: "moonshot-v1-128k", label: "Moonshot v1 128k" },
  ],
  openai: [
    { id: "gpt-4o-mini", label: "GPT-4o mini" },
    { id: "gpt-4o", label: "GPT-4o" },
    { id: "gpt-4.1-mini", label: "GPT-4.1 mini" },
  ],
  anthropic: [
    { id: "claude-sonnet-4-20250514", label: "Claude Sonnet 4" },
    { id: "claude-haiku-4-5", label: "Claude Haiku 4.5" },
    { id: "claude-opus-4-1", label: "Claude Opus 4.1" },
  ],
  google: [
    { id: "gemini-2.0-flash", label: "Gemini 2.0 Flash" },
    { id: "gemini-2.5-flash", label: "Gemini 2.5 Flash" },
    { id: "gemini-2.5-pro", label: "Gemini 2.5 Pro" },
  ],
  zai: [
    { id: "glm-4.6", label: "GLM-4.6" },
    { id: "glm-4-air", label: "GLM-4 Air" },
  ],
  deepseek: [
    { id: "deepseek-chat", label: "DeepSeek V3 (chat)" },
    { id: "deepseek-reasoner", label: "DeepSeek R1 (reasoner)" },
  ],
};

function getDefaultModel(provider: AiProviderKey): string {
  return PROVIDER_MODELS[provider]?.[0]?.id ?? "";
}

function isValidModel(provider: AiProviderKey, model: string): boolean {
  return PROVIDER_MODELS[provider]?.some((m) => m.id === model) ?? false;
}

export function useAvailableProviders() {
  return useQuery<string[]>({
    queryKey: ["available-providers"],
    queryFn: async () => {
      const { data, error } = await backend.functions.invoke("generate-report", {
        method: "GET",
      });
      if (error) throw error;
      return (data as { providers: string[] }).providers;
    },
    staleTime: 5 * 60 * 1000,
  });
}

export function useAiProvider() {
  const [provider, setProviderState] = useState<AiProviderKey>("kimi");
  const [model, setModelState] = useState<string>(() => getDefaultModel("kimi"));
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    Promise.all([
      AsyncStorage.getItem(PROVIDER_STORAGE_KEY),
      AsyncStorage.getItem(MODEL_STORAGE_KEY),
    ]).then(([providerVal, modelVal]) => {
      const validProvider = providerVal && AI_PROVIDERS.some((p) => p.key === providerVal)
        ? (providerVal as AiProviderKey)
        : "kimi";
      setProviderState(validProvider);

      const validModel = modelVal && isValidModel(validProvider, modelVal)
        ? modelVal
        : getDefaultModel(validProvider);
      setModelState(validModel);
      setIsLoaded(true);
    });
  }, []);

  const setProvider = useCallback((key: AiProviderKey) => {
    setProviderState(key);
    void AsyncStorage.setItem(PROVIDER_STORAGE_KEY, key);
    // Snap model to the provider's default if the current model isn't valid.
    setModelState((current) => {
      const next = isValidModel(key, current) ? current : getDefaultModel(key);
      void AsyncStorage.setItem(MODEL_STORAGE_KEY, next);
      return next;
    });
  }, []);

  const setModel = useCallback((modelId: string) => {
    setModelState(modelId);
    void AsyncStorage.setItem(MODEL_STORAGE_KEY, modelId);
  }, []);

  return { provider, setProvider, model, setModel, isLoaded };
}

export async function getStoredProvider(): Promise<AiProviderKey> {
  const val = await AsyncStorage.getItem(PROVIDER_STORAGE_KEY);
  if (val && AI_PROVIDERS.some((p) => p.key === val)) {
    return val as AiProviderKey;
  }
  return "kimi";
}

export async function getStoredModel(provider: AiProviderKey): Promise<string> {
  const val = await AsyncStorage.getItem(MODEL_STORAGE_KEY);
  if (val && isValidModel(provider, val)) return val;
  return getDefaultModel(provider);
}
