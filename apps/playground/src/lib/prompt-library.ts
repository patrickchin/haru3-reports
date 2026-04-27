/**
 * Local prompt library — saved system-prompt versions, persisted in localStorage.
 *
 * The library always contains a synthetic "Default (production)" entry whose
 * `systemPrompt` is the value returned by the playground edge function's
 * `defaultSystemPrompt` field. That entry is read-only and cannot be edited
 * or deleted; it is rebuilt on every `seedDefault()` call so the latest
 * production prompt is reflected after redeploys.
 *
 * Everything else (user-saved versions) round-trips through localStorage
 * unchanged. Active selection is also persisted so the next page load
 * restores the user's working prompt.
 */
const STORAGE_KEY = "playground.prompts.v1";
export const DEFAULT_PROMPT_ID = "__default__";

export interface PromptVersion {
  id: string;
  name: string;
  systemPrompt: string;
  createdAt: string;
  updatedAt: string;
  /** Source the user forked from. `"default"` or another `PromptVersion.id`. */
  basedOn?: string;
  /** Default entry is server-sourced and not editable. */
  readOnly?: boolean;
}

export interface PromptLibrary {
  activeId: string;
  items: PromptVersion[];
}

function nowIso(): string {
  return new Date().toISOString();
}

function uid(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
}

function emptyLibrary(): PromptLibrary {
  return { activeId: DEFAULT_PROMPT_ID, items: [] };
}

function safeParse(raw: string | null): PromptLibrary {
  if (!raw) return emptyLibrary();
  try {
    const parsed = JSON.parse(raw);
    if (
      parsed &&
      typeof parsed === "object" &&
      typeof parsed.activeId === "string" &&
      Array.isArray(parsed.items)
    ) {
      return parsed as PromptLibrary;
    }
  } catch {
    // fall through
  }
  return emptyLibrary();
}

// ---------------------------------------------------------------------------
// Storage adapter — abstracted so tests can supply a Map.
// ---------------------------------------------------------------------------

export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem?(key: string): void;
}

let store: KeyValueStore = (() => {
  if (typeof globalThis !== "undefined" && (globalThis as { localStorage?: KeyValueStore }).localStorage) {
    return (globalThis as unknown as { localStorage: KeyValueStore }).localStorage;
  }
  // Fallback in-memory shim for non-browser environments (SSR, tests).
  const map = new Map<string, string>();
  return {
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => void map.set(k, v),
    removeItem: (k) => void map.delete(k),
  };
})();

