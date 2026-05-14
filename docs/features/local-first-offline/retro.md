# Retrospective — Local-First Offline Mode (v1)

> **Date:** 2026-05-06
> **Author:** Patrick
> **Status:** Feature shipped behind `EXPO_PUBLIC_LOCAL_FIRST` (later flag-removed in `20c3c7e`), then deprecated and removed pre-launch because we have no field customers yet and the dual write path was blocking a larger REST-routes refactor.
> **Companion docs:** [plan.md](./plan.md) (the v1 design spec — keep it; v2 will start from there), [test-plan.md](./test-plan.md) (what v2 must test, derived from this retro's bug ledger), [removal-plan.md](./removal-plan.md) (concrete steps to delete v1 before starting v2).

This retro is written so the next person (probably future-me) bringing offline mode back doesn't pay the same tuition twice.

---

## 1. What we built

Roughly 8.6k LOC across:

- `apps/mobile/lib/local-db/` — `expo-sqlite` schema + migrations (v0 → v7), per-user DB file.
- `apps/mobile/lib/sync/` — pull engine, push engine / outbox, conflict snapshot, generation worker, voice-note machine.
- `useLocalProjects` / `useLocalReports` / `useLocalReportNotes` hooks wrapping every read/write.
- `apply_<entity>_mutation` SECURITY DEFINER RPCs and pull RPCs in `supabase/migrations/`.
- `ConnectionBanner`, `ConflictBanner`, `forceOffline` dev toggle.
- ~3.6k LOC of tests, plus RLS integration tests for every RPC.

Built in 6 phases (commits `56bcfda` → `399fc0d`), then iterated for ~2 months.

## 2. Bug ledger (what actually broke after "done")

In the ~2 months after the last phase landed, we shipped **14 `fix(...)` commits** touching sync / local-db / RPCs. The pattern is more interesting than the count:

| # | Commit | Class of bug |
|---|---|---|
| 1 | `d08f223` outbox in-flight state column | **Concurrency** — push coalescing race, two pushes claimed the same row |
| 2 | `e93063a` pull engine composite-PK support | **Schema/model mismatch** — `project_members` PK assumption was wrong |
| 3 | `408ad2e` delete per-user SQLite on logout | **Lifecycle** — stale data leaked across accounts |
| 4 | `75d4ec8` local-first RPCs RLS test gaps | **Security** — RLS holes only caught by integration tests, not mocks |
| 5 | `7097bac` 3 schema-review issues in pull/apply RPCs | **Schema review** — caught late |
| 6 | `edc71c8` debounce push-complete + slim outbox payloads | **Performance/UX** — notification storm, large payloads |
| 7 | `b3ccb1b` invalidate React Query caches on pull complete | **Cache coherence** — local DB ≠ what UI showed |
| 8 | `16b10d7` move conflict snapshot to a sibling column | **Data model** — schema choice didn't survive contact |
| 9 | `049da0f` pull report_notes from server | **Completeness** — entity left out of pull |
| 10 | `84925ff` hydrate projects after first login | **First-run** — empty-state edge case |
| 11 | `e32fa1c` voice-note-machine atomic + enqueue outbox | **Atomicity** — partial failure left orphans |
| 12 | `c48d790` allow NULL body/file_id via RPC | **API surface** — RPC didn't model the actual write shape |
| 13 | `75c8b37` / `e935947` / `e05f1c5` unique partial index + dedupe + v7 migration | **Migration drift** — same bug surfaced 3 times in 3 layers |
| 14 | `3894e0c` route cloud-fallback through SECURITY DEFINER RPCs | **Two write paths** — direct UPDATE bypassed RPC checks |

**Read this list as the syllabus** for v2. Every category is a known-hard distributed-systems problem we walked into.

## 3. What went well

- **Phased rollout (0 → 5).** Each phase was independently testable; we didn't try to ship everything in one PR. Keep this approach.
- **Feature flag during build-out.** `EXPO_PUBLIC_LOCAL_FIRST` let us merge to `dev` without breaking anyone. Removing it (`20c3c7e`) was premature — see §5.
- **RLS integration tests caught real holes.** `75d4ec8` and `6dd8a6a` are exactly the failure mode `AGENTS.md` warns about. Mocked client tests would have shipped the bugs.
- **SECURITY DEFINER RPCs for writes.** Once `3894e0c` enforced this end-to-end, the security model became defensible. Direct table writes from a sync engine are a footgun.
- **Per-user SQLite file.** Right call architecturally; we just wired the lifecycle late (`408ad2e`).
- **Conflict-as-sibling-column** (`16b10d7`) ended up being the right shape. Worth carrying forward.
- **Outbox `in_flight` column** (`d08f223`) — the canonical fix for push coalescing. Bake this into the v2 schema from day one, don't add it after a race shows up in prod.

## 4. What hurt

### 4.1. Two write paths during a refactor is brutal

The trigger for removal wasn't sync bugs in isolation — it was that **every** write had to be implemented twice (REST route + `apply_*_mutation` RPC + outbox driver) and kept in sync. The Supabase-RPC → REST-routes migration would have required touching both for every entity. Concretely, this manifested as:

- `3894e0c` — cloud fallback wrote directly, bypassing RPC; had to be re-routed.
- `c48d790` — RPC didn't accept NULL; REST shape and RPC shape drifted.
- `e32fa1c` — voice-note path had to learn to enqueue outbox entries that the REST path didn't need.

**Lesson:** don't introduce offline mode in the middle of an unstable server API. Stabilise the server contract first, *then* layer local-first on top of a frozen surface.

### 4.2. Schema bugs surfaced 3× in 3 layers

The `report_notes (report_id, position)` uniqueness story ran:

1. `75c8b37` — add unique partial index on the server.
2. `e935947` — server data already had dupes; backfill dedupe.
3. `e05f1c5` — local-db v7 migration had the *same* dupes for users mid-flight.

Every constraint we added to Postgres had to be replayed in SQLite migrations *and* in any in-memory data already on devices. We didn't have a process for "schema change → 3-layer rollout plan", so we kept discovering the third layer last.

**Lesson:** v2 needs a written checklist for schema changes: (a) Postgres migration, (b) SQLite migration with the same invariant, (c) idempotent backfill on both sides, (d) RLS test, (e) pull/apply RPC update. No schema PR merges without all five boxes ticked.

### 4.3. Cache coherence between SQLite and React Query was implicit

`b3ccb1b` (invalidate RQ caches on pull complete) shipped *months* after launch. Until then, the UI silently lagged behind the local DB after a pull. We had three caches (server / SQLite / RQ) and only formalised the contract between two of them.

**Lesson:** for v2, write down the cache topology *before* coding. Every async boundary needs an explicit invalidation rule. RQ keys should be derived from local-DB write events, not added ad-hoc.

### 4.4. Removing the feature flag was premature

`20c3c7e refactor(mobile): remove LOCAL_FIRST_ENABLED feature flag` happened while we were still finding sync bugs. Once removed, we lost the kill-switch — and now the only safe way to "turn it off" is delete the code. If we'd kept the flag default-on but functional, this retro would have been "flip flag off" instead of "delete 8.6k LOC".

**Lesson:** keep load-bearing feature flags until at least one full release cycle after the last `fix(<scope>)` commit. Don't measure flag-readiness by "did the feature ship", measure by "is the bug rate flat".

### 4.5. The hook surface coupled UI to sync

`useLocalProjects` / `useLocalReports` / `useLocalReportNotes` were the right shape, but they were *named* and *shaped* differently from a hypothetical `useProjects` REST hook. So switching write paths means touching every screen, not just the data layer.

**Lesson:** v2 should expose a single `useProjects` (etc.) hook whose *implementation* may or may not be local-first. Screens shouldn't know which mode is active. The hook returns `{ data, mutate, syncState }` regardless of source.

### 4.6. Generation worker shouldn't have been in v1

`feat(sync): generation-jobs repo and driver` (`7e8f176`) and the worker mount (`1de81a9`) added a *third* state machine (pull engine, push engine, generation queue), each with its own retry semantics. Generation-on-reconnect is a separable feature; bundling it into "offline mode" enlarged the blast radius without proportional value.

**Lesson:** v2 should ship "offline reads + writes" first, ship for a release, *then* add deferred generation as a follow-up feature. Don't co-design two state machines.

### 4.7. The voice-note path violated atomicity

`e32fa1c` (atomic + enqueue outbox) fixed a bug where transcription could complete but the outbox enqueue could fail, leaving an orphan. The voice-note machine had its own ad-hoc flow that didn't go through the standard write path.

**Lesson:** there should be exactly one write primitive — `enqueue(entity, mutation)` inside a single SQLite transaction that also writes the outbox row. Anything that isn't transactional with the outbox is a future bug.

## 5. Decisions to carry into v2

These survived contact and should be locked decisions for the next attempt:

1. **`expo-sqlite` for local store.** Worked. Migrations are tractable.
2. **SECURITY DEFINER RPCs for writes; direct UPDATE/DELETE rejected.** Don't waver.
3. **Per-user SQLite file, deleted on logout.** Get the lifecycle right from commit 1.
4. **Outbox with `in_flight` column** from day one (don't wait for the race).
5. **Conflict snapshot as sibling column** (not embedded in `report_data`).
6. **Whole-replace `report_data` via `base_version` optimistic concurrency.** Simpler than CRDT; matched our domain.
7. **RLS integration tests for every RPC.** No exceptions, no mocked-only PRs.
8. **TanStack Query cache invalidation on pull-complete is part of the contract**, not an afterthought.

## 6. Decisions to revisit in v2

1. **Don't bundle generation queue into "offline mode" v1.** Ship reads/writes first.
2. **Hook naming should be source-agnostic** (`useProjects`, not `useLocalProjects`).
3. **Keep the feature flag past launch.** Remove only after a quiet release cycle.
4. **Write the schema-change checklist** (Postgres + SQLite + backfill + RLS test + RPC) as a PR template before the first migration.
5. **Freeze the server API surface** (REST routes, response shapes) before starting offline work. Don't refactor underneath an outbox.
6. **Single write primitive** that is transactional with the outbox. No ad-hoc paths (looking at you, voice-note machine).

## 7. Trigger to bring offline mode back

Don't restart this work speculatively. Bring it back when **at least one** is true:

- A real customer reports data loss / friction from filling reports without signal (construction sites, basements, remote inspections).
- Voice-note capture in low-connectivity environments becomes a top-3 churn driver in support tickets.
- We add a feature that *requires* local state (e.g. on-device drafts shareable between devices, on-device LLM, multi-day expedition mode).

Until then, treat the design doc + this retro as the spec, and don't carry the maintenance tax.

## 8. Concrete artefacts preserved

- **Design doc:** `docs/features/local-first-offline/plan.md` — the v1 spec; keep as v2 starting point.
- **Last-known-good commit:** tag `pre-offline-removal` on `dev` before the removal PR lands.
- **Schema:** SQLite migrations live in git history under `apps/mobile/lib/local-db/migrations/`.
- **RPCs:** `apply_<entity>_mutation` and pull RPCs live in `supabase/migrations/` under their original timestamps; the removal migration drops them but git remembers.
- **Tests:** RLS integration tests in `supabase/tests/rls_*.test.ts` and sync unit tests in `apps/mobile/lib/sync/__tests__/` are reusable as v2 fixtures.

---

*If you're reading this because you're about to start v2: open the bug ledger in §2 first. Each row is a landmine someone already stepped on. Bake the fix into the schema or the architecture, not into a `fix(...)` commit two months after launch.*
