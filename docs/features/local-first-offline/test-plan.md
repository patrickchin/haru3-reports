# Local-First Offline — Test Plan (v2)

> **Status:** Forward-looking. v1 is being removed; this plan describes what v2 must test before we ship offline mode again.
> **Owner:** mobile.
> **Companion docs:** [plan.md](./plan.md) (design), [retro.md](./retro.md) (v1 lessons — all the bug categories below come from this), [removal-plan.md](./removal-plan.md).

The v1 retro (§3 "Pain points & where bugs came from") clusters every offline bug we shipped into 7 root-cause categories: concurrency, schema/model mismatch, lifecycle, RLS gaps, cache coherence, migration drift, two-write-paths during refactors. v2's test plan is built so that **each category has at least one test class that would have caught the corresponding v1 bug**.

---

## 1. Goals & Non-Goals

### Goals
- Prove every read/write screen works with zero connectivity (projects, reports CRUD, voice notes, drafts, deferred generation).
- Prove convergence: after any sequence of offline edits + server edits + reconnect, all clients agree.
- Prove RLS is enforced **at every server entry point** — REST routes, RPCs, direct PostgREST — with test fixtures for owner / member / non-member.
- Prove the outbox is exactly-once-per-server-effect (no duplicates on retry, no loss on crash) under each platform-induced failure (force-quit, OS-kill, network drop mid-flight, token-refresh races).
- Prove schema changes are caught **before merge** by a contract that compares server columns ↔ SQLite columns ↔ TS types.
- Prove the generation queue's policy decisions are pure-function deterministic and exercised on every (mode × battery × network × foreground) cell.

### Non-Goals (v2)
- Multi-device real-time collaboration (still last-writer-wins).
- Conflict UX (sibling-column conflict capture only — no diff/merge UI).
- Offline-first for non-mirrored tables (orgs, billing, audit log).

---

## 2. Test Pyramid

| Layer | Tooling | What it covers | Where it lives |
|---|---|---|---|
| **Pure-function unit** | Vitest | sync engine state machines, generation policy, conflict resolver, outbox coalescing | `apps/mobile/lib/sync/**/*.test.ts`, `apps/mobile/lib/local-db/**/*.test.ts` |
| **Component / hook unit** | Vitest + RTL | `useLocal*` hooks, `SyncProvider`, `ConnectionBanner` | colocated `*.test.tsx` |
| **Integration (host)** | Vitest + better-sqlite3 + msw | full offline → sync → server roundtrip with real SQLite + mocked REST | `apps/mobile/tests/integration/sync/` |
| **RLS / authorization** | pgTAP via `supabase test db` | every push/pull route as owner / member / non-member / anon | `supabase/tests/rls/` and `supabase/tests/rest/` |
| **Contract** | Custom diff script | server column set ↔ SQLite column set ↔ generated TS types — fail CI on drift | `scripts/test-schema-contract.ts` |
| **Maestro E2E** | Maestro | reconnect/offline-mode user journeys on real device images | `apps/mobile/.maestro/offline/` |
| **Manual QA matrix** | Checklist | release-gate scenarios that are too flaky to automate (airplane mode toggling on real hardware) | `docs/qa/offline-release-checklist.md` |

---

## 3. Bug-Ledger-Driven Test Classes

These exist **because** v1 shipped a bug in each category. Each row pairs a retro finding with a test class that must exist and run in CI.

| Retro category | v1 example | Required test class | Tooling |
|---|---|---|---|
| **Concurrency** | Outbox push coalescing race (`fix(sync): outbox in-flight state column…`) | Property test: N concurrent push triggers + N enqueued mutations → exactly-once server effect, in-flight column never violated | Vitest + `fast-check` |
| **Schema / model drift** | Composite-PK pull missing `project_members` rows | Schema-contract test: compare information_schema.columns vs `local-db/schema.ts` vs generated `database.types.ts` — any mismatch fails CI | `scripts/test-schema-contract.ts` |
| **Lifecycle** | Per-user SQLite file not deleted on logout | Integration test: log in as A → write rows → log out → log in as B → assert zero A rows visible; assert SQLite file path is per-user | Vitest + better-sqlite3 |
| **RLS gaps** | RPC `apply_*` had broader privilege than equivalent SELECT | RLS parity test: every push RPC and every pull RPC tested as owner / member / non-member; expected effect/empty-set documented inline | pgTAP |
| **Cache coherence** | React Query cache stale after pull | Hook test: pull engine emits `pullComplete` → assert affected query keys invalidate; assert UI re-renders within 1 frame | Vitest + RTL |
| **Migration drift** | SQLite migration order mismatch between dev / prod / test fixtures | Migration replay test: apply all migrations against empty DB, then against a snapshot of "v1.0 prod schema", assert end state identical | Vitest + better-sqlite3 |
| **Two-write-paths during refactor** | Outbox `apply_*` RPC + new REST route both wrote, drifted | Architecture test: at most one server write primitive per entity; lint rule rejects new direct PostgREST writes from sync engine | `eslint-plugin-local-rules` + grep guard in CI |

---

## 4. Unit Tests

### 4.1 Sync engine (`apps/mobile/lib/sync/**`)
- `outbox.test.ts` — enqueue / dequeue / mark-in-flight / mark-applied / coalesce; property tests for ordering invariants.
- `push-engine.test.ts` — drain semantics, retry/backoff curve, token-refresh during push, partial-batch failure rollback.
- `pull-engine.test.ts` — cursor advancement, soft-delete handling, composite-PK tables, 500-row page boundary, empty page → cursor still advances.
- `conflict.test.ts` — sibling-column capture, latest-wins on `updated_at` tie-break by `client_id`.
- `generation-policy.test.ts` — exhaustive matrix: `mode × battery × network × foreground × cost-budget` → expected decision; existing v1 file is the seed.
- `voice-note-machine.test.ts` — enqueue→record→stop→transcribe→outbox; force-quit between every state transition.

