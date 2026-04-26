# AI Providers

The `generate-report` edge function supports multiple AI providers via the Vercel AI SDK. The provider is selected by the `AI_PROVIDER` environment variable (defaults to `kimi`).

## Configured Providers

| Provider key | Model | Context window | JSON mode | SDK package |
|-------------|-------|---------------|-----------|-------------|
| `kimi` (default) | `kimi-k2-0711-preview` | 128k | `response_format: json_object` | `@ai-sdk/openai-compatible` |
| `openai` | `gpt-4o-mini` | 128k | native | `@ai-sdk/openai` |
| `anthropic` | `claude-sonnet-4-20250514` | 200k | native | `@ai-sdk/anthropic` |
| `google` | `gemini-2.0-flash` | 1M | native | `@ai-sdk/google` |
| `zai` | `glm-4.6` | 200k | `response_format: json_object` | `@ai-sdk/openai-compatible` |
| `deepseek` | `deepseek-chat` | 64k | `response_format: json_object` | `@ai-sdk/openai-compatible` |

## Provider Characteristics

### Kimi (Moonshot AI)

- **Cheapest** option, good for development and CI
- Weaker instruction-following — sometimes summarises instead of structuring
- May return wrong types (`"5"` instead of `5`) — handled by Zod validation on the client
- Used as the default CI provider for integration tests
- Base URL: `https://api.moonshot.cn/v1`

### OpenAI (gpt-4o-mini)

- Good price/quality ratio
- Strong JSON schema compliance
- Reliable for structured extraction tasks

### Anthropic (Claude Sonnet)

- Strongest instruction-following of the four
- Supports **prompt caching** — the ~1,500-token system prompt is cached for 5 min via `providerOptions.anthropic.cacheControl`, cutting ~90% of system prompt cost on repeat calls
- Most expensive per-token

### Google (Gemini 2.0 Flash)

- Fastest response times
- Largest context window (1M tokens, though report generation uses <5k)
- Competitive pricing

### Z.AI (GLM-4.6)

- Strong reasoning, competitive on instruction-following
- OpenAI-compatible endpoint at `https://api.z.ai/api/paas/v4`
- Uses `response_format: json_object` for JSON mode (same approach as Kimi)
- Made by Zhipu AI (China)

### DeepSeek (DeepSeek-V3)

- Cheap, capable general-purpose model (`deepseek-chat` = DeepSeek-V3)
- OpenAI-compatible endpoint at `https://api.deepseek.com/v1`
- Uses `response_format: json_object` for JSON mode
- Switch to `deepseek-reasoner` (R1) for reasoning-heavy tasks at ~2× cost
- Made by DeepSeek (China)

## Environment Variables

Each provider requires its own API key:

| Provider | Env variable | Required |
|----------|-------------|----------|
| kimi | `MOONSHOT_API_KEY` | When `AI_PROVIDER=kimi` |
| openai | `OPENAI_API_KEY` | When `AI_PROVIDER=openai` |
| anthropic | `ANTHROPIC_API_KEY` | When `AI_PROVIDER=anthropic` |
| google | `GOOGLE_AI_API_KEY` | When `AI_PROVIDER=google` |
| zai | `ZAI_API_KEY` | When `AI_PROVIDER=zai` |
| deepseek | `DEEPSEEK_API_KEY` | When `AI_PROVIDER=deepseek` |

Set via `supabase secrets set` for deployed functions, or as environment variables locally.

## Switching Providers

```bash
# Set for deployed edge function
supabase secrets set AI_PROVIDER=openai

# Or for local development (in .env or shell)
export AI_PROVIDER=google
```

The provider can also be overridden per-request by passing `provider` in the `generateReportFromNotes` deps (used in tests).

## Prompt Sizes

| Scenario | System prompt | User prompt | Total ~tokens |
|----------|--------------|-------------|---------------|
| 9 notes (quiet day) | ~1,500 | ~300 | ~1,800 |
| 50 notes (commercial build) | ~1,500 | ~1,500 | ~3,000 |

All scenarios are well within every provider's context window. Output is typically 1,000–4,000 tokens depending on report complexity.

## Cost Optimisations

1. **Prompt caching** (Anthropic only): system prompt cached for 5 min
2. **Delta notes**: only new notes sent when updating an existing report
3. **Minified JSON output**: LLM instructed to return compact JSON, omitting null/empty fields
4. **`maxOutputTokens: 8000`**: caps runaway responses
