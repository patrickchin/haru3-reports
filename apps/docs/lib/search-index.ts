import { guides, type Guide } from "@/content/guides";

/**
 * A flat, searchable record. Each guide explodes into multiple records
 * so a hit on a step or troubleshooting line surfaces directly, not just
 * the parent guide title.
 */
export type SearchRecord = {
  slug: string;
  title: string;
  task: string;
  /** What kind of section this match came from. */
  kind: "guide" | "step" | "tip" | "trouble" | "intro";
  /** The actual text the user matched against. */
  text: string;
  /** Optional sub-heading (e.g. step heading or troubleshooting issue). */
  heading?: string;
  /** A 0-based index for stable de-duplication / linking. */
  index: number;
};

function stripMarkdown(s: string): string {
  return s
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/\[(.+?)\]\([^)]+\)/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\n+/g, " ")
    .trim();
}

function expand(g: Guide): SearchRecord[] {
  const out: SearchRecord[] = [];
  out.push({
    slug: g.slug,
    title: g.title,
    task: g.task,
    kind: "guide",
    text: `${g.title} ${g.task}`,
    index: 0,
  });
  out.push({
    slug: g.slug,
    title: g.title,
    task: g.task,
    kind: "intro",
    text: stripMarkdown(g.intro),
    index: 0,
  });
  g.steps.forEach((s, i) => {
    out.push({
      slug: g.slug,
      title: g.title,
      task: g.task,
      kind: "step",
      heading: s.title,
      text: `${s.title} ${stripMarkdown(s.body)}`,
      index: i + 1,
    });
  });
  (g.tips ?? []).forEach((t, i) => {
    out.push({
      slug: g.slug,
      title: g.title,
      task: g.task,
      kind: "tip",
      text: stripMarkdown(t),
      index: i,
    });
  });
  (g.troubleshooting ?? []).forEach((t, i) => {
    out.push({
      slug: g.slug,
      title: g.title,
      task: g.task,
      kind: "trouble",
      heading: t.problem,
      text: `${t.problem} ${stripMarkdown(t.fix)}`,
      index: i,
    });
  });
  return out;
}

export const searchRecords: SearchRecord[] = guides.flatMap(expand);
