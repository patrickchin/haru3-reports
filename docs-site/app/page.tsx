import Link from "next/link";
import { tier1, tier2, tier3 } from "@/content/guides";
import { PhoneFrame } from "@/components/PhoneFrame";

export default function HomePage() {
  return (
    <div className="space-y-16">
      {/* Hero */}
      <section className="grid gap-10 lg:grid-cols-[1.4fr_1fr] lg:items-center">
        <div className="space-y-5">
          <span className="h3-pill">User guide · iOS · Android</span>
          <h1 className="text-display tracking-tight text-foreground">
            What do you want to do?
          </h1>
          <p className="max-w-prose text-body-lg text-muted-foreground sm:text-[18px]">
            Step-by-step instructions for Haru 3 Reports. Pick a task — every
            page tells you exactly which buttons to tap and what to expect.
          </p>
          <div className="flex flex-wrap items-center gap-3 pt-2">
            <Link href="/guides/generate-ai-report" className="h3-accent-cta">
              Generate an AI report →
            </Link>
            <Link
              className="text-[14px] font-semibold text-foreground hover:text-accent"
              href="/guides/getting-started"
            >
              First time? Start here →
            </Link>
          </div>
        </div>
        <div className="lg:justify-self-end">
          <PhoneFrame screenshot="01-login.png" alt="Haru 3 Reports login" />
        </div>
      </section>

      {/* Tier 1 — Core workflows, hero treatment */}
      <section>
        <div className="mb-5 flex items-baseline justify-between">
          <h2 className="text-title text-foreground">Core workflows</h2>
          <span className="text-[12px] uppercase tracking-[0.08em] text-muted-foreground">
            The three things the app exists to do
          </span>
        </div>
        <ul className="grid gap-5 lg:grid-cols-3">
          {tier1.map((g, i) => (
            <li key={g.slug}>
              <Link
                href={`/guides/${g.slug}`}
                className="group flex h-full flex-col rounded-2xl border border-border bg-card p-6 transition-shadow hover:shadow-[0_12px_32px_-12px_rgba(26,26,46,0.3)]"
              >
                <span className="mb-4 inline-flex h-7 w-7 items-center justify-center rounded-full bg-accent text-[13px] font-bold text-accent-foreground">
                  {i + 1}
                </span>
                <h3 className="text-title-sm text-foreground group-hover:text-accent">
                  {g.title}
                </h3>
                <p className="mt-3 text-[15px] leading-6 text-muted-foreground">
                  {g.task}
                </p>
                <span className="mt-5 text-[13px] font-semibold text-accent">
                  Read the steps →
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      {/* Tier 2 — Everyday tasks */}
      <section>
        <h2 className="mb-5 text-title text-foreground">Everyday tasks</h2>
        <ul className="grid gap-3 sm:grid-cols-2">
          {tier2.map((g) => (
            <li key={g.slug}>
              <Link
                href={`/guides/${g.slug}`}
                className="group block rounded-xl border border-border bg-card p-5 transition-shadow hover:shadow-[0_8px_24px_-12px_rgba(26,26,46,0.25)]"
              >
                <h3 className="text-title-sm text-foreground group-hover:text-accent">
                  {g.title}
                </h3>
                <p className="mt-2 text-[14px] leading-6 text-muted-foreground">
                  {g.task}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      {/* Tier 3 — Setup, de-emphasised */}
      <section>
        <h2 className="mb-3 text-title-sm text-muted-foreground">
          Setup & account
        </h2>
        <ul className="flex flex-wrap gap-2">
          {tier3.map((g) => (
            <li key={g.slug}>
              <Link
                href={`/guides/${g.slug}`}
                className="inline-flex items-center gap-2 rounded-full border border-border bg-secondary px-4 py-2 text-[13px] font-semibold text-primary hover:text-accent"
              >
                {g.title} →
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
