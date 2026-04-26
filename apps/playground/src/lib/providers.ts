// Shared catalogue of providers + selectable models for the playground UI.
// Keep in sync with supabase/functions/generate-report/index.ts:PROVIDER_MODELS
// and apps/mobile/hooks/useAiProvider.ts:PROVIDER_MODELS.

export const PROVIDER_LIST = [
  { id: "kimi", label: "Kimi" },
  { id: "openai", label: "OpenAI" },
  { id: "anthropic", label: "Anthropic" },
  { id: "google", label: "Google" },
  { id: "zai", label: "Z.AI" },
  { id: "deepseek", label: "DeepSeek" },
] as const;

export type ProviderId = (typeof PROVIDER_LIST)[number]["id"];

export const PROVIDER_MODELS: Record<ProviderId, { id: string; label: string }[]> = {
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

export function getDefaultModel(provider: ProviderId): string {
  return PROVIDER_MODELS[provider]?.[0]?.id ?? "";
}

export function isValidModel(provider: ProviderId, model: string): boolean {
  return PROVIDER_MODELS[provider]?.some((m) => m.id === model) ?? false;
}
