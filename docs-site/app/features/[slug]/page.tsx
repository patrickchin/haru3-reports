import Link from "next/link";
import { notFound } from "next/navigation";
import { features } from "@/content/features";
import { PhoneFrame } from "@/components/PhoneFrame";

export function generateStaticParams() {
  return features.map((f) => ({ slug: f.slug }));
}

export function generateMetadata({ params }: { params: { slug: string } }) {
  const f = features.find((x) => x.slug === params.slug);
  if (!f) return {};
  return { title: `${f.title} — Haru 3 Reports`, description: f.blurb };
}

export default function FeaturePage({ params }: { params: { slug: string } }) {
  const idx = features.findIndex((x) => x.slug === params.slug);
  if (idx === -1) notFound();
  const f = features[idx];
  const prev = idx > 0 ? features[idx - 1] : null;
  const next = idx < features.length - 1 ? features[idx + 1] : null;

  return (
    <article className="space-y-12">
      <div>
        <Link
          href="/"
          className="text-[12px] font-semibold uppercase tracking-[0.08em] text-muted-foreground hover:text-accent"
        >
          ← All features
        </Link>
      </div>

      <header className="grid gap-10 lg:grid-cols-[1.4fr_1fr] lg:items-start">
        <div className="space-y-4">
          <span className="h3-pill">
            Feature {String(idx + 1).padStart(2, "0")} / {features.length}
          </span>
          <h1 className="text-title tracking-tight text-foreground sm:text-display">
            {f.title}
          </h1>
          <p className="max-w-prose text-body-lg text-muted-foreground sm:text-[18px]">
            {f.blurb}
          </p>
          <div className="pt-2 text-[12px] uppercase tracking-[0.08em] text-muted-foreground">
            Source · <span className="font-mono normal-case tracking-normal">{f.source}</span>
          </div>
        </div>
        <div className="lg:justify-self-end">
          <PhoneFrame screenshot={f.screenshot} alt={f.title} />
        </div>
      </header>

      <section>
        <h2 className="mb-4 text-title-sm text-foreground">Highlights</h2>
        <ul className="grid gap-3 sm:grid-cols-2">
          {f.highlights.map((h) => (
            <li
              key={h}
              className="flex items-start gap-3 rounded-lg border border-border bg-card p-4"
            >
              <span
                aria-hidden
                className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-accent"
              />
              <span className="text-[15px] leading-6 text-foreground">{h}</span>
            </li>
          ))}
        </ul>
      </section>

      <nav className="flex items-stretch justify-between gap-4 border-t border-border pt-6 text-[14px]">
        {prev ? (
          <Link
            href={`/features/${prev.slug}`}
            className="group flex max-w-[45%] flex-col rounded-lg border border-border bg-card p-4 hover:shadow-[0_8px_24px_-12px_rgba(26,26,46,0.25)]"
          >
            <span className="text-[11px] uppercase tracking-[0.08em] text-muted-foreground">
              ← Previous
            </span>
            <span className="mt-1 font-semibold text-foreground group-hover:text-accent">
              {prev.title}
            </span>
          </Link>
        ) : (
          <span />
        )}
        {next ? (
          <Link
            href={`/features/${next.slug}`}
            className="group flex max-w-[45%] flex-col items-end rounded-lg border border-border bg-card p-4 text-right hover:shadow-[0_8px_24px_-12px_rgba(26,26,46,0.25)]"
          >
            <span className="text-[11px] uppercase tracking-[0.08em] text-muted-foreground">
              Next →
            </span>
            <span className="mt-1 font-semibold text-foreground group-hover:text-accent">
              {next.title}
            </span>
          </Link>
        ) : (
          <span />
        )}
      </nav>
    </article>
  );
}
