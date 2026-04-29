# Local-First Offline Mode + Deferred Report Generation

> Status: Phases 0–5 implemented behind `EXPO_PUBLIC_LOCAL_FIRST` flag; Maestro E2E, generation worker mount, and voice-note machine integration are follow-up.
> Owner: mobile.
> Related: [01-architecture.md](../01-architecture.md), [04-report-schema.md](../04-report-schema.md), [05-report-generation-analysis.md](../05-report-generation-analysis.md), [09-testing.md](../09-testing.md).

## 1. Goals & Non-Goals

**Goals**
- Every read/write screen works with zero connectivity: projects, reports CRUD, voice-note capture, draft editing, PDF export of already-generated reports.
- Report generation (LLM call) is **deferred** when offline; runs on reconnect per user preference (manual / auto / Wi-Fi-only).
- No data loss across crashes, force-quits, OS-killed background tasks, or auth-token expiry.
- Sync is convergent and RLS-safe; the server remains the source of truth.

**Non-Goals (v1)**
- Real-time multi-user collaborative editing (no CRDT). Conflicts resolved as user-picks-local-or-server with a JSON diff.
- On-device LLM inference (generation still calls the edge function).
- Offline first-time login (phone OTP requires connectivity; sessions persist after).
- On-device speech-to-text. Transcription stays server-side; voice notes that record offline queue their transcription jobs and run on reconnect.
- Background generation. Generation runs only while the app is foreground (or briefly transitioning).

## 2. Locked Decisions

| Decision | Choice |
|---|---|
| Local store | `expo-sqlite` |
| Server merge for `report_data` | Whole-replace via RPC with `base_version` optimistic concurrency |
| `notes text[]` → `notes jsonb` migration | Yes, in Phase 3 |
| RPC vs PostgREST `If-Match` | RPC (`apply_<entity>_mutation`) |
| Default generation mode | Auto on Wi-Fi only |
| Conflict UX (v1) | User picks "Keep mine" or "Use server"; show JSON diff |
| On-device STT | No |
| Background generation | No |
| Encryption-at-rest | Deferred to v2 |

## 3. Architecture

```
┌──────────────── Mobile (Expo) ────────────────┐
│  UI (Expo Router screens)                     │
│   │                                           │
│   ▼                                           │
│  TanStack Query  (reads from local DB only)   │
│   │                                           │
│   ▼                                           │
│  Repository layer (projects/reports/notes)    │
│   │                                           │
│   ▼                                           │
│  Local store: SQLite (expo-sqlite)            │
│   + outbox table  + audio files on            │
│   expo-file-system                            │
│   │                                           │
│   ▼                                           │
│  Sync Engine ──► NetInfo ──► Supabase REST    │
│   │                          + Edge Functions │
│   ▼                                           │
│  Generation Queue (deferred LLM jobs)         │
└───────────────────────────────────────────────┘
```

Three independent concerns:

1. **Local DB** — canonical local mirror; UI never blocks on network.
2. **Sync engine** — pushes pending mutations + pulls server changes.
3. **Generation queue** — separate from sync; jobs depend on synced notes.

## 4. Local Database (SQLite)

Per-user database file: `harpa-local-${userId}.db`. On logout the handle is closed and the file deleted.

### 4.1 Common sync columns (every mirrored table)

- `server_updated_at TEXT` — last value seen from server (basis for optimistic concurrency).
- `local_updated_at TEXT` — bumped on every local write.
- `sync_state TEXT NOT NULL` — `'synced' | 'dirty' | 'conflict'`.
- `deleted_at TEXT` — mirror of server soft-delete.

### 4.2 Mirrored tables

- `projects` — same as server (`id`, `owner_id`, `name`, `address`, `client_name`, `status`, `created_at`, `updated_at`) + sync columns.
- `reports` — same + `notes_json TEXT` (Phase 3: jsonb on server), `report_data_json TEXT`, `generation_state TEXT`, `generation_error TEXT`, sync columns.
- `project_members` — composite PK `(project_id, user_id)` + sync columns.
- `file_metadata` — same as server + sync columns + `local_audio_path`, `transcription_state`, `upload_state`.

