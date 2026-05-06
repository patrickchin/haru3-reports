import Link from "next/link";
import { tier1, tier2, tier3 } from "@/content/guides";
import { PhoneFrame } from "@/components/PhoneFrame";

const tierBadges: Record<number, string> = {
  1: "Core workflow",
  2: "Everyday task",
  3: "Setup",
};

export function Sidebar({ activeSlug }: { activeSlug?: string }) {
  return (
    <aside className="hidden lg:block lg:sticky lg:top-8 lg:self-start">
      <nav className="space-y-7 text-[14px]">
        <SidebarGroup
          label="Core workflows"
          hint="The three things the app exists to do."
          items={tier1}
          activeSlug={activeSlug}
          tone="accent"
        />
        <SidebarGroup
          label="Everyday tasks"
          items={tier2}
          activeSlug={activeSlug}
        />
        <SidebarGroup
          label="Setup & account"
          items={tier3}
          activeSlug={activeSlug}
          muted
        />
      </nav>
    </aside>
  );
}

function SidebarGroup({
  label,
  hint,
  items,
  activeSlug,
  tone,
  muted,
}: {
  label: string;
  hint?: string;
  items: { slug: string; title: string }[];
  activeSlug?: string;
  tone?: "accent";
  muted?: boolean;
}) {
  return (
    <div>
      <div className="mb-2 flex items-baseline justify-between">
        <span
          className={`text-[11px] font-semibold uppercase tracking-[0.1em] ${
            tone === "accent" ? "text-accent" : "text-muted-foreground"
          }`}
        >
          {label}
        </span>
      </div>
      {hint ? (
        <p className="mb-3 text-[12px] leading-5 text-muted-foreground">
          {hint}
        </p>
      ) : null}
      <ul className="space-y-1">
        {items.map((g) => {
          const active = g.slug === activeSlug;
          return (
            <li key={g.slug}>
              <Link
                href={`/guides/${g.slug}`}
                className={[
                  "block rounded-md px-3 py-2 transition-colors",
                  active
                    ? "bg-secondary font-semibold text-primary"
                    : "text-foreground hover:bg-secondary/60",
                  muted && !active ? "text-muted-foreground" : "",
                ].join(" ")}
              >
                {g.title}
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export { tierBadges };
