# P6: Migration (Week 10-11)

> Part of [Implementation Plan](./implementation-plan.md)

### Prerequisites

**P4.5 Exit Gate must pass before starting any P6 work.** See
[`plan-p4-e2e-polish.md` § P4.5](./plan-p4-e2e-polish.md#p45--p4-exit-gate-must-pass-before-starting-p5)
for the full checklist. In summary:

- All 49 Maestro flows passing
- Unit test coverage ≥ 80%
- `pnpm build && pnpm -r typecheck && pnpm test` all green
- Side-by-side visual parity approved

### Goal
Beta rollout with feature flag.

### P6.1 — Deploy API

**Deliverables:**
- API deployed to Fly.io

**Tasks:**

| Task | Description | Est. | Depends On |
|------|-------------|------|------------|
| P6.1.1 | Create Fly.io app | 1h | P4 |
| P6.1.2 | Configure secrets | 1h | P6.1.1 |
| P6.1.3 | Deploy staging | 2h | P6.1.2 |
| P6.1.4 | Smoke test staging | 2h | P6.1.3 |
| P6.1.5 | Deploy production | 1h | P6.1.4 |

**Acceptance Criteria:**
- [ ] API running on api.harpa.app
- [ ] All endpoints responding
- [ ] Monitoring in place

---

### P6.2 — Mobile Beta

**Deliverables:**
- mobile-v3 in TestFlight/Play Store Internal

**Tasks:**

| Task | Description | Est. | Depends On |
|------|-------------|------|------------|
| P6.2.1 | Configure EAS for mobile-v3 | 2h | P6.1 |
| P6.2.2 | Build preview | 2h | P6.2.1 |
| P6.2.3 | Internal testing | 4h | P6.2.2 |
| P6.2.4 | Fix critical issues | 4h | P6.2.3 |
| P6.2.5 | Build production | 2h | P6.2.4 |
| P6.2.6 | Submit to stores | 2h | P6.2.5 |

**Acceptance Criteria:**
- [ ] App in TestFlight
- [ ] App in Play Store Internal
- [ ] Feature flag controls rollout

---

### P6.3 — Monitoring & Rollout

**Deliverables:**
- Monitoring, gradual rollout

**Tasks:**

| Task | Description | Est. | Depends On |
|------|-------------|------|------------|
| P6.3.1 | Set up error tracking (Sentry) | 2h | P6.2 |
| P6.3.2 | Set up API metrics | 2h | P6.3.1 |
| P6.3.3 | Enable for 10% users | 1h | P6.3.2 |
| P6.3.4 | Monitor for 48h | — | P6.3.3 |
| P6.3.5 | Expand to 50% | 1h | P6.3.4 |
| P6.3.6 | Monitor for 48h | — | P6.3.5 |
| P6.3.7 | Full rollout | 1h | P6.3.6 |

**Acceptance Criteria:**
- [ ] Error rate < 0.1%
- [ ] p95 latency < 500ms
- [ ] 100% users on v3

---

### P6.4 — Legacy Code Removal

Remove old code incrementally as v3 replacements are verified. Each removal
requires its gate tests to pass (see `plan-p5-testing.md` Part 4).

#### Phase A: Remove Now (no v3 dependency)

These have no working code behind them and can be deleted immediately.

| Task | What | Rationale |
|------|------|-----------|
| P6.4.A1 | `.github/workflows/mobile-tests.yml` | References deleted `apps/mobile/` path -- broken |
| P6.4.A2 | `.github/workflows/maestro-smoke.yml` | References deleted `apps/mobile/.maestro/` -- broken |
| P6.4.A3 | `.github/workflows/eas-update.yml` | References deleted `apps/mobile`, chains off broken workflow |
| P6.4.A4 | `supabase/functions/generate-report-playground/` | No v3 equivalent, not used by mobile app |
| P6.4.A5 | `supabase/functions/backfill-file-thumbnails/` | One-off admin utility, no longer needed |
| P6.4.A6 | Remove `@harpa/report-core` from `mobile-v3/package.json` | Listed as dependency but zero imports in v3 |
| P6.4.A7 | Remove `@harpa/report-core` from `packages/api/package.json` | Listed as dependency but zero imports in v3 |

#### Phase B: Remove After API Stubs Implemented

Each edge function can be deleted once its v3 API route passes integration
tests with both fixture mode and real provider mode. The v3 route must
satisfy the same acceptance criteria as the original edge function.

| Task | What | Gate |
|------|------|------|
| P6.4.B1 | `supabase/functions/generate-report/` | `POST /reports/:id/generate` integration tests pass (fixture + real provider) |
| P6.4.B2 | `supabase/functions/transcribe-audio/` | `POST /files/:fileId/transcribe` integration tests pass |
| P6.4.B3 | `supabase/functions/summarize-voice-note/` | `POST /files/:fileId/summarize` integration tests pass |
| P6.4.B4 | `supabase/functions/_shared/` | All of B1-B3 complete (shared code is imported by all three) |
| P6.4.B5 | `.github/workflows/generate-report.yml` | B1 complete |
| P6.4.B6 | `.github/workflows/capture-fixtures.yml` | B1 complete |

#### Phase C: Remove After v3 Launch (100% rollout)

| Task | What | Gate |
|------|------|------|
| P6.4.C1 | `apps/mobile-old/` | v3 at 100% rollout, no rollback needed |
| P6.4.C2 | `packages/report-core/` | C1 complete (only consumer is mobile-old) |
| P6.4.C3 | Old Maestro flows in `apps/mobile-old/.maestro/` | Removed with C1 |
| P6.4.C4 | Old unit tests in `apps/mobile-old/__tests__/` | Removed with C1 |
| P6.4.C5 | Stale `.gitignore` entries for `apps/mobile/` | Clean up after C1 |
| P6.4.C6 | Root `pnpm-workspace.yaml` entries for removed packages | Clean up after C1+C2 |

#### Phase D: Post-Removal Cleanup

| Task | What |
|------|------|
| P6.4.D1 | Remove `supabase/functions/` directory if empty |
| P6.4.D2 | Update `docs/02-deployment.md` to remove edge function references |
| P6.4.D3 | Update `AGENTS.md` to remove edge function test commands |
| P6.4.D4 | Update `docs/v3/arch-migration.md` to mark report-core as removed |
| P6.4.D5 | Run `pnpm install` and verify no broken workspace references |
| P6.4.D6 | Verify CI: all workflows green with no orphan triggers |

**Acceptance Criteria:**
- [ ] No dead code referencing deleted paths
- [ ] No broken CI workflows
- [ ] No orphan dependencies in any `package.json`
- [ ] `pnpm install && pnpm test && pnpm build` succeeds from clean state
- [ ] `docs/` updated to reflect current architecture
