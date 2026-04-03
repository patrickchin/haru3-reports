# Harpa Pro — Marketing Website Design Spec

## 1. Product Overview

**Harpa Pro** is an AI-powered mobile app for construction site reporting. Site engineers speak voice notes describing what they observe on-site, and the app generates a complete, structured daily report in under 10 seconds.

### Core user flow

```
Engineer arrives on site
    → Opens project in app
    → Taps mic, speaks observations
    → AI generates full structured report
    → Engineer reviews/edits sections
    → Saves or exports as PDF
```

### Report structure (what the AI generates)

| Section | Content |
|---------|---------|
| Meta | Title, report type, summary, visit date |
| Weather | Conditions, temperature, wind, site impact |
| Manpower | Total workers, hours, cost, role breakdown |
| Activities | Name, status [IN PROGRESS/COMPLETED/BLOCKED], summary, crew, materials, equipment |
| Issues | Title, category, severity (HIGH/MED/LOW), status, action required |
| Site Conditions | Topic + details |
| Next Steps | Numbered action items |

### Key metrics to highlight

- Report generation: **< 10 seconds**
- Input method: **100% voice-first**
- Trade coverage: **All construction trades**

---

## 2. Design System

### 2.1 Colour Palette

| Token | Hex | Usage |
|-------|-----|-------|
| background | `#f8f6f1` | Page background (warm off-white) |
| foreground | `#1a1a2e` | Primary text, headings, dark buttons |
| card | `#ffffff` | Card/container fills |
| border | `#c2bfb5` | All borders (warm grey) |
| muted | `#5c5c6e` | Secondary/body text |
| secondary | `#eae7df` | Subtle backgrounds |
| accent | `#f47316` | Brand orange — CTAs, highlights, accents |
| destructive | `#8b0000` | Error/destructive actions |
| severity-high | `#dc2626` | Issue severity HIGH |
| severity-med | `#d97706` | Issue severity MEDIUM |
| severity-low | `#6b7280` | Issue severity LOW |
| success | `#22c55e` | Active/generating status |

**Feature accent colours** (left-border only):

| Feature | Colour |
|---------|--------|
| Voice | `#f47316` (orange) |
| AI | `#3b82f6` (blue) |
| Edit | `#22c55e` (green) |
| Projects | `#8b5cf6` (purple) |
| Issues | `#ef4444` (red) |
| Secure | `#14b8a6` (teal) |

### 2.2 Typography

| Element | Font | Weight | Size | Spacing | Style |
|---------|------|--------|------|---------|-------|
| H1 | Inter | 900 | clamp(38px, 6vw, 62px) | -2px | — |
| H2 | Inter | 900 | clamp(28px, 4vw, 44px) | -1.5px | — |
| H3 | Inter | 800 | 16px | — | — |
| Body | Inter | 400-500 | 16px | — | line-height 1.65 |
| Lead | Inter | 400 | 16px | — | color: muted |
| Label | Inter | 800 | 11px | +2px | UPPERCASE |
| Chip | Inter | 800 | 10px | +1.4px | UPPERCASE |
| Button | Inter | 800 | 12px | +1.5px | UPPERCASE |
| Step number | Inter | 900 | 34px | -2px | color: border |
| Stat value | Inter | 900 | 18-20px | -0.5px | — |
| Stat label | Inter | 700 | 9-10px | +1px | UPPERCASE |

### 2.3 Shape Language

**CRITICAL: Zero border-radius everywhere.**

| Element | Spec |
|---------|------|
| Cards | `background: #fff; border: 1px solid #c2bfb5;` — no shadow, no rounding |
| Buttons | `border: 2px solid; padding: 12px 20px;` — square |
| Chips/badges | `border: 1px solid; padding: 2px 8px;` — square |
| Icon containers | Square box, 1px border (never circles) |
| Status labels | `[BRACKET NOTATION]` e.g. [IN PROGRESS], [COMPLETED] |
| Issue severity | 3px coloured left border |
| Grid cells | Share borders with adjacent cells (no gaps) |

### 2.4 Textures

| Surface | Texture |
|---------|---------|
| Hero section | Faint fractal noise grain (~4% opacity) |
| Features section | Dot grid pattern (24px spacing, border colour dots) |
| Dark sections | Stronger grain (~8% opacity) |
| Accent blocks | Diagonal stripe hatching (45°, white at 10% opacity) |

---

## 3. Page Sections

### 3.1 Sticky Navigation

```
┌─────────────────────────────────────────────────────────────┐
│  [■] HARPA PRO              FEATURES  HOW IT WORKS  [GET APP] │
└─────────────────────────────────────────────────────────────┘
```

- Height: 60px
- Brand mark: 30×30 orange square with white "H"
- "HARPA PRO": 12px, weight 800, uppercase, tracking 2px
- Links: 12px, weight 600, uppercase, tracking 1.5px, muted colour
- CTA: dark button (bg: foreground, text: background)
- Bottom: 1px border

