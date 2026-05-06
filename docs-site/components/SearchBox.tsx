"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import Fuse from "fuse.js";
import { track } from "@vercel/analytics";
import { searchRecords, type SearchRecord } from "@/lib/search-index";

const KIND_LABEL: Record<SearchRecord["kind"], string> = {
  guide: "Guide",
  intro: "Overview",
  step: "Step",
  tip: "Tip",
  trouble: "Troubleshooting",
};

function buildHref(r: SearchRecord, query: string): string {
  const base = `/guides/${r.slug}`;
  let path = base;
  if (r.kind === "step") path = `${base}#step-${r.index}`;
  else if (r.kind === "trouble") path = `${base}#trouble-${r.index}`;
  else if (r.kind === "tip") path = `${base}#tips`;
  // Append search-attribution params so the landing page can fire follow-up events.
  const sep = path.includes("#") ? path.replace("#", `?from=search&q=${encodeURIComponent(query)}#`) : `${path}?from=search&q=${encodeURIComponent(query)}`;
  return sep;
}

export type SearchBoxProps = {
  /** Render mode. 'inline' = standalone box (homepage / dedicated page).
   *  'header' = compact pop-down used in the site header. */
  variant?: "inline" | "header";
  /** Optional initial query (used by the /search page). */
  initialQuery?: string;
  /** Autofocus on mount. */
  autoFocus?: boolean;
};

export function SearchBox({
  variant = "inline",
  initialQuery = "",
  autoFocus = false,
}: SearchBoxProps) {
  const [q, setQ] = useState(initialQuery);
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const fuse = useMemo(
    () =>
      new Fuse(searchRecords, {
        keys: [
          { name: "title", weight: 3 },
          { name: "heading", weight: 2 },
          { name: "task", weight: 2 },
          { name: "text", weight: 1 },
        ],
        threshold: 0.4, // 0 = exact, 1 = anything; 0.4 = forgiving fuzz
        ignoreLocation: true,
        minMatchCharLength: 2,
        includeScore: true,
      }),
    [],
  );

  const results = useMemo(() => {
    if (q.trim().length < 2) return [];
    const seen = new Set<string>();
    const out: { record: SearchRecord; score: number }[] = [];
    for (const hit of fuse.search(q.trim()).slice(0, 50)) {
      // De-dup: prefer first (best-scoring) hit per slug+kind+index
      const key = `${hit.item.slug}|${hit.item.kind}|${hit.item.index}|${hit.item.heading ?? ""}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ record: hit.item, score: hit.score ?? 1 });
      if (out.length >= 12) break;
    }
    return out;
  }, [q, fuse]);

  // Click outside to close (header variant only)
  useEffect(() => {
    if (variant !== "header") return;
    function onClick(e: MouseEvent) {
      if (!containerRef.current) return;
      if (!containerRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [variant]);

  // Track search queries after the user pauses typing for 800ms.
  // De-dup so the same query (e.g. while toggling focus) isn't sent twice.
  const lastTrackedRef = useRef<string>("");
  useEffect(() => {
    const trimmed = q.trim();
    if (trimmed.length < 2) return;
    const handle = setTimeout(() => {
      if (lastTrackedRef.current === trimmed) return;
      lastTrackedRef.current = trimmed;
      track("docs_search", {
        query: trimmed.slice(0, 120),
        result_count: results.length,
        zero_results: results.length === 0,
        variant,
      });
    }, 800);
    return () => clearTimeout(handle);
  }, [q, results.length, variant]);

  const showResults = variant === "inline" ? q.trim().length >= 2 : open && q.trim().length >= 2;

  return (
    <div ref={containerRef} className={variant === "header" ? "relative" : ""}>
      <label className="sr-only" htmlFor="docs-search">Search the docs</label>
      <div className="relative">
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" aria-hidden>
          {/* Magnifier */}
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></svg>
        </span>
        <input
          id="docs-search"
          type="search"
          autoComplete="off"
          autoFocus={autoFocus}
          value={q}
          onChange={(e) => { setQ(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          placeholder={variant === "header" ? "Search…" : "Search guides — try “voice note” or “PDF”"}
          className={[
            "w-full rounded-full border border-border bg-card pl-9 pr-4 py-2 text-[14px] text-foreground",
            "placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-accent/40",
            variant === "header" ? "h-9" : "h-11 text-[15px]",
          ].join(" ")}
        />
      </div>

      {showResults ? (
        <div
          className={[
            "z-20 mt-2 overflow-hidden rounded-xl border border-border bg-card shadow-lg",
            variant === "header" ? "absolute right-0 left-0 sm:left-auto sm:w-[460px]" : "",
          ].join(" ")}
        >
          {results.length === 0 ? (
            <div className="px-4 py-6 text-center text-[14px] text-muted-foreground">
              No matches for <span className="text-foreground">“{q.trim()}”</span>.
              <div className="mt-1 text-[13px]">Try shorter or simpler words.</div>
            </div>
          ) : (
            <ul className="max-h-[60vh] overflow-y-auto py-1">
              {results.map(({ record }) => (
                <li key={`${record.slug}-${record.kind}-${record.index}-${record.heading ?? ""}`}>
                  <Link
                    href={buildHref(record, q.trim())}
                    onClick={() => {
                      track("docs_search_click", {
                        query: q.trim().slice(0, 120),
                        slug: record.slug,
                        kind: record.kind,
                        variant,
                      });
                      setOpen(false);
                    }}
                    className="flex flex-col gap-1 px-4 py-3 hover:bg-secondary/60"
                  >
                    <div className="flex items-center gap-2">
                      <span className="rounded-full bg-secondary px-2 py-[2px] text-[10px] font-semibold uppercase tracking-wider text-primary">
                        {KIND_LABEL[record.kind]}
                      </span>
                      <span className="text-[13px] font-semibold text-foreground">{record.title}</span>
                    </div>
                    {record.heading ? (
                      <div className="text-[13px] text-foreground">{record.heading}</div>
                    ) : null}
                    <div className="line-clamp-2 text-[13px] leading-5 text-muted-foreground">
                      {record.text}
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  );
}
