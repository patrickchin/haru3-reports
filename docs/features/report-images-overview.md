# Photos in Reports — Overview

> Written 21 Apr 2026.
> Companion to the technical plan in `report-images.md`.

## What we're building

Users take or pick photos while making a report. Photos attach to an activity (or go in a general gallery) and appear at the end of the exported report.

## Key decisions

**Photos live alongside the report, not inside the AI step.** The AI handles voice notes only. Photos are stored separately and placed by the user.
*Why:* sending photos to the AI costs tokens and often places them wrong. Users are faster and more accurate.

**One-tap attach suggestion, never required.** After capture, the app asks *"Attach to 'Foundation Excavation'?"* with Yes / Choose / Skip. Ignored → goes to a general gallery.
*Why:* field workers are busy. Don't block them.

**Offline-first.** Photos save to the phone first, upload in the background, survive app kills.
*Why:* construction sites have bad signal.

**Thumbnails everywhere, full-size only on tap.**
*Why:* reports with 20+ photos would be painful on mobile data otherwise.

**Keep GPS and timestamp. No face blurring.**
*Why:* location proof is useful. Privacy tooling adds complexity no customer has asked for.

**Supabase Storage now, swappable later.** Code is written so moving to AWS / GCP / Cloudflare is a small job.
*Why:* fastest to ship; not locked in.

**Photos go in a "Photo Documentation" appendix of the exported report, not inline.**
*Why:* inline layout is finicky. Appendix is clean and ships now.

## Cost ballpark

### Image storage (Supabase Pro plan, Apr 2026 rates)

- $0.021 / GB / month stored
- $0.09 / GB downloaded (egress)
- Pro plan includes 100 GB storage and 250 GB egress
- After compression each photo is ~400 KB original + ~40 KB thumbnail ≈ **~0.5 MB total**

| Scenario | Photos added / month | Storage added / month | Cost impact (after included tier) |
|----------|----------------------|------------------------|------------------------------------|
| 10 users × 20 photos | 200 | 0.1 GB | ~$0 |
| 100 users × 50 photos | 5 000 | 2.5 GB | ~$0.05 |
| 1 000 users × 50 photos | 50 000 | 25 GB | ~$0.50 |
| 10 000 users × 50 photos | 500 000 | 250 GB | ~$5 storage + ~$20 / mo in egress once over the included 250 GB |

Storage accumulates: a full year of the 1 000-user scenario is ~300 GB stored ≈ **~$6 / month by month 12**. Not a concern until we hit thousands of active users or extreme per-user upload volumes.

### If we later send photos to the AI

Rough rule: one compressed photo ≈ **1 600 input tokens**.

| Model | Input price (Apr 2026) | Cost per photo | 5 photos / report | 50 000 reports / month × 5 photos |
|-------|------------------------|----------------|-------------------|------------------------------------|
| Claude Haiku | ~$0.80 / M tokens | ~$0.0013 | ~$0.006 | ~$300 |
| Claude Sonnet | ~$3 / M tokens | ~$0.005 | ~$0.024 | ~$1 200 |

For context, a voice-note-only report today costs roughly $0.02–$0.05 in LLM calls. Adding 5 photos on Sonnet would roughly **double** the per-report AI cost. On Haiku the uplift is small.

This is the main reason vision is deferred: it's an ongoing per-report cost, while manual placement is free.

## Out of scope for MVP

| Feature | Why not now |
|---------|-------------|
| AI looking at photos to place / caption them | Doubles per-report AI cost; placement unreliable. |
| Blurring faces or plates | No customer has asked. |
| Inline photos in the exported report | Layout work is deceptively hard. |
| Photos on the web app | Web app doesn't exist yet. |
| Annotations, drawing, tagging | Not validated as needed. |

## Main risks

- **Storage growth** from a power user uploading hundreds of photos per report. Numbers above show a long runway; we can cap or switch providers if needed.
- **Slow uploads on bad signal**. Compression + background retries make this mostly invisible.
- **A photo linked to "Activity 3" could drift** if the AI rearranges the report. Rare; easy to fix later.

## Plan

Ship the MVP, watch real usage (photos per report, failed uploads, storage growth), then decide if vision-AI or inline rendering is worth the cost.
