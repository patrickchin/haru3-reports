# Harpa Pro — Feature documentation site

Public documentation site that lists every feature of the Harpa Pro
mobile app, with screenshots and per-feature deep-link pages.

- **Stack:** Next.js (App Router) + Tailwind CSS + TypeScript
- **Style:** Mirrors the mobile app's design tokens — warm-paper background
  (`#f8f6f1`), softened navy chrome (`#2d3a5a`), a single saturated orange
  accent (`#ea580c`) reserved for hero CTAs.
- **Content:** `content/guides.ts` is the source of truth for the guide
  list; each entry generates an index card on `/` and a detail page at
  `/guides/<slug>`.
- **Screenshots:** Captured by Maestro from the iOS simulator and dropped
  into `public/screenshots/`. If a screenshot is missing the layout shows
  a clearly-labeled placeholder so it's obvious what still needs capturing.

## Local dev

From the repo root:

```bash
pnpm install
pnpm --filter docs dev   # http://localhost:3000
# or, equivalently:
pnpm dev:docs
```

## Build / deploy (Vercel)

```bash
pnpm --filter docs build
```

The site is fully static — no API routes, no env vars required.

## Updating screenshots

Maestro flow at `apps/mobile/.maestro/docs-site-screenshots.yaml` walks
the app and drops PNGs into `apps/docs/public/screenshots/<NN>-<slug>.png`.
Run it from the repo root with the mock-voice release build installed:

```bash
cd apps/mobile
# Override SHOTS to point at your local apps/docs/public/screenshots
maestro test \
  -e SHOTS="$PWD/../docs/public/screenshots" \
  .maestro/docs-site-screenshots.yaml
```

Filenames are referenced from `content/guides.ts > screenshot` (top-level
and per-step).
