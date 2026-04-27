/**
 * JSON diff — minimal, readable side-by-side diff of two JSON values.
 *
 * Emits a flat list of changes for display in the conflict banner. We
 * deliberately do NOT try to produce an RFC 6902 patch — the conflict UX
 * (Phase 2 v1) is "user picks local or server", so the diff is purely
 * informational.
 *
 * Output entries describe paths into the values:
 *   { kind: 'changed', path: 'meta.title', local: 'A', server: 'B' }
 *   { kind: 'added',   path: 'sections[2]', server: {...} }
 *   { kind: 'removed', path: 'meta.summary', local: '...' }
 *
 * Arrays are diffed by index (no LCS) — fine for our shapes.
 */
export type JsonDiffEntry =
  | { kind: "changed"; path: string; local: unknown; server: unknown }
  | { kind: "added"; path: string; server: unknown }
  | { kind: "removed"; path: string; local: unknown };

export function jsonDiff(local: unknown, server: unknown): JsonDiffEntry[] {
  const out: JsonDiffEntry[] = [];
  walk(local, server, "", out);
  return out;
}

function walk(
  a: unknown,
  b: unknown,
  path: string,
  out: JsonDiffEntry[],
): void {
  if (deepEqual(a, b)) return;

  if (isObj(a) && isObj(b)) {
    const keys = new Set<string>([...Object.keys(a), ...Object.keys(b)]);
    for (const k of Array.from(keys).sort()) {
      const sub = path ? `${path}.${k}` : k;
      const has = (o: Record<string, unknown>, key: string) =>
        Object.prototype.hasOwnProperty.call(o, key);
      if (has(a, k) && has(b, k)) {
        walk(a[k], b[k], sub, out);
      } else if (has(b, k)) {
        out.push({ kind: "added", path: sub, server: b[k] });
      } else {
        out.push({ kind: "removed", path: sub, local: a[k] });
      }
    }
    return;
  }

  if (Array.isArray(a) && Array.isArray(b)) {
    const max = Math.max(a.length, b.length);
    for (let i = 0; i < max; i++) {
      const sub = `${path}[${i}]`;
      if (i < a.length && i < b.length) {
        walk(a[i], b[i], sub, out);
      } else if (i < b.length) {
        out.push({ kind: "added", path: sub, server: b[i] });
      } else {
        out.push({ kind: "removed", path: sub, local: a[i] });
      }
    }
    return;
  }

  out.push({ kind: "changed", path: path || "$", local: a, server: b });
}

function isObj(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

function deepEqual(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (typeof a !== typeof b) return false;
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    return a.every((x, i) => deepEqual(x, b[i]));
  }
  if (isObj(a) && isObj(b)) {
    const ka = Object.keys(a);
    const kb = Object.keys(b);
    if (ka.length !== kb.length) return false;
    return ka.every((k) =>
      Object.prototype.hasOwnProperty.call(b, k)
        ? deepEqual(a[k], b[k])
        : false,
    );
  }
  return false;
}
