# Local-First Offline — Removal Plan (v1)

> **Status:** Active. This is the work to delete v1 from the codebase, executed before any v2 work begins.
> **Owner:** Patrick.
> **Companion docs:** [plan.md](./plan.md) (v1 design), [retro.md](./retro.md) (why we're removing it), [test-plan.md](./test-plan.md) (what v2 must test).

---

## 1. Why now

From the retro's headline finding: **two write paths during a server-API refactor is brutal.** The Supabase-RPC → REST-routes migration ([../rest-api-migration/plan.md](../rest-api-migration/plan.md)) needs a single write primitive per entity. Maintaining the outbox-driven `apply_<entity>_mutation` RPCs *and* the new REST routes during P3 cutover would double every mutation and keep them in sync by hand. Combined with: no field customers yet, 14 distinct `fix(sync)` commits across 3 months, and the kill-switch flag already removed in `20c3c7e` — the cheapest path is to delete v1, ship the REST migration cleanly, and bring offline back as v2 once we have a customer who actually needs it.

---

## 2. Goals & Non-Goals

### Goals
- Remove all v1 offline-mode code from `dev` in a single, reviewable PR.
- Preserve recoverability: a `pre-offline-removal` git tag, retro doc, design doc, and migration history all stay accessible.
- Leave no dangling references (broken imports, stale docs, dead feature flags, removed-but-still-referenced RPCs).
- Keep all existing screens working through TanStack Query → REST/PostgREST directly (no offline cache).

### Non-Goals
- Fixing or improving offline behaviour. We are deleting it, not refactoring it.
- Designing v2. v2 starts after the REST migration lands.
- Touching the REST migration's branch — removal lands first; REST migration rebases on top.

---

## 3. Pre-conditions

Before opening the removal PR:

- [ ] Retro committed and on `dev` ✅ (`1794114`, now at `docs/features/local-first-offline/retro.md`).
- [ ] Plan + test-plan + this removal-plan committed and on `dev`.
- [ ] Tag `pre-offline-removal` cut from current `dev` HEAD before any deletion lands.
- [ ] Confirm with self: no in-flight branches depend on `apps/mobile/lib/sync/*` or `apps/mobile/lib/local-db/*` (rest-api-migration branch already assumes online-only is fine).
- [ ] Generation-queue users (auto-generate setting) are aware their preference becomes a no-op until v2.

---

## 4. Removal Inventory

Authoritative list of what gets deleted, derived from the retro's "what we built" inventory.

### 4.1 Mobile code (`apps/mobile/`)

**Delete entirely:**
- `lib/sync/` — push engine, pull engine, outbox, generation policy + worker, voice-note machine, sync provider internals (~3,400 LOC + tests).
- `lib/local-db/` — SQLite schema, migrations, repos (~1,640 LOC + tests).
- `components/sync/` — `ConnectionBanner`, sync-state UI (and any imports in `app/profile.tsx`, `app/_layout.tsx`).
- `hooks/useLocalProjects.ts`, `hooks/useLocalReports.ts`, `hooks/useLocalReportNotes.ts` — replace each with a thin TanStack Query hook hitting REST/PostgREST directly. Keep the **same export names** so callers don't churn; consider renaming in a follow-up so v2 can pick fresh names.
- `lib/dev-flags.ts` — strip `EXPO_PUBLIC_LOCAL_FIRST`, `forceOffline`, and any related dev-toggle UI.
- All test files under the above paths (~3,620 LOC of tests removed).

**Modify:**
- Anything importing the deleted modules — projects, reports, notes screens, generation flow, voice-note flow, settings (auto-generate toggle becomes "always on, online only").
- `app/profile.tsx` — drop the `<ConnectionBanner />` and any sync-status row.
- `package.json` — drop `better-sqlite3`, `expo-sqlite`, and any other deps used solely by `local-db/` or `sync/` (verify with `depcheck` after the deletions land).

### 4.2 Server (`supabase/`)

**Add a new migration** `<timestamp>_drop_offline_rpcs.sql` that drops:
- `apply_project_mutation`, `apply_report_mutation`, `apply_report_note_mutation`, `apply_project_member_mutation` (every `apply_<entity>_mutation` RPC).
- `pull_<entity>_since` RPCs.
- Any helper functions only those RPCs called.

**Keep:**
- All base tables, columns (`updated_at`, soft-delete columns, composite PKs). REST clients still need them.
- RLS policies. They protect the REST surface too.
- Existing migrations — git remembers; the drop migration is the forward record.

**Tests:**
- Remove `supabase/tests/rls/apply_*_mutation.test.sql` (or whichever pgTAP files cover the RPCs).
- Keep RLS tests on tables; they remain valid.

### 4.3 Documentation

- `docs/features/local-first-offline/plan.md` — keep, status banner already reflects archive.
- `docs/features/local-first-offline/retro.md` — keep.
- `docs/features/local-first-offline/test-plan.md` — keep (forward-looking for v2).
- `docs/features/local-first-offline/removal-plan.md` — once removal PR merges, append a "## Done — <date> — <commit>" section.
- `TODO.md` — collapse the "Offline Mode & Sync" section to a single line linking to this folder.
- `README.md` / onboarding docs — strip any "works offline" claim.

---

## 5. Execution Order (one PR, ordered commits)

1. `chore: cut pre-offline-removal tag` — zero diff; just the tag push.
2. `feat(mobile): replace useLocal* hooks with REST-backed equivalents` — same exports, new bodies hitting `supabase-js` / REST directly. Land first so subsequent deletions don't break callers.
3. `refactor(mobile): drop ConnectionBanner and sync UI` — small, isolated.
4. `refactor(mobile): remove generation queue + voice-note machine` — voice-note flow falls back to direct upload + transcribe; auto-generate setting becomes a no-op flag (still stored, just ignored — gives v2 a forward-compatible field).
5. `chore(mobile): delete apps/mobile/lib/sync/ and apps/mobile/lib/local-db/` — bulk delete; CI will catch any straggler imports.
6. `chore(mobile): drop better-sqlite3 / expo-sqlite deps` — after step 5 confirms nothing else uses them.
7. `chore(mobile): strip EXPO_PUBLIC_LOCAL_FIRST and forceOffline from dev-flags` — last mobile commit.
8. `feat(supabase): drop offline-mode RPCs (apply_* and pull_*)` — the new migration.
9. `chore(supabase): remove offline RPC pgTAP tests` — paired with the drop migration.
10. `docs: collapse offline mode TODO + update README` — final cleanup.

---

## 6. Verification

Before merge:

- [ ] `pnpm test` — all suites green (mobile, packages, supabase).
- [ ] `pnpm typecheck` — clean across workspaces.
- [ ] `pnpm lint` — clean.
- [ ] Maestro full suite green; `e2e-offline` lane is **deleted as part of this PR**, not skipped.
- [ ] EAS export check passes.
- [ ] `depcheck` shows no orphaned deps from sync/local-db.
- [ ] Grep audit clean: `rg -l '(useLocalProjects|useLocalReports|useLocalReportNotes|outbox|apply_.*_mutation|pull_.*_since|EXPO_PUBLIC_LOCAL_FIRST|forceOffline|local-db|lib/sync)'` returns only this folder's docs.
- [ ] Manual smoke: cold start app, create project, create report with voice note, generate report, edit, delete — each works online, fails fast offline (acceptable post-removal behaviour).

After merge:

- [ ] Tag `pre-offline-removal` exists on `origin`.
- [ ] Append "Done — <date> — <commit>" to this file.
- [ ] Slack/notion announcement: "offline mode removed; auto-generate setting now no-op until v2".

---

## 7. Recoverability

If we need v1 back in a hurry:
- `git checkout pre-offline-removal -- apps/mobile/lib/sync apps/mobile/lib/local-db apps/mobile/hooks/useLocal*.ts` restores mobile code.
- `git log -- supabase/migrations/ | grep -i 'apply_.*_mutation\|pull_.*_since'` finds the original migration timestamps; copy those SQL bodies into a new forward migration.
- The retro and design doc continue to live at their current paths.
- Schema (server tables and columns) is unchanged by removal, so reinstating offline doesn't require server-data backfills.

---

## 8. Risks

| Risk | Mitigation |
|---|---|
| Hidden import of deleted module from a feature branch we don't own | CI catches it; communicate removal in advance. |
| Auto-generate setting users surprised by no-op behaviour | Settings copy updated in the same PR; preference value preserved for v2. |
| REST routes not yet covering everything sync covered (e.g. project_members composite PK) | Removal PR rebases on top of REST migration's covered surface; if a gap exists, fix in REST-migration scope, not here. |
| pgTAP tests reference `apply_*` RPCs from non-offline coverage | Audit `supabase/tests/` before dropping; move any non-offline assertions to table-level tests first. |

---

## 9. Done

```
Date:        2026-05-07
Commit:      fbac9aa (merge of refactor/remove-offline-mode → dev)
PR:          https://github.com/patrickchin/haru3-reports/pull/12
Tag:         pre-offline-removal (on origin)
Diff:        94 files, +1,163 / -12,946 (~11.8k net LOC removed)
```

Coverage thresholds in `apps/mobile/vitest.config.ts` were ratcheted to
the new post-removal floor (lines 97, statements 95, branches 84,
functions 96) and the `pre-push` hook now runs `pnpm --filter mobile
test:coverage` so future drift is caught locally before it can block
the OTA workflow.

The auto-generate setting is preserved as a no-op forward-compatible
field (still stored in `profiles.auto_generate`, never read at
runtime). v2 picks it up unchanged.

---

## 10. Execution log

The 10 ordered commits in §5 landed on `refactor/remove-offline-mode`
on **2026-05-07**. The actual sequence (with a small adjustment in §6 —
`@react-native-community/netinfo` joined the dep-removal commit because
it was only used by `SyncProvider`'s connectivity gate):

1. Tag `pre-offline-removal` on `dev` HEAD (no diff).
2. `refactor(mobile): make useLocalProjects/Reports REST-only`.
3. `refactor(mobile): drop ConnectionBanner and sync UI`.
4. `refactor(mobile): remove generation queue + voice-note machine`.
5. `chore(mobile): delete apps/mobile/lib/sync/ and apps/mobile/lib/local-db/`.
6. `chore(mobile): drop better-sqlite3 / expo-sqlite / netinfo deps`.
7. `chore(mobile): strip EXPO_PUBLIC_LOCAL_FIRST and forceOffline from dev-flags`.
8. `feat(supabase): drop offline-mode RPCs (apply_* and pull_*)`.
9. `chore(supabase): remove offline RPC pgTAP tests`.
10. `docs: collapse offline mode TODO + update README` (this commit).

§9's official "Done" stub stays empty until the PR merges to `dev`,
matching plan §6 ("append on merge"). Hooks were renamed-in-place
(kept the `useLocal*` prefix per §4.1) so the plan-§6 grep audit still
flags them; that's expected per the same section.
