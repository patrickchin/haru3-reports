# Photos in Reports — Plain-English Overview

> Written 21 Apr 2026.
> Companion to the technical plan in `report-images.md`.

## What we're building

Field users can take photos or pick them from their phone while putting together a report, just like they already add voice notes. The photos show up next to the right activity in the app, and appear at the end of the exported report.

## The decisions we made, and why

### 1. Photos are a separate thing from the AI-generated report

The AI turns voice notes into structured sections (activities, issues, weather, etc.). We're keeping photos completely out of that process for now.

**Why:** sending photos to the AI is expensive and unreliable — it might guess the wrong place to put them. Letting the user decide is faster, cheaper, and more accurate. We can always revisit this later.

### 2. We ask the user where a photo belongs, but never force them

After a user takes a photo, the app asks: *"Attach this to 'Foundation Excavation'?"* with options **Yes / Choose / Skip**.

- If they say yes, the photo appears under that activity.
- If they skip or ignore it, the photo still gets saved — it just goes into a general gallery at the bottom of the report.

**Why:** field workers are busy. A one-tap question is fine; a required decision would slow them down and make them drop photos.

### 3. Photos work offline

Photos are saved to the phone first, then uploaded in the background when there's signal. If the app is closed mid-upload, the photo isn't lost — it resumes next time.

**Why:** most construction sites have bad connectivity. The app can't assume it's online.

### 4. Thumbnails to save bandwidth

When viewing a report we show small previews (thumbnails). The full-size image only loads when the user taps to zoom in.

**Why:** reports with 20+ photos would be painful to load on mobile data otherwise.

### 5. We keep GPS but do NO privacy processing yet

Photos keep their GPS location (useful to prove which site a photo was taken on) and timestamp. We're **not** blurring faces or license plates — that's a future feature if customers ask.

**Why:** construction reporting benefits from location proof. Privacy tooling adds complexity we don't need for the MVP.

### 6. We're using Supabase Storage for now, but designed for easy switching

Photos live on Supabase (our current backend). But we're building the photo-upload code so that swapping to AWS, Google Cloud, or Cloudflare later is a small job, not a rewrite.

**Why:** Supabase is fastest to ship with. We're not locked in if pricing, storage limits, or performance push us to move.

### 7. Photos appear at the end of the exported report, not inline

In the HTML/PDF export, photos are grouped into a "Photo Documentation" appendix at the end, not scattered through the text.

**Why:** inline layout is finicky and can wreck report structure. An appendix is clean, predictable, and still easy for the reader to cross-reference. We can add inline placement later if it's worth the effort.

### 8. What the user can do with a photo

- Add a caption ("this is the crack on the west wall")
- Edit or delete the caption later
- Delete the photo
- View any photo full-screen with swipe

No editing, annotating, drawing, or tagging in MVP — those can come later if real users ask.

## What we're deliberately *not* doing in the MVP

| Feature | Why not now |
|---------|-------------|
| AI looking at photos to place them automatically | Expensive, unreliable — revisit after we see how the manual flow works. |
| AI-written captions | Depends on AI looking at photos. |
| Blurring faces or sensitive info | No customer has asked; adds real complexity. |
| Inline photos in the exported report | Layout work is deceptively hard; appendix is good enough to ship. |
| Photos on the web app | Web app doesn't exist yet. |
| Unlimited retention / archive tiers | We don't yet know the typical volume. Decide once we have data. |

## Main risks, in plain terms

- **Storage cost could grow fast** if a user uploads hundreds of photos per report. We're watching this; we can enforce limits or switch providers without rewriting the app.
- **Slow uploads on bad signal** could frustrate users. We compress photos on the phone and keep retrying in the background, so it should mostly be invisible.
- **A photo linked to "Activity 3" could end up under the wrong activity** if the AI later rearranges the report. Rare in practice, easy to fix later with a small refactor.

## How long-term questions get answered

Once the MVP is live, we'll use real usage data to decide:

- How many photos per report people actually take.
- Whether users want AI help placing them.
- Whether to invest in inline layout for the exported report.
- Whether we need a bigger/cheaper storage solution.

Ship first, measure, then invest where it matters.
