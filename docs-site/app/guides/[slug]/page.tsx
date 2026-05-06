import Link from "next/link";
import { notFound } from "next/navigation";
import { guides, guidesBySlug } from "@/content/guides";
import { PhoneFrame } from "@/components/PhoneFrame";
import { Inline } from "@/components/Inline";
import { Sidebar } from "@/components/Sidebar";

export function generateStaticParams() {
  return guides.map((g) => ({ slug: g.slug }));
}

export function generateMetadata({ params }: { params: { slug: string } }) {
  const g = guidesBySlug[params.slug];
  if (!g) return {};
  return { title: `${g.title} — Harpa Pro`, description: g.task };
}

const tierLabel = {
  1: "Core workflow",
  2: "Everyday task",
  3: "Setup",
} as const;

export default function GuidePage({ params }: { params: { slug: string } }) {
  const g = guidesBySlug[params.slug];
  if (!g) notFound();

  return (
    <div className="grid gap-10 lg:grid-cols-[220px_1fr]">
      <Sidebar activeSlug={g.slug} />

      <article className="min-w-0 space-y-8 sm:space-y-12">
        <div>
          <Link
            href="/"
            className="text-[12px] font-semibold uppercase tracking-[0.08em] text-muted-foreground hover:text-accent"
          >
            ← All guides
          </Link>
        </div>

        <header className="grid gap-6 lg:grid-cols-[1.4fr_1fr] lg:items-start lg:gap-10">
          <div className="space-y-4">
            <span className="h3-pill">{tierLabel[g.tier]}</span>
            <h1 className="text-title tracking-tight text-foreground sm:text-display">
              {g.title}
            </h1>
            <p className="max-w-prose text-body-lg text-muted-foreground sm:text-[18px]">
              {g.task}
            </p>
            <p className="max-w-prose text-[15px] leading-7 text-foreground/80">
              {g.intro}
            </p>
          </div>
          {g.screenshot ? (
            <div className="lg:justify-self-end">
              <PhoneFrame screenshot={g.screenshot} alt={g.title} />
            </div>
          ) : null}
        </header>

        <section>
          <h2 className="mb-5 text-title-sm text-foreground">Steps</h2>
          <ol className="space-y-6">
            {g.steps.map((s, i) => (
              <li key={i} id={`step-${i + 1}`} className="grid gap-5 lg:grid-cols-[1fr_auto] scroll-mt-24">
                <div className="rounded-xl border border-border bg-card p-5">
                  <div className="mb-2 flex items-center gap-3">
                    <span className="grid h-7 w-7 place-items-center rounded-full bg-accent text-[13px] font-bold text-accent-foreground">
                      {i + 1}
                    </span>
                    <h3 className="text-[16px] font-semibold text-foreground">
                      <Inline>{s.title}</Inline>
                    </h3>
                  </div>
                  <p className="text-[15px] leading-7 text-foreground/85">
                    <Inline>{s.body}</Inline>
                  </p>
                </div>
                {s.screenshot ? (
                  <div className="lg:w-[200px]">
                    <PhoneFrame
                      screenshot={s.screenshot}
                      alt={`Step ${i + 1}: ${s.title}`}
                      width={200}
                    />
                  </div>
                ) : null}
              </li>
            ))}
          </ol>
        </section>

        {g.tips && g.tips.length > 0 ? (
          <section id="tips">
            <h2 className="mb-4 text-title-sm text-foreground">Tips</h2>
            <ul className="space-y-2">
              {g.tips.map((t, i) => (
                <li
                  key={i}
                  className="flex items-start gap-3 rounded-lg border border-border bg-card p-4"
                >
                  <span
                    aria-hidden
                    className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-accent"
                  />
                  <span className="text-[15px] leading-6 text-foreground/85">
                    <Inline>{t}</Inline>
                  </span>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {g.troubleshooting && g.troubleshooting.length > 0 ? (
          <section>
            <h2 className="mb-4 text-title-sm text-foreground">
              Troubleshooting
            </h2>
            <ul className="space-y-3">
              {g.troubleshooting.map((t, i) => (
                <li
                  key={i}
                  id={`trouble-${i}`}
                  className="rounded-lg border border-border bg-card p-4 scroll-mt-24"
                >
                  <p className="text-[14px] font-semibold text-foreground">
                    <Inline>{t.problem}</Inline>
                  </p>
                  <p className="mt-1 text-[14px] leading-6 text-muted-foreground">
                    <Inline>{t.fix}</Inline>
                  </p>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {g.related && g.related.length > 0 ? (
          <section>
            <h2 className="mb-4 text-title-sm text-foreground">Related</h2>
            <ul className="grid gap-3 sm:grid-cols-2">
              {g.related.map((slug) => {
                const r = guidesBySlug[slug];
                if (!r) return null;
                return (
                  <li key={slug}>
                    <Link
                      href={`/guides/${slug}`}
                      className="group block rounded-lg border border-border bg-card p-4 hover:shadow-[0_8px_24px_-12px_rgba(26,26,46,0.25)]"
                    >
                      <span className="text-[11px] uppercase tracking-[0.08em] text-muted-foreground">
                        {tierLabel[r.tier]}
                      </span>
                      <span className="mt-1 block font-semibold text-foreground group-hover:text-accent">
                        {r.title}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </section>
        ) : null}
      </article>
    </div>
  );
}
