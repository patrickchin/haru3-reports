/**
 * Shared LLM invocation helper for the v3 Hono API.
 * Ported from supabase/functions/_shared/llm.ts (Deno → Node).
 * Records token usage to the `token_usage` table via Drizzle.
 */
import { generateText } from 'ai';
import { getDb } from '../db/instance.js';
import { tokenUsage } from '../db/schema.js';

export type TokenUsage = {
  inputTokens: number;
  outputTokens: number;
  cachedTokens: number;
};

export type UsageContext = {
  userId: string | null;
  projectId: string | null;
  reportId?: string | null;
};

export type TextGenerationResult = {
  text: string;
  usage: TokenUsage | null;
  provider: string;
  model: string;
};

type InvokeTextModelParams = {
  model: unknown;
  modelId: string;
  provider: string;
  system: string;
  prompt: string;
  temperature: number;
  maxOutputTokens?: number;
  providerOptions?: Record<string, unknown>;
  usageContext?: UsageContext;
};

function normalizeUsage(
  usage: Record<string, unknown> | null | undefined,
): TokenUsage | null {
  if (!usage) return null;
  return {
    inputTokens: typeof usage.inputTokens === 'number' ? usage.inputTokens : 0,
    outputTokens: typeof usage.outputTokens === 'number' ? usage.outputTokens : 0,
    cachedTokens: typeof usage.cachedTokens === 'number' ? usage.cachedTokens : 0,
  };
}

async function recordUsage(
  ctx: UsageContext,
  usage: TokenUsage,
  model: string,
  provider: string,
): Promise<void> {
  if (!ctx.userId) return;
  try {
    const db = getDb();
    await db.insert(tokenUsage).values({
      userId: ctx.userId,
      projectId: ctx.projectId ?? undefined,
      reportId: ctx.reportId ?? undefined,
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
      cachedTokens: usage.cachedTokens,
      model,
      provider,
    });
  } catch (err) {
    console.error('token_usage insert failed:', err);
  }
}

export async function invokeTextModel(
  params: InvokeTextModelParams,
): Promise<TextGenerationResult> {
  const { text, usage, finishReason } = await generateText({
    model: params.model as never,
    messages: [
      {
        role: 'system' as const,
        content: params.system,
        providerOptions: {
          anthropic: { cacheControl: { type: 'ephemeral' } },
        },
      },
      { role: 'user' as const, content: params.prompt },
    ],
    temperature: params.temperature,
    maxOutputTokens: params.maxOutputTokens,
    providerOptions: params.providerOptions as never,
  });

  console.log('LLM Stats:', {
    provider: params.provider,
    model: params.modelId,
    inputTokens: usage?.inputTokens,
    outputTokens: usage?.outputTokens,
    finishReason,
  });

  const normalized = normalizeUsage(usage as Record<string, unknown> | null);

  if (params.usageContext && normalized) {
    await recordUsage(params.usageContext, normalized, params.modelId, params.provider);
  }

  return {
    text,
    usage: normalized,
    provider: params.provider,
    model: params.modelId,
  };
}
