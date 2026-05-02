import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { loadFixture } from "./test-fixtures";

// Test-only fixture that omits `usage` so loadFixture's `?? null`
// fallback (line 80 in test-fixtures.ts) is exercised. Without this
// case every real fixture happens to set `usage`, so the branch never
// fires under normal coverage.

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const HAPPY_DIR = path.resolve(
  __dirname,
  "..",
  "..",
  "..",
  "supabase",
  "functions",
  "generate-report",
  "fixtures",
  "happy",
);

const FIXTURE_NAME = "no-usage-fallback-test";
const inputPath = path.join(HAPPY_DIR, `${FIXTURE_NAME}.input.json`);
const parsedPath = path.join(HAPPY_DIR, `${FIXTURE_NAME}.parsed.json`);

beforeAll(async () => {
  await fs.writeFile(
    inputPath,
    JSON.stringify({ notes: ["fallback test note"] }),
    "utf8",
  );
  await fs.writeFile(
    parsedPath,
    JSON.stringify({
      // No `usage` field — exercises the `?? null` fallback in loadFixture.
      report: { report: { meta: { title: "T" } } },
      systemPrompt: "sp",
      userPrompt: "up",
    }),
    "utf8",
  );
});

afterAll(async () => {
  await Promise.all([
    fs.rm(inputPath, { force: true }),
    fs.rm(parsedPath, { force: true }),
  ]);
});

describe("loadFixture", () => {
  it("falls back to null when the parsed fixture has no `usage`", async () => {
    const fx = await loadFixture(FIXTURE_NAME);
    expect(fx.name).toBe(FIXTURE_NAME);
    expect(fx.input).toEqual({ notes: ["fallback test note"] });
    expect(fx.response.usage).toBeNull();
    expect(fx.response.report).toEqual({ meta: { title: "T" } });
    expect(fx.response.systemPrompt).toBe("sp");
    expect(fx.response.userPrompt).toBe("up");
  });
});
