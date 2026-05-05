/**
 * Adapter that calls the Vercel AI SDK's `generateText` and
 * (optionally) records token usage.
 *
 * Ported from `supabase/functions/_shared/llm.ts`. Token usage is
 * inserted directly into the `token_usage` table via raw SQL (matches
 * the columns the edge function writes).
 */
import { generateText } from "ai";

import type { Sql } from "../sync-pull.js";
import { getLogger } from "../../logger.js";

export interface TokenUsage {
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly cachedTokens: number;
}

export interface RecordUsageParams {
  readonly userId: string;
  readonly projectId: string | null;
  readonly usage: TokenUsage;
  readonly model: string;
  readonly provider: string;
}

export interface UsageContext {
  readonly userId: string | null;
  readonly projectId: string | null;
}

export interface TextGenerationRequest {
  readonly model: unknown;
  readonly system: string;
  readonly prompt: string;
  readonly temperature: number;
  readonly maxOutputTokens?: number;
  readonly providerOptions?: Record<string, unknown>;
}

export type GenerateTextFn = (
  args: TextGenerationRequest,
) => Promise<{ text: string; usage?: TokenUsage | null }>;

export interface TextGenerationResult {
  readonly text: string;
  readonly usage: TokenUsage | null;
  readonly provider: string;
  readonly model: string;
}

export interface InvokeTextModelParams extends TextGenerationRequest {
  readonly provider: string;
  readonly modelId: string;
  readonly generateTextFn?: GenerateTextFn;
  readonly usageContext?: UsageContext;
  readonly recordUsageFn?: (params: RecordUsageParams) => Promise<void>;
}

function normalizeTokenUsage(
  usage: TokenUsage | Record<string, unknown> | null | undefined,
): TokenUsage | null {
  if (!usage) return null;
  return {
    inputTokens:
      typeof usage["inputTokens"] === "number" ? usage["inputTokens"] : 0,
    outputTokens:
      typeof usage["outputTokens"] === "number" ? usage["outputTokens"] : 0,
    cachedTokens:
      typeof usage["cachedTokens"] === "number" ? usage["cachedTokens"] : 0,
  };
}

/** Builds a default usage recorder bound to a SQL client. */
export function makeRecordUsage(
  sql: Sql,
): (params: RecordUsageParams) => Promise<void> {
  return async (params) => {
    try {
      await sql`
        INSERT INTO public.token_usage
          (user_id, project_id, input_tokens, output_tokens, cached_tokens, model, provider)
        VALUES
          (${params.userId}, ${params.projectId},
           ${params.usage.inputTokens}, ${params.usage.outputTokens}, ${params.usage.cachedTokens},
           ${params.model}, ${params.provider})
      `;
    } catch (err) {
      getLogger().error(
        { err, model: params.model, provider: params.provider },
        "token_usage insert failed",
      );
    }
  };
}

async function maybeRecordUsage(opts: {
  usageContext?: UsageContext;
  usage: TokenUsage | null;
  model: string;
  provider: string;
  recordUsageFn?: (params: RecordUsageParams) => Promise<void>;
}): Promise<void> {
  if (!opts.usageContext?.userId || !opts.usage || !opts.recordUsageFn) {
    return;
  }
  await opts.recordUsageFn({
    userId: opts.usageContext.userId,
    projectId: opts.usageContext.projectId,
    usage: opts.usage,
    model: opts.model,
    provider: opts.provider,
  });
}

export async function invokeTextModel(
  params: InvokeTextModelParams,
): Promise<TextGenerationResult> {
  const request: TextGenerationRequest = {
    model: params.model,
    system: params.system,
    prompt: params.prompt,
    temperature: params.temperature,
    ...(params.maxOutputTokens !== undefined && {
      maxOutputTokens: params.maxOutputTokens,
    }),
    ...(params.providerOptions !== undefined && {
      providerOptions: params.providerOptions,
    }),
  };

  if (params.generateTextFn) {
    const { text, usage } = await params.generateTextFn(request);
    const normalizedUsage = normalizeTokenUsage(usage ?? null);
    await maybeRecordUsage({
      ...(params.usageContext !== undefined && {
        usageContext: params.usageContext,
      }),
      usage: normalizedUsage,
      model: params.modelId,
      provider: params.provider,
      ...(params.recordUsageFn !== undefined && {
        recordUsageFn: params.recordUsageFn,
      }),
    });
    return {
      text,
      usage: normalizedUsage,
      provider: params.provider,
      model: params.modelId,
    };
  }

  const { text, usage } = await generateText({
    model: params.model as never,
    messages: [
      {
        role: "system",
        content: params.system,
        providerOptions: {
          anthropic: { cacheControl: { type: "ephemeral" } },
        },
      },
      { role: "user", content: params.prompt },
    ],
    temperature: params.temperature,
    ...(params.maxOutputTokens !== undefined && {
      maxOutputTokens: params.maxOutputTokens,
    }),
    ...(params.providerOptions !== undefined && {
      providerOptions: params.providerOptions as never,
    }),
  });

  const normalizedUsage = normalizeTokenUsage(
    usage as Record<string, unknown> | null | undefined,
  );
  await maybeRecordUsage({
    ...(params.usageContext !== undefined && {
      usageContext: params.usageContext,
    }),
    usage: normalizedUsage,
    model: params.modelId,
    provider: params.provider,
    ...(params.recordUsageFn !== undefined && {
      recordUsageFn: params.recordUsageFn,
    }),
  });
  return {
    text,
    usage: normalizedUsage,
    provider: params.provider,
    model: params.modelId,
  };
}
