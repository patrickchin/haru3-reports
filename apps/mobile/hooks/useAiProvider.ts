import { useState, useEffect, useCallback } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useQuery } from "@tanstack/react-query";
import { backend } from "@/lib/backend";

const STORAGE_KEY = "ai_provider";

export const AI_PROVIDERS = [
  { key: "kimi", label: "Kimi", desc: "Cheapest, good for dev" },
  { key: "openai", label: "OpenAI", desc: "GPT-4o Mini — balanced" },
  { key: "anthropic", label: "Anthropic", desc: "Claude Sonnet — best quality" },
  { key: "google", label: "Google", desc: "Gemini Flash — fastest" },
] as const;

export type AiProviderKey = (typeof AI_PROVIDERS)[number]["key"];

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
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then((val) => {
      if (val && AI_PROVIDERS.some((p) => p.key === val)) {
        setProviderState(val as AiProviderKey);
      }
      setIsLoaded(true);
    });
  }, []);

  const setProvider = useCallback((key: AiProviderKey) => {
    setProviderState(key);
    AsyncStorage.setItem(STORAGE_KEY, key);
  }, []);

  return { provider, setProvider, isLoaded };
}

export async function getStoredProvider(): Promise<AiProviderKey> {
  const val = await AsyncStorage.getItem(STORAGE_KEY);
  if (val && AI_PROVIDERS.some((p) => p.key === val)) {
    return val as AiProviderKey;
  }
  return "kimi";
}
