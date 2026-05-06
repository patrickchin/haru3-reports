import type { Metadata } from "next";
import Link from "next/link";
import { MobileNav } from "@/components/MobileNav";
import "./globals.css";

export const metadata: Metadata = {
  title: "Haru 3 Reports — User Guide",
  description:
    "How-to documentation for Haru 3 Reports: generate AI site reports, share PDFs, and work offline.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <div className="mx-auto flex min-h-screen max-w-6xl flex-col px-4 py-5 sm:px-8 sm:py-10">
          <header className="mb-6 flex items-center justify-between gap-3 border-b border-border pb-4 sm:mb-10 sm:pb-6">
            <Link href="/" className="flex items-center gap-3">
              <span className="grid h-9 w-9 place-items-center rounded-lg bg-primary text-[15px] font-bold text-primary-foreground">
                H3
              </span>
              <span className="flex flex-col leading-tight">
                <span className="text-[15px] font-bold text-foreground">
                  Haru 3 Reports
                </span>
                <span className="text-[12px] uppercase tracking-[0.08em] text-muted-foreground">
                  User guide
                </span>
              </span>
            </Link>
            <nav className="flex items-center gap-4 text-[14px] font-semibold text-foreground sm:gap-5">
              <Link className="hover:text-accent" href="/">
                Home
              </Link>
              <Link
                className="hidden hover:text-accent sm:inline"
                href="/guides/generate-ai-report"
              >
                Generate a report
              </Link>
              <Link
                className="hidden hover:text-accent sm:inline"
                href="/guides/getting-started"
              >
                Getting started
              </Link>
            </nav>
          </header>

          <main className="flex-1">
            <MobileNav />
            {children}
          </main>

          <footer className="mt-16 border-t border-border pt-6 text-[12px] uppercase tracking-[0.08em] text-muted-foreground">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <span>Haru 3 Reports · User guide</span>
              <span>Built with Next.js · Deployed on Vercel</span>
            </div>
          </footer>
        </div>
      </body>
    </html>
  );
}
