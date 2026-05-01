import { assert, assertEquals } from "jsr:@std/assert";

import {
  createHandler,
  extractJson,
  isValidUuid,
  parseSummaryResponse,
  sanitizeSummary,
  sanitizeTitle,
  summarizeTranscript,
  SummaryParseError,
} from "./index.ts";

const VALID_UUID = "11111111-2222-3333-4444-555555555555";

function makeRequest(body: unknown, opts: { auth?: string } = {}): Request {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (opts.auth !== undefined) {
    headers["Authorization"] = `Bearer ${opts.auth}`;
  }
  return new Request("https://example.test/summarize-voice-note", {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

Deno.test("isValidUuid accepts canonical UUIDs and rejects garbage", () => {
  assert(isValidUuid(VALID_UUID));
  assert(!isValidUuid("not-a-uuid"));
  assert(!isValidUuid(""));
  assert(!isValidUuid(123));
});

Deno.test("extractJson strips ```json code fences", () => {
  assertEquals(
    extractJson('```json\n{"title":"x","summary":"y"}\n```'),
    '{"title":"x","summary":"y"}',
  );
  assertEquals(
    extractJson('{"title":"x","summary":"y"}'),
    '{"title":"x","summary":"y"}',
  );
});

Deno.test("sanitizeTitle strips quotes, trailing punctuation, and clamps to 60 chars", () => {
  assertEquals(sanitizeTitle('"Hello world."'), "Hello world");
  assertEquals(sanitizeTitle("Trailing colons:::"), "Trailing colons");
  assertEquals(sanitizeTitle("a".repeat(80)).length, 60);
});

Deno.test("sanitizeSummary clamps to 400 chars with ellipsis", () => {
  const long = "a".repeat(500);
  const out = sanitizeSummary(long);
  assertEquals(out.length, 400);
  assert(out.endsWith("…"));

  assertEquals(sanitizeSummary("short."), "short.");
});

Deno.test("parseSummaryResponse validates shape and applies sanitization", () => {
  const ok = parseSummaryResponse(
    '{"title":"Concrete pour","summary":"All good."}',
  );
  assertEquals(ok, { title: "Concrete pour", summary: "All good." });
});

Deno.test("parseSummaryResponse throws on invalid JSON", () => {
  let caught: unknown = null;
  try {
    parseSummaryResponse("not json at all");
  } catch (err) {
    caught = err;
  }
  assert(caught instanceof SummaryParseError);
});

Deno.test("parseSummaryResponse throws when title or summary missing", () => {
  let caught: unknown = null;
  try {
    parseSummaryResponse('{"title":"only title"}');
  } catch (err) {
    caught = err;
  }
  assert(caught instanceof SummaryParseError);
});

Deno.test("summarizeTranscript truncates very long transcripts before sending to LLM", async () => {
  let receivedPrompt = "";
  const fakeModel = { instance: { __test: true }, modelId: "test-model" };
  const result = await summarizeTranscript("x".repeat(60_000), {
    getModelFn: () => fakeModel,
    generateTextFn: async (req) => {
      receivedPrompt = req.prompt;
      return {
        text: '{"title":"Long note","summary":"It was long."}',
        usage: null,
      };
    },
  });
  assertEquals(result.title, "Long note");
  assert(receivedPrompt.includes("[Transcript truncated for length]"));
});

Deno.test("createHandler returns 401 when there is no user", async () => {
  const handler = createHandler({
    getUserIdFn: async () => null,
  });
  const res = await handler(
    makeRequest({ fileId: VALID_UUID, transcript: "hello" }),
  );
  assertEquals(res.status, 401);
});

Deno.test("createHandler returns 400 for invalid fileId", async () => {
  const handler = createHandler({
    getUserIdFn: async () => "u-1",
  });
  const res = await handler(
    makeRequest({ fileId: "not-a-uuid", transcript: "hello" }),
  );
  assertEquals(res.status, 400);
});

Deno.test("createHandler returns 400 for empty transcript", async () => {
  const handler = createHandler({
    getUserIdFn: async () => "u-1",
  });
  const res = await handler(
    makeRequest({ fileId: VALID_UUID, transcript: "   " }),
  );
  assertEquals(res.status, 400);
});

Deno.test("createHandler happy path: writes summary to file_metadata", async () => {
  let updateCalled = false;
  let updatedPatch: unknown = null;
  const handler = createHandler({
    getUserIdFn: async () => "u-1",
    getModelFn: () => ({ instance: {}, modelId: "test-model" }),
    generateTextFn: async () => ({
      text: '{"title":"Pour update","summary":"All trucks delivered."}',
      usage: { inputTokens: 1, outputTokens: 1, cachedTokens: 0 },
    }),
    updateFileMetadataFn: async (fileId, patch) => {
      updateCalled = true;
      updatedPatch = { fileId, ...patch };
    },
    // Skip token_usage write since we don't have a Supabase service-role here.
    recordUsageFn: async () => {},
  });

  const res = await handler(
    makeRequest({
      fileId: VALID_UUID,
      transcript: "We poured concrete today and it went well.",
    }),
  );
  assertEquals(res.status, 200);
  const body = await res.json();
  assertEquals(body, {
    title: "Pour update",
    summary: "All trucks delivered.",
  });
  assert(updateCalled);
  assertEquals(updatedPatch, {
    fileId: VALID_UUID,
    voice_title: "Pour update",
    voice_summary: "All trucks delivered.",
  });
});

Deno.test("createHandler returns 502 when LLM returns invalid JSON", async () => {
  const handler = createHandler({
    getUserIdFn: async () => "u-1",
    getModelFn: () => ({ instance: {}, modelId: "test-model" }),
    generateTextFn: async () => ({
      text: "not json at all",
      usage: null,
    }),
    updateFileMetadataFn: async () => {
      throw new Error("should not write on parse error");
    },
    recordUsageFn: async () => {},
  });
  const res = await handler(
    makeRequest({ fileId: VALID_UUID, transcript: "hi" }),
  );
  assertEquals(res.status, 502);
  const body = await res.json();
  assertEquals(body.code, "LLM_PARSE_ERROR");
});

Deno.test("createHandler rejects non-POST methods", async () => {
  const handler = createHandler();
  const res = await handler(
    new Request("https://example.test/summarize-voice-note", {
      method: "GET",
    }),
  );
  assertEquals(res.status, 405);
});
