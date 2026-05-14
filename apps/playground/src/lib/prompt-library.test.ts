import { beforeEach, describe, expect, it } from "vitest";
import {
  DEFAULT_PROMPT_ID,
  type KeyValueStore,
  create,
  duplicate,
  exportAll,
  get,
  getActive,
  importAll,
  list,
  load,
  remove,
  seedDefault,
  setActive,
  setStorageForTests,
  update,
} from "./prompt-library";

function makeMemoryStore(): KeyValueStore {
  const map = new Map<string, string>();
  return {
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => void map.set(k, v),
    removeItem: (k) => void map.delete(k),
  };
}

const SAMPLE_DEFAULT = "You are a system prompt. " + "x".repeat(80);

beforeEach(() => {
  setStorageForTests(makeMemoryStore());
});

describe("seedDefault", () => {
  it("creates the read-only default entry on a fresh store", () => {
    const lib = seedDefault(SAMPLE_DEFAULT);
    expect(lib.items).toHaveLength(1);
    expect(lib.items[0]?.id).toBe(DEFAULT_PROMPT_ID);
    expect(lib.items[0]?.readOnly).toBe(true);
    expect(lib.activeId).toBe(DEFAULT_PROMPT_ID);
  });

  it("replaces an existing default but preserves user prompts", () => {
    seedDefault("v1 default ".repeat(10));
    create({ name: "Mine", systemPrompt: "x".repeat(60) });
    seedDefault("v2 default ".repeat(10));
    const items = list();
    expect(items.find((p) => p.id === DEFAULT_PROMPT_ID)?.systemPrompt).toContain("v2");
    expect(items.find((p) => p.name === "Mine")).toBeDefined();
  });

  it("falls back to default if active points at a removed entry", () => {
    seedDefault(SAMPLE_DEFAULT);
    const m = create({ name: "x", systemPrompt: "y".repeat(60) });
    setActive(m.id);
    // simulate corrupt state by removing the user entry then re-seeding
    remove(m.id);
    seedDefault(SAMPLE_DEFAULT);
    expect(load().activeId).toBe(DEFAULT_PROMPT_ID);
  });
});

describe("CRUD", () => {
  beforeEach(() => seedDefault(SAMPLE_DEFAULT));

  it("creates and activates a new prompt", () => {
    const p = create({ name: "Strict", systemPrompt: "p".repeat(60) });
    expect(getActive()?.id).toBe(p.id);
    expect(list()).toHaveLength(2);
  });

  it("trims empty names", () => {
    const p = create({ name: "   ", systemPrompt: "p".repeat(60) });
    expect(p.name).toBe("Untitled prompt");
  });

  it("updates name and systemPrompt", () => {
    const p = create({ name: "A", systemPrompt: "x".repeat(60) });
    const updated = update(p.id, { name: "B", systemPrompt: "y".repeat(60) });
    expect(updated.name).toBe("B");
    expect(updated.systemPrompt).toBe("y".repeat(60));
    expect(updated.id).toBe(p.id);
  });

  it("refuses to update the read-only default", () => {
    expect(() => update(DEFAULT_PROMPT_ID, { name: "Hacked" })).toThrow(
      /read-only/i,
    );
  });

  it("refuses to remove the read-only default", () => {
    expect(() => remove(DEFAULT_PROMPT_ID)).toThrow(/read-only/i);
  });

  it("removing an active prompt resets active to default", () => {
    const p = create({ name: "tmp", systemPrompt: "z".repeat(60) });
    setActive(p.id);
    remove(p.id);
    expect(load().activeId).toBe(DEFAULT_PROMPT_ID);
  });

  it("setActive throws on unknown id", () => {
    expect(() => setActive("nope")).toThrow(/unknown prompt id/i);
  });

  it("duplicate forks a new entry with copy suffix", () => {
    const p = create({ name: "Mine", systemPrompt: "p".repeat(60) });
    const dup = duplicate(p.id);
    expect(dup.id).not.toBe(p.id);
    expect(dup.name).toBe("Mine (copy)");
    expect(dup.basedOn).toBe(p.id);
    expect(dup.systemPrompt).toBe(p.systemPrompt);
  });

  it("get returns null for unknown ids", () => {
    expect(get("nope")).toBeNull();
  });
});

describe("export / import roundtrip", () => {
  it("excludes the default entry, restores user entries on import", () => {
    seedDefault(SAMPLE_DEFAULT);
    create({ name: "A", systemPrompt: "a".repeat(60) });
    create({ name: "B", systemPrompt: "b".repeat(60) });

    const exported = exportAll();
    expect(exported.version).toBe(1);
    expect(exported.prompts).toHaveLength(2);
    expect(exported.prompts.every((p) => p.name !== "Default (production)")).toBe(true);

    // Wipe and re-seed
    setStorageForTests(makeMemoryStore());
    seedDefault(SAMPLE_DEFAULT);
    const result = importAll(exported);
    expect(result.imported).toBe(2);
    const names = list().map((p) => p.name).sort();
    expect(names).toEqual(["A", "B", "Default (production)"]);
  });

  it("rejects malformed payloads", () => {
    expect(() => importAll(null)).toThrow(/invalid export/i);
    expect(() => importAll({ version: 999 })).toThrow(/invalid export/i);
  });

  it("silently drops malformed prompt entries during import", () => {
    seedDefault(SAMPLE_DEFAULT);
    const payload = {
      version: 1,
      exportedAt: new Date().toISOString(),
      prompts: [
        { name: "Good", systemPrompt: "x".repeat(60) },
        { name: "Bad" }, // missing systemPrompt — must be dropped
        { systemPrompt: "no name" }, // missing name — must be dropped
      ],
    };
    const result = importAll(payload);
    expect(result.imported).toBe(1);
  });
});

describe("storage persistence", () => {
  it("survives a fresh load() call within the same store", () => {
    seedDefault(SAMPLE_DEFAULT);
    const p = create({ name: "persist me", systemPrompt: "x".repeat(60) });
    expect(load().items.find((i) => i.id === p.id)).toBeDefined();
  });
});
