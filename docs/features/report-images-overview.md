# Photos in Reports — Overview

> 21 Apr 2026. Companion to `report-images.md`.

## What we're building

Users take or pick photos while making a report. Photos sit on the same timeline as voice notes. When the report is generated, the AI decides which activity or issue each photo belongs to, based on the notes around it. The user can accept, change, or skip the AI's choice. Photos appear in the mobile app and in an appendix at the end of the exported report.

## Key decisions

**AI places photos using surrounding notes, not the pixels.** The image bytes are never sent to the model. Photos show up as markers in the note stream (`[PHOTO p1]`), and the AI uses conversational context to pick a target.
*Why:* reading pixels costs tokens and is often wrong. Reading context is cheap, accurate, and uses info we already have.

**Attach suggestion is one tap, never required.** User sees the AI's pick with Yes / Choose / Skip. Dismissed → defaults to the suggestion but visible. Skipped → general gallery.
*Why:* field workers are busy. Don't block them; don't guess silently either.

**Offline-first.** Photos save to the phone first, upload in the background, survive app kills.

**Thumbnails by default, full-size on tap.** Reports with 20+ photos stay fast on mobile data.

**Keep GPS and timestamp. No face blurring.** Location proof is useful; privacy tooling isn't validated yet.

**Supabase Storage now, swappable later.** An abstraction layer means moving to S3 / GCS / R2 is a small job.

**Photos go in a "Photo Documentation" appendix of the export, not inline.** Inline layout is finicky; appendix ships now.

## Cost ballpark (Apr 2026 rates)

### Image storage (Supabase Pro)

$0.021 / GB stored, $0.09 / GB egress. Pro plan includes 100 GB storage and 250 GB egress. Each photo after compression ≈ **0.5 MB** (original + thumbnail).

| Scenario | Storage added / month | Monthly cost (beyond included) |
|----------|-----------------------|--------------------------------|
| 100 users × 50 photos | 2.5 GB | ~$0.05 |
| 1 000 users × 50 photos | 25 GB | ~$0.50 |
| 10 000 users × 50 photos | 250 GB | ~$5 + egress once over 250 GB |

A year of accumulation at the 1 000-user rate ≈ ~$6/month by month 12. Not a concern until we hit real scale.

### AI cost: notes-only placement (what we're shipping)

~20 tokens per photo marker. Essentially free — a report with 10 photos adds less than $0.001.

### AI cost if we later send pixels (vision, deferred)

~1 600 input tokens per photo.

| Model | Per photo | 5 photos / report | 50 000 reports/mo × 5 |
|-------|-----------|-------------------|------------------------|
| Haiku | ~$0.0013 | ~$0.006 | ~$300 / mo |
| Sonnet | ~$0.005 | ~$0.024 | ~$1 200 / mo |

Voice-note-only reports today cost ~$0.02–$0.05 in AI calls. Adding 5 photos on Sonnet would roughly **double** that. Main reason vision stays deferred.

## Out of scope for MVP

| Feature | Why not now |
|---------|-------------|
| AI looking at photo pixels (vision) | Doubles per-report AI cost; not needed for placement. |
| Face / plate blurring | No customer has asked. |
| Inline photos in the export | Layout work is deceptively hard. |
| Photos on the web app | Web app doesn't exist yet. |
| Annotations, drawing, tagging | Not validated. |

## Main risks

- **Storage growth** from power users. We have a long runway; cap or switch providers if needed.
- **Slow uploads on bad signal.** Compression + background retries make this mostly invisible.
- **A photo could drift to the wrong activity** if the AI rearranges the report. Rare; each regeneration re-places photos, which self-heals most cases.

## Plan

Ship MVP, measure (photos per report, upload failures, storage growth, placement accuracy), then decide whether vision or inline export is worth the cost.
