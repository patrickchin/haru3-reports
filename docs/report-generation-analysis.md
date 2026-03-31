# Report Generation: Analysis & Next Steps

> Written 31 Mar 2026 — snapshot of where we are after the JSON Patch refactor and what to try next.

---

## 1. Current Architecture

```
Voice notes (strings)
  → SYSTEM_PROMPT (schema + instructions, ~1 500 tokens)
  → User prompt: CURRENT_REPORT JSON + ALL_NOTES
  → LLM returns { ops: [...] }  (RFC 6902 JSON Patch)
  → fast-json-patch applies ops to EMPTY_REPORT (or existing report)
  → parseGeneratedSiteReport normalises types
  → final GeneratedSiteReport
```

- **Single prompt, single call** — no multi-step or agent loop.
- Patch-based: LLM returns incremental ops, not the full report.
- `EMPTY_REPORT` is the base document for first-generation.
- `parseGeneratedSiteReport` coerces types (string→number), supplies defaults, validates structure.

### Models configured

| Provider | Model | Context | JSON mode | Notes |
|----------|-------|---------|-----------|-------|
| **kimi** (default in CI) | `moonshot-v1-128k` | 128k | `response_format: json_object` | Cheapest. Made by Moonshot AI (China). Weaker instruction-following. |
| openai | `gpt-4o-mini` | 128k | native | Good price/quality ratio. |
| anthropic | `claude-sonnet-4-20250514` | 200k | native | Strong instruction-following. |
| google | `gemini-2.0-flash` | 1M | native | Fast, cheap, large context. |

### Prompt sizes (measured)

| Scenario | System | User | Total chars | ~Tokens |
|----------|--------|------|-------------|---------|
| 9 notes (quiet day) | 6 161 | 1 082 | 7 243 | ~1 800 |
| 50 notes (commercial build) | 6 161 | 5 787 | 11 948 | ~3 000 |

The prompt is well within all models' context windows. EMPTY_REPORT itself is only 279 chars (3 nulls, 5 empty arrays, 3 empty strings).

---

## 2. Why the Integration Tests Are Flaky

### 2a. Code bugs (fixed)

These were real bugs introduced by the JSON Patch migration:

1. **`OPERATION_PATH_UNRESOLVABLE`** — LLM emits `replace` at `/report/weather/conditions` but `weather` is `null` in EMPTY_REPORT. fast-json-patch can't traverse through null. **Fixed:** `ensureIntermediatePaths()` vivifies null intermediates to `{}` or `[]`.
2. **Wrong types** — LLM returns `totalWorkers: "1"` (string) instead of `1` (number). The old `parseGeneratedSiteReport` handled this but was bypassed. **Fixed:** now run `parseGeneratedSiteReport` on every patched result.
3. **Parser throws on vivified objects** — `manpower: {}` (from vivification) passed to `readRecord` which expects a full object or `null`, not a partial. **Fixed:** `parseWeather`/`parseManpower` return `null` for non-record values.

### 2b. LLM non-determinism (current problem)

After fixing the code bugs, each CI run passes 7–8 of 9 generation tests, but a **different** test fails each time:

| Run | Passed | Failed test | Error |
|-----|--------|------------|-------|
| 4 | 7/9 | technical notes | `expected ≥1 materials, got 0` |
| 5 | 8/9 | resi renovation | `expected weather to be populated` |

The assertions are reasonable (the notes clearly mention materials/weather), but **Kimi sometimes structures data differently** — putting material details in activity summaries/observations instead of the `materials[]` array, or ignoring weather when it's not the main focus.

### 2c. Is Kimi too small / too weak?

**Yes, partially.** moonshot-v1-128k is the weakest model we have configured. The specific problems:

1. **Instruction-following**: Kimi often ignores "Extract ALL materials" — it summarises instead of structuring.
2. **Schema compliance**: Returns wrong types (`totalWorkers: "5"` instead of `5`), misses required fields.
3. **JSON Patch path accuracy**: Sometimes invents paths that don't match the schema.
4. **Inconsistency**: Same prompt, same notes — different structure each time at `temperature: 0.3`.

The irony: Kimi is the cheapest model and the default in CI, but it's the one least suited to the task. `gpt-4o-mini` and `gemini-2.0-flash` would likely pass more consistently at similar cost.

---