### 3.2 Hero (100vh)

**Layout:** 2-column grid (1.1fr | 0.9fr), 36px gap

**Left column:**
```
[AI-POWERED · FIELD-READY]  ← orange-bordered chip

Site reports
written for you.            ← "written for you" has 4px orange bottom border
                            ← use clamp(38px, 6vw, 62px), weight 900

Body text describing voice → report concept

[DOWNLOAD FOR IOS]  [SEE FEATURES]
 ↑ orange bg            ↑ outline/border only

┌──────────┬──────────┬──────────┐
│  <10s    │  100%    │All trades│  ← stats bar
│Generation│Voice-first│Supported│
└──────────┴──────────┴──────────┘
  first cell has light orange tint
```

**Right column — Phone mockup:**
```
┌───────────────────────────┐
│ HARPA PRO      GENERATING │  ← orange header bar
├─────────┬────────┬────────┤
│   24    │   6    │   2    │  ← stats cells
│ WORKERS │ACTIVITI│ ISSUES │
├─────────┴────────┴────────┤
│ [SUMMARY]                 │
│ [WEATHER]                 │
│ [MANPOWER]                │
│ [ACTIVITIES]              │
│ ▌HIGH  Missing fall prot…│  ← 3px red left border
│ [NEXT STEPS]              │
└───────────────────────────┘
  subtle box shadow, NO tilt/rotation
```

### 3.3 Features (3×2 grid with shared borders)

```
┌──────────────────┬──────────────────┬──────────────────┐
│▌VOICE            │▌AI               │▌EDIT             │
│ orange left      │ blue left        │ green left       │
│ Speak, don't type│ Reports in secs  │ Refine inline    │
│ Description…     │ Description…     │ Description…     │
├──────────────────┼──────────────────┼──────────────────┤
│▌PROJECTS         │▌ISSUES           │▌SECURE           │
│ purple left      │ red left         │ teal left        │
│ Multi-site ready │ Severity tagging │ Private by design│
│ Description…     │ Description…     │ Description…     │
└──────────────────┴──────────────────┴──────────────────┘

Each cell: 4px coloured left border, 20px padding
Hover: background shifts to #fff
Section background: dot grid pattern
```

### 3.4 How It Works (dark section)

```
Background: #1a1a2e + grain texture
Text: #f8f6f1
Label: "HOW IT WORKS" in orange

┌────────────┬────────────┬────────────┬────────────┐
│ 01         │ 02         │ 03         │ 04         │
│ ===        │ ===        │ ===        │ ===        │  ← orange bar
│ OPEN A     │ SPEAK YOUR │ GENERATE   │ REVIEW AND │
│ PROJECT    │ NOTES      │ REPORT     │ SAVE       │
└────────────┴────────────┴────────────┴────────────┘

Step numbers: 34px, weight 900, colour #4d4d6a
Orange bar: 28×3px
Titles: white, 12px uppercase
Border colour: #3d3d5a
```

### 3.5 Download CTA

```
┌──────────────────────────────────────────────────┐
│                                                  │  2px dark border
│  DOWNLOAD                                  ┌────┐│
│  Ready to save hours on site?              │ H  ││  ← orange square
│  Start free and generate your first report │////││    with diagonal
│                                            └────┘│    stripe texture
│  [APP STORE]  [GOOGLE PLAY]                      │
│                                                  │
└──────────────────────────────────────────────────┘

Layout: grid 1fr auto, 36px padding
Accent: 140×140 orange with hatching + white "H"
```

### 3.6 Footer

```
Background: #1a1a2e
┌─────────────────────────────────────────────────────────────┐
│ [■] HARPA PRO      © 2026 Harpa Pro.      PRIVACY TERMS CONTACT │
└─────────────────────────────────────────────────────────────┘

All text: uppercase, 11px, tracked
Muted: rgba(248,246,241, 0.4)
Brand in white
```

---

## 4. Responsive Breakpoints

| Breakpoint | Changes |
|------------|---------|
| ≤ 980px (tablet) | Hero → single column. Features → 2-column. Steps → 2×2. Download → stacked. |
| ≤ 640px (mobile) | Everything → single column. Reduced section padding. |

---

## 5. Interaction & Hover States

| Element | Hover |
|---------|-------|
| Dark button | Background lightens to #2d2d4a |
| Orange button | Background darkens to #d96510 |
| Outline button | Inverts to dark fill + light text |
| Feature cell | Background shifts to #fff |
| Nav links | No underline, subtle opacity change |

---

## 6. What NOT To Do

- No rounded corners (border-radius: 0 everywhere)
- No emojis or icon fonts
- No gradients (except subtle textures)
- No card shadows (except the phone mockup)
- No bright large-area colour fills (orange is accent only)
- No SaaS template patterns (floating cards, hero illustrations, circular avatars)
- No decorative imagery — all visual interest comes from typography, grid structure, and colour accents
- The aesthetic is **engineering document meets product page** — brutalist, utilitarian, warm
