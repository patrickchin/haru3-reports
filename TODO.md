# TODO

## Token Usage & Billing

- [ ] Per-account token usage tracking
  - Add a `token_usage` table (user_id, project_id, report_id, input_tokens, output_tokens, cached_tokens, model, created_at)
  - Record token counts from `generateText` response in the `generate-report` edge function
  - Add RLS policies so users can only read their own usage
  - Aggregate endpoint or DB view for per-account totals (daily / monthly)
  - Surface usage stats in the mobile app (account/profile screen)
  - Set per-account quotas / rate limits based on plan tier