## 3. Can We Omit Nulls from EMPTY_REPORT?

**Yes.** The EMPTY_REPORT currently has 3 nulls (`weather`, `manpower`, `visitDate`) and 3 empty strings (`title`, `reportType`, `summary`). With the `ensureIntermediatePaths` fix, the code can handle adding to paths that don't exist yet. A minimal base would be:

```json
{ "report": { "meta": {}, "siteConditions": [], "activities": [], "issues": [], "nextSteps": [], "sections": [] } }
```

**Benefits**: Smaller user prompt, fewer tokens for the LLM to reason over.
**Risk**: The LLM sees fewer "hints" about available fields → might not populate weather/manpower at all. We'd need to test this.

**Verdict**: Worth trying. The system prompt already documents the full schema. The EMPTY_REPORT is primarily a target document for patches, not a prompt hint.

---

## 4. Alternative Approaches Worth Investigating

### Approach A: Structured Output (JSON Schema mode)

Instead of asking the LLM to return JSON Patch ops, use **provider-native structured output**:

```
OpenAI:    response_format: { type: "json_schema", json_schema: {...} }
Gemini:    responseMimeType: "application/json" + responseSchema
Anthropic: tool_use with input_schema
```

**Pros:**
- The LLM is **constrained** to output valid JSON matching the schema. No path errors, no wrong types.
- No patch parsing/application layer needed.
- No `ensureIntermediatePaths`, `resolvePath`, or `parseGeneratedSiteReport` normalisation.

**Cons:**
- Returns the **full report** every time (no incremental patches). Costs more output tokens.
- Provider-specific API surface — harder to abstract across 4 providers.
- For incremental updates, we'd need a separate merge strategy (or just ask the LLM to return the whole updated report).

**Verdict:** This is the strongest option for reliability. The output token cost is manageable (a full report is ~2 000–4 000 tokens). The Vercel AI SDK's `generateObject()` supports this natively.

### Approach B: Two-pass — Extract then Structure

```
Pass 1: "Extract facts from these notes as a flat list"
  → [{ type: "weather", value: "sunny 24C" }, { type: "material", name: "N12 reo", qty: "2t" }, ...]

Pass 2: "Given these facts, build the report JSON"
  → { report: { ... } }
```

**Pros:**
- Pass 1 is easy — even weak models extract facts well from natural text.
- Pass 2 is easy — just slot structured data into a template.
- Separation of concerns: extraction vs structuring.
- Can retry pass 2 cheaply if it fails (facts are cached).

**Cons:**
- 2× API calls, 2× latency.
- Intermediate schema adds complexity.
- Pass 1 extraction may lose context (e.g., which activity a material belongs to).

**Verdict:** Interesting for reliability but adds latency. Better suited if we find single-pass keeps failing.

### Approach C: generateObject() (Vercel AI SDK)

The `ai` SDK already has `generateObject()` which combines structured output + Zod validation:

```typescript
import { generateObject } from "ai";
import { z } from "zod";

const { object } = await generateObject({
  model,
  schema: reportZodSchema,
  prompt: "...",
});
```

**Pros:**
- Schema defined once in Zod, used for both validation and LLM constraint.
- Automatic retries on schema violation.
- Works across providers (OpenAI, Anthropic, Google).
- No need for `parseGeneratedSiteReport` — Zod IS the parser.

**Cons:**
- Returns full report (same as Approach A).
- Zod schema needs to match the TypeScript types exactly.

**Verdict:** This is probably the best next step. It collapses the parse + validate + type-coerce pipeline into a single Zod schema and removes the entire JSON Patch layer.

### Approach D: Hybrid — generateObject() for full gen, JSON Patch for incremental

- First generation: use `generateObject()` → guaranteed valid report.
- Incremental updates: keep JSON Patch (already works well once the base report is valid).

**Pros:** Best of both worlds — reliable first gen, efficient incremental.
**Cons:** Two code paths to maintain.

### Approach E: Use a better model in CI

The simplest fix for test flakiness: switch CI from `kimi` to `gpt-4o-mini` or `gemini-2.0-flash`.

**Cost comparison (rough, for whole test suite per run):**

| Model | ~Input cost | ~Output cost | Est. total per CI run |
|-------|-------------|-------------|----------------------|
| kimi moonshot-v1-128k | ~$0.01 | ~$0.01 | ~$0.02 |
| gpt-4o-mini | ~$0.01 | ~$0.02 | ~$0.03 |
| gemini-2.0-flash | ~$0.005 | ~$0.01 | ~$0.015 |

