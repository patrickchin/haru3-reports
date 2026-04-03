# Harpa Pro — Marketing Website Prompt

Use this prompt with any AI design/code tool (v0, Bolt, Lovable, Claude Artifacts, Cursor, etc.) to generate a marketing landing page for Harpa Pro.

---

## Prompt

```
Build a single-page marketing website for "Harpa Pro", an AI-powered mobile app for construction site reporting.

WHAT THE APP DOES:
- Construction site engineers speak voice notes on-site describing what they see (progress, issues, weather, workers, materials, etc.)
- The app uses AI to transform those raw voice notes into a complete, structured daily site report in under 10 seconds
- Reports include: summary, weather, manpower breakdown (workers, roles, costs), work activities with status, issues with severity classification, materials, equipment, site conditions, and next steps
- Engineers can review and edit any section inline before saving
- Supports multiple projects (active, delayed, completed) from one app
- Available on iOS (and soon Android)

TARGET AUDIENCE:
- Site engineers, project managers, and construction supervisors
- People who currently write reports manually or use spreadsheets/Word
- Construction companies wanting to digitise field reporting

KEY SELLING POINTS:
- Voice-first: speak don't type
- AI-structured: reports generated in <10 seconds
- Complete coverage: weather, manpower, activities, issues, next steps — nothing missed
- Editable: review and refine before saving
- Multi-project: manage all sites in one place
- Secure: data encrypted, never used to train AI

DESIGN SYSTEM (must match the mobile app):
Use these exact values — the website should feel like the same product as the mobile app.

Colors:
- Background: #f8f6f1 (warm off-white, like aged paper)
- Foreground/text: #1a1a2e (near-black navy)
- Card: #ffffff
- Border: #c2bfb5 (warm grey)
- Muted text: #5c5c6e
- Secondary background: #eae7df
- Accent/brand: #f47316 (orange — used sparingly for CTAs, highlights, and accents)
- Destructive/error: #8b0000 (dark red)
- Issue severity: HIGH=#dc2626, MEDIUM=#d97706, LOW=#6b7280
- Success/active: #22c55e (green — used for status indicators)

Typography:
- Font: Inter (Google Fonts), falling back to system sans-serif
- Headings: weight 800-900, tight letter-spacing (-2px for h1, -1.5px for h2)
- Body: weight 400-500, 16px
- Labels/chips: weight 700-800, 10-12px, UPPERCASE, letter-spacing 1.5-2px
- No italic. No decorative fonts.

Shape language — CRITICAL:
- ZERO border radius everywhere. All elements are sharp rectangles.
- Cards: white background, 1px solid #c2bfb5 border, no shadow, no rounding
- Buttons: square, 2px solid border, uppercase text, no rounding
- Chips/badges: square, 1px border, uppercase tracking
- Status labels use [BRACKET] notation like [IN PROGRESS], [COMPLETED]
- Issue items have a 3px coloured left border indicating severity
- Icon containers are square boxes with 1px border (not circles)
- This is a brutalist/utilitarian aesthetic — think engineering, not SaaS

Spacing and layout:
- Use CSS grid with shared borders (cells sharing a border, not cards with gaps)
- Sections separated by 1px border lines, not whitespace alone
- Feature grids: 3-column with internal borders (like a table/spreadsheet)
- Steps: 4-column row, shared borders
- Stats: inline row of cells sharing borders

SECTIONS TO INCLUDE:

1. STICKY NAV
   - Left: square orange brand mark + "HARPA PRO" uppercase tracked text
   - Right: section links (FEATURES, HOW IT WORKS) + "GET THE APP" dark button
   - 1px bottom border

2. HERO (full viewport height)
   - Left column:
     - Orange-bordered chip: "AI-POWERED · FIELD-READY"
     - Large headline: "Site reports" / "written for you." (second line has orange underline)
     - Subtitle paragraph explaining the voice-to-report concept
     - CTA buttons: primary orange "DOWNLOAD FOR IOS" + outline "SEE FEATURES"
     - Stats bar: three cells sharing borders showing "<10s / Generation", "100% / Voice-first", "All trades / Supported"
   - Right column:
     - A mock phone UI showing a report being generated
     - Phone has: dark or orange header bar with "HARPA PRO" + "GENERATING" status
     - Stats grid: 3 cells (24 Workers / 6 Activities / 2 Issues)
     - Stack of report section labels: [SUMMARY], [WEATHER], [MANPOWER], [ACTIVITIES], [ISSUES], [NEXT STEPS]
     - One issue row with red left border and "HIGH" severity badge

3. FEATURES (3×2 grid)
   - Each cell has: a coloured left border accent (different colour per feature), an uppercase chip label, a bold title, and a description paragraph
   - Features:
     a. VOICE — Speak, don't type
     b. AI — Reports in seconds
     c. EDIT — Refine inline
     d. PROJECTS — Multi-site ready
     e. ISSUES — Severity tagging
     f. SECURE — Private by design
   - Use these left-border colours: orange, blue (#3b82f6), green (#22c55e), purple (#8b5cf6), red (#ef4444), teal (#14b8a6)

4. HOW IT WORKS (dark section, inverted colours)
   - Background: #1a1a2e with subtle grain/noise texture
   - 4 step cells in a row with shared borders
   - Each: large faded step number (01-04), orange accent bar, uppercase title
   - Steps: Open a project → Speak your notes → Generate report → Review and save

5. REPORT PREVIEW (optional but recommended)
   - Show a realistic mock of a generated report card on white background
   - Include: title "Block A — Foundation Works", date, "On Track" status badge
   - Summary text paragraph
   - Rows: weather, manpower (28 workers · ~224 hrs · $8,400), issues (1 Safety · 1 Quality), next steps
   - Use [BRACKET] notation for row labels
   - Include 1-2 issue cards with severity left-borders and action items

6. DOWNLOAD CTA
   - Card with 2px dark border
   - Left: headline "Ready to save hours on site?", subtitle, two buttons (App Store + Google Play)
   - Right: large orange accent square with diagonal stripe texture and "H" letter mark

7. FOOTER
   - Dark background (#1a1a2e)
   - Orange square brand mark + "HARPA PRO"
   - Copyright notice
   - Links: Privacy, Terms, Contact
   - All text uppercase, tracked, small

TEXTURE (subtle, not heavy):
- Hero section: faint paper/noise grain overlay
- Features section: subtle dot grid pattern
- Dark sections: slightly stronger grain
- Accent blocks: diagonal stripe hatching

DO NOT:
- Use rounded corners anywhere
- Use emojis or icon fonts
- Use gradients (except for subtle textures)
- Use drop shadows on cards
- Make it look like a typical SaaS template
- Use bright/saturated colours for large areas — keep it muted with orange as the only pop

RESPONSIVE:
- Desktop: full grid layouts as described
- Tablet (≤980px): features become 2-column, steps become 2×2, hero becomes single column
- Mobile (≤640px): everything stacks to single column

The result should feel like a technical blueprint or engineering document that happens to be for a modern product — clean, sharp, structured, utilitarian, with just enough orange warmth to feel approachable.
```