export function setStorageForTests(s: KeyValueStore): void {
  store = s;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function load(): PromptLibrary {
  return safeParse(store.getItem(STORAGE_KEY));
}

function save(lib: PromptLibrary): PromptLibrary {
  store.setItem(STORAGE_KEY, JSON.stringify(lib));
  return lib;
}

/**
 * Materialise the synthetic default entry from the server-supplied prompt.
 * Idempotent: replaces an existing default entry, leaves user entries alone.
 */
export function seedDefault(defaultSystemPrompt: string): PromptLibrary {
  const lib = load();
  const without = lib.items.filter((p) => p.id !== DEFAULT_PROMPT_ID);
  const defaultEntry: PromptVersion = {
    id: DEFAULT_PROMPT_ID,
    name: "Default (production)",
    systemPrompt: defaultSystemPrompt,
    createdAt: nowIso(),
    updatedAt: nowIso(),
    readOnly: true,
  };
  const next: PromptLibrary = {
    activeId: lib.activeId || DEFAULT_PROMPT_ID,
    items: [defaultEntry, ...without],
  };
  // Sanity: if active points at a removed entry, fall back to default.
  if (!next.items.some((p) => p.id === next.activeId)) {
    next.activeId = DEFAULT_PROMPT_ID;
  }
  return save(next);
}

export function list(): PromptVersion[] {
  return load().items;
}

export function get(id: string): PromptVersion | null {
  return load().items.find((p) => p.id === id) ?? null;
}

export function getActive(): PromptVersion | null {
  const lib = load();
  return lib.items.find((p) => p.id === lib.activeId) ?? null;
}

export function setActive(id: string): PromptLibrary {
  const lib = load();
  if (!lib.items.some((p) => p.id === id)) {
    throw new Error(`Unknown prompt id: ${id}`);
  }
  return save({ ...lib, activeId: id });
}

export interface CreateInput {
  name: string;
  systemPrompt: string;
  basedOn?: string;
}

export function create(input: CreateInput): PromptVersion {
  const lib = load();
  const entry: PromptVersion = {
    id: uid(),
    name: input.name.trim() || "Untitled prompt",
    systemPrompt: input.systemPrompt,
    createdAt: nowIso(),
    updatedAt: nowIso(),
    basedOn: input.basedOn,
  };
  save({ activeId: entry.id, items: [...lib.items, entry] });
  return entry;
}

export function duplicate(id: string, newName?: string): PromptVersion {
  const src = get(id);
  if (!src) throw new Error(`Unknown prompt id: ${id}`);
  return create({
    name: newName ?? `${src.name} (copy)`,
    systemPrompt: src.systemPrompt,
    basedOn: src.id,
  });
}

export interface UpdateInput {
  name?: string;
  systemPrompt?: string;
}

export function update(id: string, patch: UpdateInput): PromptVersion {
  const lib = load();
  const idx = lib.items.findIndex((p) => p.id === id);
  if (idx === -1) throw new Error(`Unknown prompt id: ${id}`);
  const current = lib.items[idx];
  if (!current) throw new Error(`Unknown prompt id: ${id}`);
  if (current.readOnly) {
    throw new Error("Cannot modify the read-only default prompt");
  }
  const next: PromptVersion = {
    ...current,
    ...(patch.name !== undefined ? { name: patch.name.trim() || "Untitled prompt" } : {}),
    ...(patch.systemPrompt !== undefined ? { systemPrompt: patch.systemPrompt } : {}),
    updatedAt: nowIso(),
  };
  const items = [...lib.items];
  items[idx] = next;
  save({ ...lib, items });
  return next;
}

export function remove(id: string): PromptLibrary {
  const lib = load();
  const target = lib.items.find((p) => p.id === id);
  if (!target) return lib;
  if (target.readOnly) {
    throw new Error("Cannot remove the read-only default prompt");
  }
  const items = lib.items.filter((p) => p.id !== id);
  const activeId = lib.activeId === id ? DEFAULT_PROMPT_ID : lib.activeId;
  return save({ activeId, items });
}

export interface ExportShape {
  version: 1;
  exportedAt: string;
  prompts: Array<Pick<PromptVersion, "name" | "systemPrompt" | "basedOn" | "createdAt" | "updatedAt">>;
}

/**
 * Serialise everything except the read-only default. Importable on another
 * machine without colliding with that machine's default entry.
 */
export function exportAll(): ExportShape {
  const lib = load();
  return {
    version: 1,
    exportedAt: nowIso(),
    prompts: lib.items
      .filter((p) => !p.readOnly)
      .map(({ name, systemPrompt, basedOn, createdAt, updatedAt }) => ({
        name,
        systemPrompt,
        basedOn,
        createdAt,
        updatedAt,
      })),
  };
}

export interface ImportResult {
  imported: number;
}

export function importAll(payload: unknown): ImportResult {
  if (
    !payload ||
    typeof payload !== "object" ||
    (payload as ExportShape).version !== 1 ||
    !Array.isArray((payload as ExportShape).prompts)
  ) {
    throw new Error("Invalid export file");
  }
  const lib = load();
  const incoming = ((payload as ExportShape).prompts ?? [])
    .filter(
      (p): p is ExportShape["prompts"][number] =>
        typeof p?.name === "string" && typeof p?.systemPrompt === "string",
    )
    .map<PromptVersion>((p) => ({
      id: uid(),
      name: p.name,
      systemPrompt: p.systemPrompt,
      basedOn: p.basedOn,
      createdAt: p.createdAt ?? nowIso(),
      updatedAt: p.updatedAt ?? nowIso(),
    }));
  save({ ...lib, items: [...lib.items, ...incoming] });
  return { imported: incoming.length };
}