The cost difference is negligible. Gemini Flash might actually be cheaper AND more reliable.

---

## 5. Core Issues With Voice-Note → Report Generation

Setting aside the specific implementation, the fundamental challenges are:

### 5a. Transcription quality

- Voice notes may come pre-transcribed (Whisper, etc.) or as raw text.
- Transcription errors: "40 MPA" → "40 M P A", "N12" → "and 12", "SN8" → "S N eight".
- Speaker accents, background noise, construction jargon all degrade quality.
- **The LLM must handle garbled input gracefully.** Currently the prompt doesn't mention this.

### 5b. Self-correction in notes

- People say "wait no" and correct themselves in the same note stream.
- The LLM needs to use the **corrected** value, not the first one.
- Our tests confirm this works, but it's fragile — depends on the LLM recognising the correction.

### 5c. Schema complexity

The report schema has **~70 fields** across nested objects. Many are nullable/optional. This is a lot for an LLM to reason about in a single pass, especially:

- `materials[]` has 10 fields per item (most nullable)
- `equipment[]` has 9 fields per item
- `activities[]` has 15+ fields including nested arrays

**Option:** Simplify the schema for LLM output, then expand programmatically. E.g., the LLM outputs `{ name: "N12 reo", qty: "2t" }` and we fill in the 8 null fields.

### 5d. Incremental updates

- The killer feature: add notes throughout the day, report grows.
- JSON Patch is elegant but fragile — wrong paths crash, LLM needs to understand existing report state.
- Full-report regeneration is simpler but wastes tokens and may lose manual edits.
- **Best approach:** regenerate the full report from all notes each time (notes are the source of truth), but diff against the previous report to show what changed.

### 5e. Extraction completeness

- "Extract ALL materials" is the weakest part — LLMs summarise by nature.
- Smaller models (Kimi) are worse at exhaustive extraction.
- **Structured output** (Approach A/C) forces the LLM to fill in arrays rather than skip them.

### 5f. Testing LLM output

- **You can't assert exact output** from an LLM — only structural properties and keyword presence.
- Current tests use `assertReportMentions()` (keyword in JSON) and `assertHasMaterials()` (array length ≥ N).
- Even these are flaky because the LLM might place data in a different field.
- **Better approach:** Score-based evaluation instead of hard assertions. Run N times, pass if ≥ 80% of runs satisfy the condition. Or use a judge LLM to evaluate quality.

---

## 6. Recommended Next Steps (Priority Order)

### Immediate (this week)

1. **Switch CI to `gpt-4o-mini` or `gemini-2.0-flash`** — unblocks deploy pipeline, trivial change.
2. **Add `continue-on-error` + retry to integration tests** — LLM tests should not block deploy on a single flaky failure. Run twice, pass if either succeeds.

### Short-term (next sprint)

3. **Implement `generateObject()` with Zod schema** (Approach C) — replace JSON Patch for first-generation. This is the biggest reliability win.
4. **Simplify EMPTY_REPORT** — remove null fields, test that it still works.
5. **Multi-provider integration tests** — run the same tests against 2+ providers, pass if any passes. Gives confidence without coupling to one model.

### Medium-term

6. **Two-model strategy** — use a cheap model (Flash/4o-mini) for first draft, then a stronger model (Claude/4o) for review pass. Or just use the cheap model with `generateObject()` and trust the schema constraint.
7. **Score-based test evaluation** — replace hard assertions with a scoring rubric. "Report mentions weather: +1, has ≥1 material: +1, has activities: +2" etc. Fail only if score < threshold.
8. **Investigate speech-to-text pipeline** — if notes will be voice-recorded in the app, the transcription quality is a variable. Consider sending audio directly to Whisper/Gemini and generating the report from the audio, skipping the lossy text step.

### Things NOT to do

- ❌ Don't fine-tune a model for this — the task is well within general capability.
- ❌ Don't build a custom NER/extraction pipeline — the LLM handles this.
- ❌ Don't add more retry/fallback logic around JSON Patch — switch to structured output instead.
- ❌ Don't optimise the SYSTEM_PROMPT further until we've tried `generateObject()`.
