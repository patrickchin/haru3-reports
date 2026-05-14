"use client";

/**
 * Fires Vercel Analytics events to measure search-result quality:
 *   - guide_landed_from_search   on arrival (only when ?from=search)
 *   - guide_engaged_from_search  one-shot, when user stays >=15s OR scrolls >=25%
 *   - guide_bounced_from_search  on pagehide if not engaged
 *
 * The ?from=search&q=… params are stripped from the URL after we read them so
 * that copy/paste of the URL doesn't leak the query and doesn't double-count
 * if the user reloads.
 */

import { useEffect, useRef } from "react";
import { track } from "@vercel/analytics";

type Props = { slug: string; kind: "guide" | "reference" };

const ENGAGE_MS = 15_000;
const ENGAGE_SCROLL_PCT = 25;

export function SearchLandingTracker({ slug, kind }: Props) {
  const firedRef = useRef(false);

  useEffect(() => {
    if (firedRef.current) return;
    firedRef.current = true;

    if (typeof window === "undefined") return;
    const url = new URL(window.location.href);
    const from = url.searchParams.get("from");
    if (from !== "search") return;
    const query = (url.searchParams.get("q") ?? "").slice(0, 120);

    // Fire landing event.
    track("guide_landed_from_search", { slug, kind, query });

    // Strip params so reload / share doesn't re-fire or leak.
    url.searchParams.delete("from");
    url.searchParams.delete("q");
    const cleaned = url.pathname + (url.searchParams.toString() ? `?${url.searchParams}` : "") + url.hash;
    window.history.replaceState(null, "", cleaned);

    const startedAt = performance.now();
    let maxScrollPct = 0;
    let engaged = false;

    function computeScrollPct(): number {
      const doc = document.documentElement;
      const scrollTop = window.scrollY || doc.scrollTop || 0;
      const viewport = window.innerHeight || doc.clientHeight || 0;
      const fullHeight = Math.max(doc.scrollHeight, doc.offsetHeight, doc.clientHeight);
      const scrollable = Math.max(fullHeight - viewport, 1);
      return Math.min(100, Math.round(((scrollTop + viewport) / fullHeight) * 100)) || Math.round((scrollTop / scrollable) * 100);
    }

    function markEngaged(reason: "time" | "scroll") {
      if (engaged) return;
      engaged = true;
      track("guide_engaged_from_search", {
        slug,
        kind,
        query,
        reason,
        time_on_page_ms: Math.round(performance.now() - startedAt),
        max_scroll_pct: maxScrollPct,
      });
    }

    function onScroll() {
      const pct = computeScrollPct();
      if (pct > maxScrollPct) maxScrollPct = pct;
      if (!engaged && maxScrollPct >= ENGAGE_SCROLL_PCT) markEngaged("scroll");
    }

    const timer = window.setTimeout(() => markEngaged("time"), ENGAGE_MS);
    window.addEventListener("scroll", onScroll, { passive: true });

    function onPageHide() {
      if (engaged) return;
      track("guide_bounced_from_search", {
        slug,
        kind,
        query,
        time_on_page_ms: Math.round(performance.now() - startedAt),
        max_scroll_pct: maxScrollPct,
      });
    }
    // pagehide is more reliable than beforeunload, especially on mobile (bfcache, tab switch).
    window.addEventListener("pagehide", onPageHide);

    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("pagehide", onPageHide);
    };
  }, [slug, kind]);

  return null;
}
