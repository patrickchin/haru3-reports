# Harpa Pro — Feature documentation site

Public documentation site that lists every feature of the Harpa Pro
mobile app, with screenshots and per-feature deep-link pages.

- **Stack:** Next.js (App Router) + Tailwind CSS + TypeScript
- **Style:** Mirrors the mobile app's design tokens — warm-paper background
  (`#f8f6f1`), softened navy chrome (`#2d3a5a`), a single saturated orange
  accent (`#ea580c`) reserved for hero CTAs.
- **Content:** `content/features.ts` is the source of truth for the feature
  list; each entry generates an index card on `/` and a detail page at
  `/features/<slug>`.
- **Screenshots:** Captured by Maestro from the iOS simulator and dropped
  into `public/screenshots/`. If a screenshot is missing the layout shows
  a clearly-labeled placeholder so it's obvious what still needs capturing.

## Local dev

```bash
cd docs-site
npm install
npm run dev   # http://localhost:3000
```

## Deploy (Vercel)

```bash
cd docs-site
vercel              # link
vercel --prod       # deploy
```

The site is fully static — no API routes, no env vars required.

## Updating screenshots

Maestro flow at `apps/mobile/.maestro/docs-site-screenshots.yaml` walks
the app and drops PNGs into `docs-site/public/screenshots/<NN>-<slug>.png`.
Run it from the repo root with the mock-voice release build installed:

```bash
cd apps/mobile
maestro test .maestro/docs-site-screenshots.yaml
```

Filenames are referenced from `content/features.ts > screenshot`.
