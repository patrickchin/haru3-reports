import jsonpatch from "npm:fast-json-patch@3";
import type { Operation } from "npm:fast-json-patch@3";
import type { GeneratedSiteReport } from "./report-schema.ts";

export type { Operation };

const SELECTOR_RE = /\[(\w+)=([^\]]+)\]/;

/**
 * Resolve extended path selectors to numeric array indices.
 * "/report/activities[name=Concrete Pour]/status"
 *   → "/report/activities/0/status"
 */
export function resolvePath(path: string, doc: unknown): string {
  let resolved = path;
  let match: RegExpMatchArray | null;

  while ((match = resolved.match(SELECTOR_RE)) !== null) {
    const [fullMatch, field, value] = match;
    const matchIndex = match.index!;

    const arrayPath = resolved.substring(0, matchIndex);
    const segments = arrayPath.split("/").filter(Boolean);

    let current: unknown = doc;
    for (const seg of segments) {
      if (Array.isArray(current)) {
        current = current[parseInt(seg, 10)];
      } else if (current && typeof current === "object") {
        current = (current as Record<string, unknown>)[seg];
      } else {
        break;
      }
    }

    if (!Array.isArray(current)) {
      throw new Error(`Path "${arrayPath}" does not point to an array`);
    }

    const idx = current.findIndex(
      (item: unknown) =>
        typeof item === "object" &&
        item !== null &&
        String((item as Record<string, unknown>)[field]).toLowerCase() ===
          value.toLowerCase(),
    );

    if (idx === -1) {
      throw new Error(
        `No item with ${field}="${value}" found at ${arrayPath}`,
      );
    }

    resolved =
      resolved.substring(0, matchIndex) +
      "/" +
      idx +
      resolved.substring(matchIndex + fullMatch.length);
  }

  return resolved;
}

/**
 * Walk a resolved JSON Pointer and replace any `null` intermediates with
 * empty objects (or arrays when the next segment is numeric / "-").
 * Returns true if the leaf target already exists (so `replace` is valid),
 * false if the leaf doesn't exist (caller should use `add` instead).
 */
function ensureIntermediatePaths(
  doc: Record<string, unknown>,
  path: string,
): boolean {
  const segments = path.split("/").filter(Boolean);

  let current: unknown = doc;

  for (let i = 0; i < segments.length - 1; i++) {
    const seg = segments[i];
    const key = Array.isArray(current) ? parseInt(seg, 10) : seg;
    const child = (current as Record<string, unknown>)[key as string];

    if (child === null || child === undefined) {
      const nextSeg = segments[i + 1];
      const newValue = /^\d+$/.test(nextSeg) || nextSeg === "-" ? [] : {};
      (current as Record<string, unknown>)[key as string] = newValue;
      current = newValue;
    } else {
      current = child;
    }
  }

  // Check whether the leaf key already exists on the final parent.
  if (segments.length > 0 && current && typeof current === "object" && !Array.isArray(current)) {
    const leafSeg = segments[segments.length - 1];
    return leafSeg in (current as Record<string, unknown>);
  }

  return true;
}

export function applyReportPatch(
  existing: GeneratedSiteReport,
  ops: Operation[],
): GeneratedSiteReport {
  const doc = structuredClone(existing);

  for (const op of ops) {
    let resolved: Operation = {
      ...op,
      path: resolvePath(op.path, doc),
    } as Operation;
    if ("from" in op && typeof op.from === "string") {
      (resolved as Operation & { from: string }).from = resolvePath(
        op.from,
        doc,
      );
    }
    if (resolved.op === "add" || resolved.op === "replace") {
      const leafExists = ensureIntermediatePaths(
        doc as unknown as Record<string, unknown>,
        resolved.path,
      );
      if (resolved.op === "replace" && !leafExists) {
        resolved = { ...resolved, op: "add" } as Operation;
      }
    }
    jsonpatch.applyPatch(doc, [resolved], true, true, true);
  }

  return doc;
}