### 4.3 Local-only tables

- `outbox(id, entity, entity_id, op, payload_json, base_version, attempts, next_attempt_at, last_error, client_op_id UUID UNIQUE, created_at)`.
- `generation_jobs(id, report_id, mode, last_processed_note_count, state, attempts, next_attempt_at, error, created_at, completed_at)`.
- `sync_meta(table_name PK, last_pulled_at, user_id)`.
- `sync_events(id, ts, level, kind, message, data_json)` — ring buffer (cap 1000).

### 4.4 Indexes

- `reports(project_id, visit_date DESC)`, `reports(sync_state)`.
- `outbox(next_attempt_at, attempts)`.
- `generation_jobs(state, next_attempt_at)`.
- `file_metadata(report_id, transcription_state)`.

### 4.5 Migrations

A small in-house migration runner: ordered list of `{ version, sql }`, current version stored in `PRAGMA user_version`, applied in a single transaction. No codegen, no Drizzle/Prisma. Migrations live in `apps/mobile/lib/local-db/migrations/`.

## 5. Repository Layer

Pure TS, no React, no Expo imports. Mirrors the DI pattern in [`apps/mobile/lib/file-upload.ts`](../../apps/mobile/lib/file-upload.ts).

Every mutation is a single SQLite transaction that:

1. Applies the change to the mirrored row; bumps `local_updated_at`; sets `sync_state='dirty'`.
2. Upserts an `outbox` row keyed by `(entity, entity_id, op)` with the latest payload and a fresh `client_op_id`.
   - Coalescing: consecutive `update`s on the same row are merged (latest wins) unless the previous one is in flight.
3. Appends a `sync_events` row.

If any step throws, the transaction rolls back. **No optimistic UI without a durable outbox row.**

UI reads come from SQLite via TanStack Query. Query keys map 1:1 to repo functions: `['projects', userId]`, `['report', reportId]`, etc.

## 6. Sync Engine

### 6.1 Push (outbox drain)

```
loop while online:
  rows = SELECT * FROM outbox
         WHERE next_attempt_at <= now()
         ORDER BY entity, entity_id, created_at
         LIMIT 32
  group by (entity, entity_id)             # serialise per row
  for each group, in parallel up to N=4:
    for op in group (oldest first):
      result = supabase.rpc(`apply_${entity}_mutation`, payload)
      switch result.status:
        'applied'   → DELETE outbox row;
                      UPDATE local row server_updated_at=result.server_version,
                      sync_state='synced'
        'duplicate' → same as applied
        'conflict'  → DELETE outbox row;
                      stash result.row in report_data._serverSnapshot;
                      sync_state='conflict'; raise UI event
        'forbidden' → DELETE outbox row; surface error toast
        network err → bump attempts; backoff; break out of group
```

Backoff: `min(30 * 2^attempts, 30*60)` seconds with ±20% jitter. After 10 attempts, mark permanently failed and surface to user.

### 6.2 Pull (delta sync)

For each table, `SELECT * WHERE updated_at > sync_meta.last_pulled_at LIMIT 500`, applied in a transaction, cursor advanced after commit. Soft-deletes included via dedicated `pull_<table>_since` RPC (current SELECT policy hides them — see [202604180001_soft_delete.sql](../../supabase/migrations/202604180001_soft_delete.sql)).

A locally-dirty row is **not** overwritten by pull; the incoming row is stashed under `report_data._serverSnapshot` for the conflict resolver.

### 6.3 Triggers

- App foreground (`AppState`).
- `NetInfo` transitions to `isConnected && isInternetReachable`.
- Manual "Sync now" button.
- After every local mutation (debounced 500 ms while online).

