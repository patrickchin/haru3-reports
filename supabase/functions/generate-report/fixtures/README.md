# LLM Fixtures

This directory contains captured + hand-crafted LLM responses used by tests to
run fully offline.

## Layout

```
fixtures/
  prompt-version.json      Hash of SYSTEM_PROMPT + schema, capture metadata
  happy/                   Realistic LLM outputs captured from the real API
    <name>.input.json      { notes }
    <name>.raw.txt         Raw LLM text response (pre-parse, pre-extractJson)
    <name>.parsed.json     Final GenerateResult after parseLLMReport
  errors/                  Hand-crafted degraded LLM responses
    MANIFEST.json          Maps each error file to its expected failure mode
    <name>.raw.txt         Raw text simulating an LLM failure
```

## How fixtures are produced

- **`happy/`** — captured by `capture-fixtures.ts`, run nightly in
  `.github/workflows/capture-fixtures.yml`. The CI job calls the real LLM
  through `fetchReportFromLLM` (the same code path the edge function uses) and
  saves all three files per sample.
- **`errors/`** — hand-crafted to cover failure modes the LLM may produce
  (malformed JSON, truncated output, markdown-wrapped JSON, wrong types, HTML
  error pages, etc.). Add new ones whenever an integration test catches a real
  failure that isn't yet represented here.

## Staleness

`prompt-version.json` records a SHA-256 of `SYSTEM_PROMPT`. Tests warn when the
live hash no longer matches the captured hash, signalling that fixtures should
be refreshed.

To refresh manually:

```bash
# With provider keys available
INTEGRATION=true AI_PROVIDER=kimi MOONSHOT_API_KEY=… \
  deno run --allow-env --allow-net --allow-read --allow-write \
  supabase/functions/generate-report/capture-fixtures.ts
```

Or trigger the GitHub workflow manually (`workflow_dispatch` →
`Capture LLM Fixtures`).