### 4.2 Local DB (`apps/mobile/lib/local-db/**`)
- `migrations.test.ts` — every migration applied forward; replay against `v1.0` schema snapshot fixture.
- `repos/*.test.ts` — CRUD + soft-delete + transactional multi-table writes (the **single transactional write primitive** from retro §6).

### 4.3 Hooks (`apps/mobile/hooks/**`)
- `useLocalProjects` / `useLocalReports` / `useLocalReportNotes` — read-after-write within same render, optimistic update, rollback on push failure.
- `SyncProvider.test.tsx` — connection events propagate; backoff state surfaced.

---

## 5. Integration Tests (`apps/mobile/tests/integration/sync/`)

Real SQLite (better-sqlite3) + msw-mocked REST. Each scenario is a script: do offline ops → flip msw to "online" → drain outbox → assert server state.

Required scenarios:
1. **Happy path** — create project + reports + notes offline → reconnect → server state matches client.
2. **Crash mid-push** — kill the worker after enqueue but before server ACK → recover → no duplicates.
3. **Token refresh mid-push** — JWT expires between sign and send → refresh → retry succeeds.
4. **Server-side change** — same row edited offline by client and online by another session → reconnect → conflict captured in sibling column, last-write-wins on `updated_at`.
5. **Soft-delete propagation** — delete offline → reconnect → server soft-deletes; pull on second client clears row.
6. **Schema-add migration** — bump SQLite schema by one column → existing outbox rows still drain.
7. **Logout mid-sync** — outbox non-empty → logout → SQLite file deleted → no leakage on next login.

---

## 6. RLS / Authorization Parity (`supabase/tests/`)

Modeled after `rest-api-migration/test-plan.md` §5.4. Every push and pull endpoint tested in 4 personas:
- **owner** — full effect.
- **member** — bounded effect (own rows or shared-project rows only).
- **non-member** — no effect / empty set / `42501`.
- **anon** — `401`.

Each test asserts both the response **and** the post-state (no unexpected rows mutated).

---

## 7. Contract Tests

- **Schema contract** (`scripts/test-schema-contract.ts`): diffs `information_schema.columns` ↔ `local-db/schema.ts` ↔ generated `database.types.ts`. Fails CI on any drift. *This is the test the v1 retro identified as missing.*
- **REST contract** (when v2 is on REST routes): OpenAPI spec generated from server, validated against mobile client's typed bindings. See `rest-api-migration/test-plan.md` §6 for the pattern.

---

## 8. Maestro E2E (`apps/mobile/.maestro/offline/`)

Gated by `e2e-offline` label (slow). Required flows:
1. **Cold offline create** — launch with airplane mode on → create project + report + voice note → toggle online → assert server has all three.
2. **Hot offline edit** — online, open report → airplane mode → edit notes → relaunch → online → assert server reflects edits.
3. **Deferred generation** — offline, mark report ready-to-generate → reconnect on Wi-Fi → assert generation runs once policy allows.
4. **Logout during outbox-non-empty** — assert prompt shown; assert SQLite file gone after confirm.

---

## 9. Manual QA Matrix (release-gate)

Real-hardware scenarios that flake in CI. Lives in `docs/qa/offline-release-checklist.md`. Minimum cells:
- Airplane mode toggle 10× during a push.
- Background app for 30 min, foreground, assert sync resumes.
- Force-quit during transcription, relaunch, assert resume.
- iOS Low Power Mode + auto-generate setting.
- Cellular → Wi-Fi handoff mid-pull.

---

## 10. Phase Validation Gates

v2 will reuse the v1 phase structure (plan §14). Gate criteria:

| Gate | Must pass before merge |
|---|---|
| **P0 (scaffold)** | unit tests + schema-contract |
| **P1 (push)** | + outbox property tests + RLS parity for push routes |
| **P2 (pull)** | + pull integration scenarios + RLS parity for pull routes |
| **P3 (conflict)** | + integration scenarios 4–6 |
| **P4 (deferred-gen)** | + generation-policy matrix exhaustive + Maestro flow 3 |
| **P5 (release)** | + manual QA matrix signed off + Maestro all flows green on iOS+Android |

---

## 11. CI Pipeline Additions

- `mobile:unit` — already exists; gate at 100% pass.
- `mobile:integration:sync` — new; runs §5 scenarios.
- `supabase:rls` — already exists; ensure §6 cases added.
- `schema:contract` — new; runs `scripts/test-schema-contract.ts`.
- `maestro:offline` — new lane, label-gated, runs nightly + on `release/*` branches.

---

## 12. Acceptance Checklist (Pre-v2 GA)

- [ ] Every retro bug-ledger category has a passing test class (table in §3).
- [ ] Schema-contract test wired into pre-push.
- [ ] At most one server write primitive per entity (architecture-test green).
- [ ] Maestro offline lane green on iOS + Android, last 5 nightly runs.
- [ ] Manual QA matrix signed off by mobile lead.
- [ ] Feature flag (`EXPO_PUBLIC_LOCAL_FIRST` or successor) **kept past launch** — see retro §6.
- [ ] Removal-plan tag `pre-offline-removal` still recoverable; v2 schema migration coexists with `pre-offline-removal` rollback.
