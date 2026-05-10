# Mobile-v2 RLS Test Coverage — Summary

## Files Created

1. **`supabase/tests/rls_mobile_v2.test.ts`** — 16 tests covering mobile-v2 mutation paths

## Critical Bugs Found (ALL FIXED)

### 1. **Soft-delete via direct UPDATE is broken** ~~(HIGH PRIORITY)~~ **FIXED**

**Location:** [apps/mobile-v2/src/features/reports/mutations.ts](apps/mobile-v2/src/features/reports/mutations.ts#L114)

**Problem (was):** Direct UPDATE setting `deleted_at` failed with `42501` because the SELECT policy filters `deleted_at IS NULL`.

**Fix applied:**
- `useSoftDeleteReport` now uses `soft_delete_report` RPC
- `useSoftDeleteNote` now uses `soft_delete_report_note` RPC
- Added regression tests in `rls_mobile_v2.test.ts` to ensure direct UPDATE/DELETE remains blocked

**Affected files (FIXED):**
- `apps/mobile-v2/src/features/reports/mutations.ts` — `useSoftDeleteReport` and `useSoftDeleteNote`

---

### 2. **Voice pipeline writes to non-existent column** ~~(HIGH PRIORITY)~~ **FIXED**

**Location:** [apps/mobile-v2/src/features/voice-notes/use-voice-pipeline.ts](apps/mobile-v2/src/features/voice-notes/use-voice-pipeline.ts#L85)

**Problem (was):** Voice pipeline wrote `voice_transcript` to `file_metadata`, but that column was dropped in migration `202604300003_drop_legacy_notes_columns.sql`. Transcripts now live in `report_notes.body`.

**Fix applied:**
- Voice pipeline now creates/updates `report_notes` row with `kind: "voice"`, `body: transcript`, `file_id: fileId`
- Calculates proper position for new notes (max + 1 pattern)
- Keeps writing `voice_title` and `voice_summary` to `file_metadata` (those columns still exist)

**Impact:** Voice note transcription feature is now working in mobile-v2.

---

### 3. **Schema column name mismatch: `profile_id` vs `user_id`** ~~(HIGH PRIORITY)~~ **FIXED**

**Location:** [apps/mobile-v2/src/features/projects/mutations.ts](apps/mobile-v2/src/features/projects/mutations.ts#L97)

**Problem (was):** Code used `profile_id`, but schema column is `user_id`.

**Fix applied:**
- Renamed all `profile_id` references to `user_id` in:
  - `apps/mobile-v2/src/features/projects/mutations.ts` (insert)
  - `apps/mobile-v2/src/features/projects/queries.ts` (filter, type)
  - `apps/mobile-v2/src/infra/db-types.ts` (type definition)
  - `apps/mobile-v2/app/projects/[projectId]/members.tsx` (comparison)

---

### 4. **Role name mismatch: `uploader` vs `editor`** ~~(MEDIUM PRIORITY)~~ **FIXED**

**Location:** [apps/mobile-v2/src/features/projects/mutations.ts](apps/mobile-v2/src/features/projects/mutations.ts#L74)

**Problem (was):** Code used role `"uploader"`, but schema CHECK constraint only allows `('admin', 'editor', 'viewer')`.

**Fix applied:**
- Replaced all `"uploader"` references with `"editor"` in:
  - `apps/mobile-v2/src/features/projects/mutations.ts` (types, mutation args)
  - `apps/mobile-v2/src/features/projects/queries.ts` (types)
  - `apps/mobile-v2/src/infra/db-types.ts` (type definition)
  - `apps/mobile-v2/app/projects/[projectId]/members.tsx` (invite handler)

---

## Coverage Gaps Identified (but NOT covered by tests)

### 1. `lookup_profile_id_by_phone` privacy leak

The RPC allows any authenticated user to probe arbitrary phone numbers and discover whether accounts exist. It should require the caller to own or admin at least one project before revealing this mapping.

**Recommendation:** Add a `project_id` parameter and verify the caller is owner/admin of that project.

---

## Coverage Summary

### Tables/Operations Tested

✅ **reports**
- Client-generated IDs (newId()) work with INSERT + RETURNING
- Direct UPDATE of `deleted_at` fails (42501)
- RPC `soft_delete_report` works

✅ **report_notes**
- Client-generated IDs work with INSERT + RETURNING
- Direct UPDATE of `deleted_at` fails (42501)

✅ **file_metadata**
- Voice pipeline's `voice_transcript` column doesn't exist (PGRST204)
- `voice_title` and `voice_summary` updates work for uploader
- Stranger cannot update voice fields

✅ **project_members**
- Owner can update member roles
- Owner can remove members
- Viewer cannot update their own role
- Stranger cannot update/remove members

✅ **lookup_profile_id_by_phone RPC**
- Returns `profile_id` for existing user
- Returns `null` for non-existent phone
- Privacy concern documented

---

### Gaps NOT Covered (Existing Tests Sufficient)

The following are already covered by existing RLS tests:

- `projects` owner CRUD — [rls_projects.test.ts](supabase/tests/rls_projects.test.ts)
- `reports` owner insert with RETURNING — [rls_reports.test.ts](supabase/tests/rls_reports.test.ts)
- `file_metadata` basic CRUD — [rls_file_metadata.test.ts](supabase/tests/rls_file_metadata.test.ts)
- Soft-delete RPCs (`soft_delete_project`, `soft_delete_report`) — [rls_soft_delete.test.ts](supabase/tests/rls_soft_delete.test.ts)

---

## Test Execution

**Run locally:**
```bash
cd /Users/patchin/Workspace/test/haru3-reports
pnpm test:rls:local --run supabase/tests/rls_mobile_v2.test.ts
```

**Results:**
✅ 16 tests passed
⏱️ Duration: ~1.1s

**Note:** Tests were written against a running local Supabase stack. To run the full suite with a fresh database reset:
```bash
pnpm test:rls:local  # (omit SKIP_RESET=1)
```

---

## Next Steps

1. ~~**Fix critical bugs**~~ ✅ **COMPLETED** (all 4 bugs fixed)
2. ~~**Add `soft_delete_report_note` RPC**~~ ✅ **ALREADY EXISTS** (migration 202605070001)
3. ~~**Rewrite voice pipeline**~~ ✅ **COMPLETED** (writes to report_notes.body)
4. ~~**Update all mobile-v2 code**~~ ✅ **COMPLETED** (user_id, editor role)
5. **Review `lookup_profile_id_by_phone` privacy** implications (pending)
6. ~~**Run full RLS suite**~~ ✅ **COMPLETED** (all 122 tests passed)

**Verification results:**
- RLS tests: ✅ **122 passed, 2 skipped**
- TypeScript compilation: ⚠️ **3 pre-existing test file errors** (unrelated to bug fixes):
  - `src/features/reports/queries.test.ts` (module resolution)
  - `src/features/reports/report-edit-helpers.test.ts` (module resolution)
  - `src/features/voice-notes/__tests__/use-voice-pipeline.test.ts` (mock typing issue)

These test file errors existed before the bug fixes and should be addressed separately.
