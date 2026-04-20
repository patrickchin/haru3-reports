import { generateText } from "npm:ai";
import { createClient } from "npm:@supabase/supabase-js@2";

export type TokenUsage = {
  inputTokens: number;
  outputTokens: number;
  cachedTokens: number;
};

export type RecordUsageParams = {
  userId: string;
  projectId: string | null;
  usage: TokenUsage;
  model: string;
  provider: string;
};

export type UsageContext = {
  userId: string | null;
  projectId: string | null;
};

export type TextGenerationRequest = {
  model: unknown;
  system: string;
  prompt: string;
  temperature: number;
  maxOutputTokens?: number;
  providerOptions?: Record<string, unknown>;
};

export type GenerateTextFn = (
  args: TextGenerationRequest,
) => Promise<{ text: string; usage?: TokenUsage | null }>;

export type TextGenerationResult = {
  text: string;
  usage: TokenUsage | null;
  provider: string;
  model: string;
};

type InvokeTextModelParams = TextGenerationRequest & {
  provider: string;
  modelId: string;
  generateTextFn?: GenerateTextFn;
  usageContext?: UsageContext;
  recordUsageFn?: (params: RecordUsageParams) => Promise<void>;
};

function normalizeTokenUsage(
  usage: TokenUsage | Record<string, unknown> | null | undefined,
): TokenUsage | null {
  if (!usage) return null;

  return {
    inputTokens: typeof usage.inputTokens === "number" ? usage.inputTokens : 0,
    outputTokens: typeof usage.outputTokens === "number"
      ? usage.outputTokens
      : 0,
    cachedTokens: typeof usage.cachedTokens === "number"
      ? usage.cachedTokens
      : 0,
  };
}

export async function defaultRecordUsage(
  params: RecordUsageParams,
): Promise<void> {
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const supabaseUrl = Deno.env.get("SUPABASE_URL");

  if (!serviceKey || !supabaseUrl) {
    console.warn(
      "token_usage: missing SUPABASE_SERVICE_ROLE_KEY or SUPABASE_URL, skipping",
    );
    return;
  }

  const serviceClient = createClient(supabaseUrl, serviceKey);
  const { error } = await serviceClient.from("token_usage").insert({
    user_id: params.userId,
    project_id: params.projectId,
    input_tokens: params.usage.inputTokens,
    output_tokens: params.usage.outputTokens,
    cached_tokens: params.usage.cachedTokens,
    model: params.model,
    provider: params.provider,
  });

  if (error) {
    console.error("token_usage insert failed:", error.message, error.details);
    return;
  }

  console.log("token_usage inserted", {
    userId: params.userId,
    projectId: params.projectId,
    model: params.model,
    provider: params.provider,
    inputTokens: params.usage.inputTokens,
    outputTokens: params.usage.outputTokens,
    cachedTokens: params.usage.cachedTokens,
  });
}

async function maybeRecordUsage(params: {
  usageContext?: UsageContext;
  usage: TokenUsage | null;
  model: string;
  provider: string;
  recordUsageFn?: (params: RecordUsageParams) => Promise<void>;
}): Promise<void> {
  if (!params.usageContext?.userId) {
    console.warn("token_usage skipped: missing userId");
    return;
  }

  if (!params.usage) {
    console.warn("token_usage skipped: missing usage");
    return;
  }

  const recordUsage = params.recordUsageFn ?? defaultRecordUsage;
  await recordUsage({
    userId: params.usageContext.userId,
    projectId: params.usageContext.projectId,
    usage: params.usage,
    model: params.model,
    provider: params.provider,
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
    maxOutputTokens: params.maxOutputTokens,
    providerOptions: params.providerOptions,
  };

  if (params.generateTextFn) {
    const { text, usage } = await params.generateTextFn(request);
    const normalizedUsage = normalizeTokenUsage(usage ?? null);

    await maybeRecordUsage({
      usageContext: params.usageContext,
      usage: normalizedUsage,
      model: params.modelId,
      provider: params.provider,
      recordUsageFn: params.recordUsageFn,
    });

    return {
      text,
      usage: normalizedUsage,
      provider: params.provider,
      model: params.modelId,
    };
  }

  const { text, usage, finishReason } = await generateText({
    model: params.model as never,
    messages: [
      {
        role: "system",
        content: params.system,
        providerOptions: {
          anthropic: { cacheControl: { type: "ephemeral" } },
        },
      },
      {
        role: "user",
        content: params.prompt,
      },
    ],
    temperature: params.temperature,
    maxOutputTokens: params.maxOutputTokens,
    providerOptions: params.providerOptions as never,
  });

  console.log("LLM Stats:", {
    provider: params.provider,
    inputTokens: usage?.inputTokens,
    outputTokens: usage?.outputTokens,
    totalTokens: usage?.totalTokens,
    finishReason,
  });
  console.log("Raw LLM response:\n", text);

  const normalizedUsage = normalizeTokenUsage(
    usage as Record<string, unknown> | null | undefined,
  );

  await maybeRecordUsage({
    usageContext: params.usageContext,
    usage: normalizedUsage,
    model: params.modelId,
    provider: params.provider,
    recordUsageFn: params.recordUsageFn,
  });

  return {
    text,
    usage: normalizedUsage,
    provider: params.provider,
    model: params.modelId,
  };
}
