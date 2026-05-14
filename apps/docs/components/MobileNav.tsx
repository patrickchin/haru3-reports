import Link from "next/link";
import { tier1, tier2, tier3 } from "@/content/guides";

export function MobileNav() {
  return (
    <details className="group mb-6 lg:hidden">
      <summary className="flex cursor-pointer list-none items-center justify-between rounded-md border border-border bg-secondary/40 px-4 py-3 text-[14px] font-semibold text-foreground hover:bg-secondary/60">
        <span className="flex items-center gap-2">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-5 w-5"
            aria-hidden
          >
            <line x1="3" y1="6" x2="21" y2="6" />
            <line x1="3" y1="12" x2="21" y2="12" />
            <line x1="3" y1="18" x2="21" y2="18" />
          </svg>
          Browse guides
        </span>
        <span className="text-[12px] uppercase tracking-[0.08em] text-muted-foreground transition-transform group-open:rotate-180">
          ▾
        </span>
      </summary>
      <nav className="mt-3 space-y-5 rounded-md border border-border bg-background p-4 text-[14px]">
        <MobileGroup
          label="Core workflows"
          items={tier1}
          tone="accent"
        />
        <MobileGroup label="Everyday tasks" items={tier2} />
        <MobileGroup label="Setup & account" items={tier3} muted />
      </nav>
    </details>
  );
}

function MobileGroup({
  label,
  items,
  tone,
  muted,
}: {
  label: string;
  items: { slug: string; title: string }[];
  tone?: "accent";
  muted?: boolean;
}) {
  return (
    <div>
      <div
        className={`mb-2 text-[11px] font-semibold uppercase tracking-[0.1em] ${
          tone === "accent" ? "text-accent" : "text-muted-foreground"
        }`}
      >
        {label}
      </div>
      <ul className="space-y-1">
        {items.map((g) => (
          <li key={g.slug}>
            <Link
              href={`/guides/${g.slug}`}
              className={`block rounded-md px-3 py-2 text-foreground hover:bg-secondary/60 ${
                muted ? "text-muted-foreground" : ""
              }`}
            >
              {g.title}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
