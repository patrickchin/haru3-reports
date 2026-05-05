/**
 * Tests for the generate-report orchestration. Uses an injected
 * `generateTextFn` to avoid real LLM calls.
 */
import { beforeEach, describe, expect, it } from "vitest";
import {
  LLMParseError,
  extractJson,
  formatNotes,
  generateReport,
  isValidNotes,
  parseLLMReport,
  SYSTEM_PROMPT,
} from "./generate-report.js";

const VALID_REPORT_JSON = JSON.stringify({
  report: {
    meta: {
      title: "Test Report",
      reportType: "site_visit",
      summary: "Test summary",
      visitDate: null,
    },
    weather: null,
    workers: null,
    materials: [],
    issues: [],
    nextSteps: [],
    sections: [],
  },
});

beforeEach(() => {
  process.env["AI_PROVIDER"] = "kimi";
  process.env["MOONSHOT_API_KEY"] = "test-key";
});

describe("isValidNotes", () => {
  it("accepts non-empty string arrays", () => {
    expect(isValidNotes(["a"])).toBe(true);
    expect(isValidNotes(["a", "b"])).toBe(true);
  });
  it("rejects everything else", () => {
    expect(isValidNotes([])).toBe(false);
    expect(isValidNotes(null)).toBe(false);
    expect(isValidNotes("a")).toBe(false);
    expect(isValidNotes([1, 2])).toBe(false);
    expect(isValidNotes(["a", 1])).toBe(false);
  });
});

describe("formatNotes", () => {
  it("numbers notes 1-indexed", () => {
    expect(formatNotes(["one", "two"])).toBe("[1] one\n[2] two");
  });
  it("respects startIndex", () => {
    expect(formatNotes(["x"], 4)).toBe("[5] x");
  });
});

describe("extractJson", () => {
  it("returns plain JSON unchanged", () => {
    expect(extractJson('{"a":1}')).toBe('{"a":1}');
  });
  it("strips ```json fences", () => {
    expect(extractJson('```json\n{"a":1}\n```')).toBe('{"a":1}');
  });
  it("strips bare ``` fences", () => {
    expect(extractJson('```\n{"a":1}\n```')).toBe('{"a":1}');
  });
});

describe("parseLLMReport", () => {
  it("normalises a valid report", () => {
    const report = parseLLMReport(VALID_REPORT_JSON);
    expect(report.report.meta.title).toBe("Test Report");
  });
  it("throws LLMParseError on invalid JSON", () => {
    expect(() => parseLLMReport("not json")).toThrow(LLMParseError);
  });
  it("throws LLMParseError on shape mismatch", () => {
    expect(() => parseLLMReport('{"oops":true}')).toThrow(LLMParseError);
  });
});

describe("generateReport", () => {
  it("calls generateTextFn with system + user prompt", async () => {
    let captured: { system?: string; prompt?: string } = {};
    const result = await generateReport(["note 1", "note 2"], {
      provider: "kimi",
      generateTextFn: async ({ system, prompt }) => {
        captured = { system, prompt };
        return {
          text: VALID_REPORT_JSON,
          usage: { inputTokens: 10, outputTokens: 5, cachedTokens: 0 },
        };
      },
      // override getModelFn so we don't need real env keys for this test
      getModelFn: () => ({ instance: {}, modelId: "kimi-k2-0711-preview" }),
    });
    expect(captured.system).toBe(SYSTEM_PROMPT);
    expect(captured.prompt).toContain("[1] note 1");
    expect(captured.prompt).toContain("[2] note 2");
    expect(result.provider).toBe("kimi");
    expect(result.model).toBe("kimi-k2-0711-preview");
    expect(result.usage).toEqual({
      inputTokens: 10,
      outputTokens: 5,
      cachedTokens: 0,
    });
    expect(result.report.report.meta.title).toBe("Test Report");
  });

  it("uses systemPromptOverride when provided", async () => {
    let capturedSystem: string | undefined;
    await generateReport(["x"], {
      provider: "kimi",
      systemPromptOverride: "OVERRIDE",
      generateTextFn: async ({ system }) => {
        capturedSystem = system;
        return { text: VALID_REPORT_JSON };
      },
      getModelFn: () => ({ instance: {}, modelId: "m" }),
    });
    expect(capturedSystem).toBe("OVERRIDE");
  });

  it("rejects empty notes", async () => {
    await expect(generateReport([])).rejects.toThrow(/non-empty/);
  });

  it("rejects unknown provider", async () => {
    await expect(
      generateReport(["x"], { provider: "bogus" }),
    ).rejects.toThrow(/Unknown provider/);
  });

  it("propagates LLMParseError from bad JSON", async () => {
    await expect(
      generateReport(["x"], {
        provider: "kimi",
        generateTextFn: async () => ({ text: "not json" }),
        getModelFn: () => ({ instance: {}, modelId: "m" }),
      }),
    ).rejects.toThrow(LLMParseError);
  });

  it("invokes recordUsageFn when usageContext.userId set", async () => {
    const recorded: unknown[] = [];
    await generateReport(["x"], {
      provider: "kimi",
      generateTextFn: async () => ({
        text: VALID_REPORT_JSON,
        usage: { inputTokens: 1, outputTokens: 2, cachedTokens: 0 },
      }),
      getModelFn: () => ({ instance: {}, modelId: "m" }),
      usageContext: { userId: "user-1", projectId: "proj-1" },
      recordUsageFn: async (params) => {
        recorded.push(params);
      },
    });
    expect(recorded).toHaveLength(1);
  });
});
