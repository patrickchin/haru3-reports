import Link from "next/link";
import { features } from "@/content/features";
import { PhoneFrame } from "@/components/PhoneFrame";

export default function HomePage() {
  return (
    <div className="space-y-14">
      {/* Hero */}
      <section className="grid gap-10 lg:grid-cols-[1.4fr_1fr] lg:items-center">
        <div className="space-y-5">
          <span className="h3-pill">Mobile · iOS · Android</span>
          <h1 className="text-display tracking-tight text-foreground">
            Construction site reports,
            <br />
            captured in the field.
          </h1>
          <p className="max-w-prose text-body-lg text-muted-foreground sm:text-[18px]">
            Haru 3 Reports lets site teams capture notes, photos, and voice
            memos during the day, then folds them into a structured daily
            report with AI. Everything works offline; edits sync the moment
            you reconnect.
          </p>
          <div className="flex flex-wrap items-center gap-3 pt-2">
            <Link href={`/features/${features[0].slug}`} className="h3-accent-cta">
              Browse features →
            </Link>
            <a
              className="text-[14px] font-semibold text-foreground hover:text-accent"
              href="https://github.com/patrickchin/haru3-reports"
              target="_blank"
              rel="noreferrer"
            >
              View source on GitHub
            </a>
          </div>
        </div>
        <div className="lg:justify-self-end">
          <PhoneFrame screenshot={features[2].screenshot} alt="Projects list" />
        </div>
      </section>

      {/* Feature index */}
      <section>
        <div className="mb-6 flex items-baseline justify-between">
          <h2 className="text-title text-foreground">All features</h2>
          <span className="text-[12px] uppercase tracking-[0.08em] text-muted-foreground">
            {features.length} screens · {features.length} pages
          </span>
        </div>
        <ul className="grid gap-4 sm:grid-cols-2">
          {features.map((f, i) => (
            <li key={f.slug}>
              <Link
                href={`/features/${f.slug}`}
                className="group block h-full rounded-xl border border-border bg-card p-5 transition-shadow hover:shadow-[0_8px_24px_-12px_rgba(26,26,46,0.25)]"
              >
                <div className="mb-2 flex items-center gap-2 text-[12px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                  <span className="grid h-6 min-w-6 place-items-center rounded-full border border-border bg-secondary px-1.5 text-[11px] text-primary">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  Feature
                </div>
                <h3 className="text-title-sm text-foreground group-hover:text-accent">
                  {f.title}
                </h3>
                <p className="mt-2 text-[15px] leading-6 text-muted-foreground">
                  {f.blurb}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