No background fetch in v1.

## 7. RPC Contract

### 7.1 `apply_<entity>_mutation(payload jsonb) → jsonb`

```jsonc
// payload
{
  "client_op_id": "uuid",      // idempotency key
  "op": "insert" | "update" | "delete",
  "id": "uuid",
  "base_version": "timestamptz | null",
  "fields": {                  // partial; whole-replace for report_data
    "title": "...",
    "notes": [...],
    "report_data": {...},
    "deleted_at": "..."
  }
}

// response
{
  "status": "applied" | "conflict" | "duplicate" | "forbidden",
  "row": { ... } | null,
  "server_version": "timestamptz"
}
```

Server-side semantics:

1. Look up by `id`.
2. If `client_op_id` already in `client_ops`, return cached response (exactly-once).
3. `insert`: regular INSERT (RLS enforces ownership).
4. `update`: if `existing.updated_at <> base_version` → `'conflict'` + current row. Else apply with whole-replace for jsonb fields.
5. `delete`: set `deleted_at` iff `base_version` matches.
6. Insert into `client_ops(client_op_id, response_json, applied_at)`. GC after 7 days.

`security definer` with `set local role authenticated` and `auth.uid()` checks so RLS still applies.

## 8. Conflict Resolution (v1)

Per the locked decision, v1 keeps it simple:

- Server returns the conflicting row; client stashes both versions.
- Conflict banner offers two buttons: **Keep mine** (re-submits with new `base_version`) and **Use server** (discards local change).
- Below the buttons, render a JSON diff of `local` vs `server` (using a small library or hand-rolled `lib/json-diff.ts` — readable side-by-side).
- Notes (Phase 3): server-side union by note id in `apply_report_mutation` so notes never conflict.

Phase B (later, only if needed): per-section field-level merge. Out of scope v1.

## 9. Voice Notes & Audio Pipeline

Reuses the existing `file_metadata` table (no new server table needed — see [`apps/mobile/lib/file-upload.ts`](../../apps/mobile/lib/file-upload.ts)). Adds:

- `transcription_state` ∈ `pending | running | done | failed`.
- `upload_state` ∈ `pending | uploading | done | failed`.

Flow:

```
record audio
  → write file (expo-file-system)
  → INSERT file_metadata row locally (transcription_state=pending, upload_state=pending)

upload branch (when online):
  storage.upload → set storage_path → outbox INSERT file_metadata row server-side

transcription branch (when online):
  call transcribe edge fn → on success transcription_state=done

on transcription=done:
  upsert into reports.notes_json (by note id) → outbox UPDATE report
```

Both branches are independent; the report becomes generatable once **transcription** is done, regardless of upload state.

## 10. Deferred Generation Queue

### 10.1 Settings

Stored in `profiles.preferences jsonb`:

- **Generation mode**: `manual | auto_any | auto_wifi` (default `auto_wifi`).
- **Battery floor**: skip auto-runs when battery < 20% and not charging (default on).
- **Re-transcribe with cloud after on-device** — N/A (no on-device STT).
- **Daily token budget**: optional cap; on exceed, downgrade to manual + notify.

### 10.2 State machine

```
[idle] → [queued] → [running] ──┬→ [completed]
                                ├→ [queued] (transient err, backoff)
                                └→ [failed] (permanent err)
```

Gates before running:

1. `outbox` empty for this `report_id`.
2. All `voice_notes` referenced by `notes_json` have `transcription_state='done'`.
3. `shouldRunNow(...)` policy returns `'run'`.

### 10.3 Pure policy function

```ts
function shouldRunNow(input: {
  mode: 'manual' | 'auto_any' | 'auto_wifi'
  netInfo: { type: 'wifi'|'cellular'|'none', isInternetReachable: boolean }
  battery: { level: number, isCharging: boolean }
  appState: 'active' | 'background' | 'inactive'
  budget: { dailyTokensRemaining: number, jobEstTokens: number }
  userInitiated: boolean
}): 'run' | 'wait' | 'skip-needs-user'
```

