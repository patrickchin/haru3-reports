import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "Haru 3 Reports — Features",
  description:
    "Field reports for construction sites. Capture notes, photos, and voice; generate structured reports with AI; sync offline.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <div className="mx-auto flex min-h-screen max-w-5xl flex-col px-5 py-8 sm:px-8 sm:py-10">
          <header className="mb-10 flex items-center justify-between border-b border-border pb-6">
            <Link href="/" className="flex items-center gap-3">
              <span className="grid h-9 w-9 place-items-center rounded-lg bg-primary text-[15px] font-bold text-primary-foreground">
                H3
              </span>
              <span className="flex flex-col leading-tight">
                <span className="text-[15px] font-bold text-foreground">
                  Haru 3 Reports
                </span>
                <span className="text-[12px] uppercase tracking-[0.08em] text-muted-foreground">
                  Field-report mobile app
                </span>
              </span>
            </Link>
            <nav className="flex items-center gap-5 text-[14px] font-semibold text-foreground">
              <Link className="hover:text-accent" href="/">
                Features
              </Link>
              <a
                className="hover:text-accent"
                href="https://github.com/patrickchin/haru3-reports"
                target="_blank"
                rel="noreferrer"
              >
                GitHub
              </a>
            </nav>
          </header>

          <main className="flex-1">{children}</main>

          <footer className="mt-16 border-t border-border pt-6 text-[12px] uppercase tracking-[0.08em] text-muted-foreground">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <span>Haru 3 Reports · Documentation site</span>
              <span>Built with Next.js · Deployed on Vercel</span>
            </div>
          </footer>
        </div>
      </body>
    </html>
  );
}
