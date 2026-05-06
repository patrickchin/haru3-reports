import type { Metadata } from "next";
import { SearchBox } from "@/components/SearchBox";

export const metadata: Metadata = {
  title: "Search — Harpa Pro user guide",
  description: "Search the Harpa Pro user guide for tasks, buttons, and troubleshooting.",
};

export default function SearchPage() {
  return (
    <div className="mx-auto max-w-2xl space-y-6 py-4 sm:py-10">
      <div className="space-y-2">
        <span className="h3-pill">Search</span>
        <h1 className="text-title tracking-tight text-foreground sm:text-display">
          What are you trying to do?
        </h1>
        <p className="text-body-lg text-muted-foreground">
          Search every guide, step, and troubleshooting note. Fuzzy matching is
          on, so close-enough spellings still work.
        </p>
      </div>
      <SearchBox variant="inline" autoFocus />
      <p className="text-[13px] text-muted-foreground">
        Try: <span className="text-foreground">voice note</span>,{" "}
        <span className="text-foreground">share PDF</span>,{" "}
        <span className="text-foreground">delete project</span>,{" "}
        <span className="text-foreground">sign in</span>.
      </p>
    </div>
  );
}