Truth table:

- `userInitiated && online` → `run`.
- `mode==='manual' && !userInitiated` → `wait`.
- `mode==='auto_wifi' && netInfo.type!=='wifi'` → `wait`.
- `!isInternetReachable` → `wait`.
- `appState!=='active'` → `wait` (no background gen).
- `budget.jobEstTokens > budget.dailyTokensRemaining` → `skip-needs-user`.
- `battery.level < 0.20 && !isCharging && !userInitiated` → `wait`.
- else → `run`.

### 10.4 Worker

Single-flight (concurrency 1). Triggers: `NetInfo` reconnect, `AppState→active`, manual tap, foreground 60-second tick. Idempotent via `existingReport + lastProcessedNoteCount`.

## 11. UX Surfaces

- Sticky **connection banner**: "Offline — your changes will sync when you're back online."
- **Status chips** on report rows: `Draft · Queued · Generating… · Needs review · Failed (tap to retry)`.
- **Pending generations badge** on Reports tab.
- **Conflict banner** with "Keep mine" / "Use server" + collapsible JSON diff.
- **Settings → Generation**: radio (Manual / Auto / Auto Wi-Fi only) + battery toggle.
- Hidden **debug screen** (`/debug/sync` in dev): outbox depth, last sync, ring buffer, "Force sync" / "Clear local cache" buttons.

## 12. Server Migrations Required

1. `<ts>_client_ops.sql` — idempotency table + GC.
2. `<ts>_apply_project_mutation.sql`, `<ts>_apply_report_mutation.sql`, `<ts>_apply_file_metadata_mutation.sql`.
3. `<ts>_pull_changes_rpcs.sql` — `pull_<table>_since(cursor)` returning soft-deletes too.
4. `<ts>_notes_to_jsonb.sql` (Phase 3) — `reports.notes text[]` → `jsonb`. Backfill empty (post-truncate already happened in [202604260002_simplify_report_schema.sql](../../supabase/migrations/202604260002_simplify_report_schema.sql)).
5. `<ts>_project_members_write_policy.sql` — editor role can write report mutations.

## 13. Testing Matrix

Per [09-testing.md](../09-testing.md)'s four layers.

### 13.1 Vitest (mobile unit) — new files

- `lib/local-db/migrations.test.ts` — apply from `user_version=0`, idempotent.
- `lib/local-db/repositories/{projects,reports,voice-notes,file-metadata}.test.ts`.
- `lib/sync/outbox.test.ts` — coalesce, ordering, dedupe.
- `lib/sync/sync-engine.test.ts` — every RPC status drives correct local state.
- `lib/sync/conflict-resolver.test.ts` — keep-mine / use-server / JSON diff rendering.
- `lib/sync/json-diff.test.ts`.
- `lib/generation/generation-policy.test.ts` — table tests, 100% branch coverage.
- `lib/generation/generation-worker.test.ts` — gates, single-flight, retry/backoff.
- `lib/online/online-coordinator.test.ts` — NetInfo + AppState.

### 13.2 Vitest (mobile component) — new files

- `components/sync/ConnectionBanner.test.tsx`.
- `components/reports/ReportStatusChip.test.tsx`.
- `components/reports/ConflictBanner.test.tsx`.
- `app/settings/generation.test.tsx`.

### 13.3 RLS integration (`supabase/tests/`)

- `apply_report_mutation.rls.test.ts` — owner/editor/viewer/non-member matrix, base_version conflict, idempotent replay.
- `apply_project_mutation.rls.test.ts` — same.
- `pull_reports_since.rls.test.ts` — visibility + soft-deletes.
- `client_ops.rls.test.ts` — cross-user isolation.

### 13.4 Edge function unit (`deno test`)

- `generate-report` idempotency-replay test (existing function).

### 13.5 Integration harness (Vitest + better-sqlite3 + msw)

- `offline-create-project.test.ts`.
- `two-device-conflict.test.ts`.
- `crash-recovery.test.ts` — outbox replays exactly once.
- `auth-expiry-mid-sync.test.ts`.
- `large-outbox-drain.test.ts` — 200 ops in <30 s.

### 13.6 Maestro E2E (gated by `e2e-llm` label)

- `.maestro/offline-projects.yaml` (Phase 1).
- `.maestro/offline-edit-report.yaml` (Phase 2).
- `.maestro/offline-voice-note.yaml` (Phase 3).
- `.maestro/offline-generate-on-reconnect.yaml` (Phase 4).

### 13.7 Manual QA matrix (release checklist)

- Airplane mode toggle mid-edit.
- Force-quit during sync.
- Captive Wi-Fi (`isConnected=true, isInternetReachable=false`).
- Account switch (logout deletes local DB).
- Storage-full during recording.
- Clock skew (device 2 h ahead).

## 14. Phased Rollout

Each phase ships behind `EXPO_PUBLIC_LOCAL_FIRST=true` and reverts via OTA.

| Phase | Scope | Status | Test gate |
|---|---|---|---|
| 0 — Foundations | SQLite, migration runner, repo skeleton | ✅ Done | Unit (db, migrations) — 187 → 197 tests |
| 1 — Read offline | Pull sync, `pull_*_since` RPCs, repo-backed reads on lists | ✅ Done (libs + UI) | Vitest pull-engine + repo tests — 199 tests |
| 2 — Write offline | Outbox (with `state` lifecycle), push engine, `apply_*_mutation` RPCs, conflict resolver + JSON diff | ✅ Done (libs + UI) | Vitest outbox/push/conflict — 231 tests |
| 3 — Notes & audio offline | Voice-note state machine (upload + transcription branches); `apply_file_metadata_mutation` RPC | ✅ Done (libs + server); notes→jsonb server migration TBD | State-machine unit tests + RLS — 242 tests |
| 4 — Generation queue | `shouldRunNow` policy, single-flight worker | ✅ Done (libs); trigger source wiring TBD | Policy truth-table + worker gating tests — 262 tests |
| 5 — UI wiring & sync runtime | `SyncProvider` (pull+push loops, AppState, NetInfo gating, logout DB delete), Supabase RPC bridge, `useLocalProjects` / `useLocalReports`, screens for projects + reports, `ConnectionBanner`, `ConflictBanner` | ✅ Done | Bridge + hook + component tests — 330 tests |
| Follow-up | Maestro flows, `notes` → `jsonb` server migration, generation worker mount, voice-note machine integration, Settings/Generation screen, debug sync screen, SyncProvider integration tests | ⏸ Pending | Live Maestro |

## 15. Risks & Open Items

- **Captive Wi-Fi**: gate sync on `isInternetReachable`, not `isConnected`.
- **iOS background**: not relied upon (no background generation).
- **Cost blowups on bulk reconnect**: daily token cap + manual confirmation prompt for large queues.
- **Schema evolution**: add `report_data._schemaVersion` and migration functions on local read.
- **Privacy**: voice audio unencrypted on device until upload; revisit in v2.

## 16. References

- Existing repo + DI pattern: [apps/mobile/lib/file-upload.ts](../../apps/mobile/lib/file-upload.ts), [apps/mobile/lib/voice-note-flow.ts](../../apps/mobile/lib/voice-note-flow.ts).
- Server schema: [supabase/migrations/202603290001_projects_reports.sql](../../supabase/migrations/202603290001_projects_reports.sql), [supabase/migrations/202604180001_soft_delete.sql](../../supabase/migrations/202604180001_soft_delete.sql).
- Generation flow: [docs/05-report-generation-analysis.md](../05-report-generation-analysis.md).
- Testing strategy: [docs/09-testing.md](../09-testing.md).
