# Recurring Bugs Log

A running log of bugs that keep recurring, almost-recurred, or only got
caught by manual QA despite green tests. The point is to remember the
shape of the bug so the **next** time we touch the same area we recognise
it before shipping.

Format per entry:

- **Symptom** — what the user / QA actually saw.
- **Root cause** — what the code was doing wrong.
- **Why tests passed** — the missing-coverage gap that let it through.
- **Fix** — what we did, with commit hash.
- **Guardrail** — the regression test (or rule) that should catch it
  next time. If there is no guardrail, say so.

Keep entries short. Link to the commit, not the diff.

---

## 2026-05-08 — Voice-note auto-summary invisible in fixture mode

**Symptom.** On `pnpm ios:mock`, voice notes recorded against the
mocked transcribe + summarize edge functions never showed the title or
the "Summary" block. The "Summarize" button stayed visible forever even
after the edge call returned `{ title, summary }` successfully.

**Root cause.** Three independent bugs stacked:

1. `supabase/functions/summarize-voice-note/index.ts` fixture-mode shim
   stubbed `updateFileMetadataFn` to `async () => {}`, so
   `file_metadata.voice_title` / `voice_summary` never got written.
   The next `useProjectFiles` refetch loaded the same null row, and
   `VoiceNoteCard` rendered the Summarize button + no title/summary.
2. `useSummarizeVoiceNote.onSuccess` only invalidated the
   `project-files` query — no optimistic merge — so even when the DB
   write did land, there was a visible lag and any flake in (1) was
   indistinguishable from "feature broken".
3. The Maestro flow `apps/mobile/.maestro/voice-notes/record-replay-delete.yaml`
   asserted `visible: "Summary"` with `optional: true`, so the entire
   bug class above silently passed E2E.

**Why tests passed.** Unit tests mocked `backend.functions.invoke` and
asserted hook behaviour — they could not see that the **server-side
write** path was a no-op in fixture mode. The Maestro assertion that
*should* have caught it was marked optional.

**Fix.** Commit
[`e8450ea`](https://github.com/patrickchin/haru3-reports/commit/e8450ea)
on `feat/voice-note-summary`:

- Drop the `updateFileMetadataFn: async () => {}` stub in fixture mode
  — the local Supabase stack used by `pnpm ios:mock` has the
  service-role key + migration; let the real write happen.
- `useSummarizeVoiceNote.onSuccess` now optimistically merges
  `{ voice_title, voice_summary }` into every cached `project-files`
  row whose id matches `fileId` — UI flips immediately, defence in
  depth against (1).
- Maestro: drop `optional: true` from the Summary assertion, add asserts
  for the canned title text + `voice-note-title-*` /
  `voice-note-summary-*` testIDs, and assert
  `btn-voice-note-summarize-*` disappears.

**Guardrail.**
- New unit test: "optimistically merges title + summary into cached
  project-files rows" in `apps/mobile/hooks/useSummarizeVoiceNote.test.tsx`.
- Required Maestro assertions in `record-replay-delete.yaml`.

---

## 2026-05-08 — Maestro upload-queue flows drifted from product reality

**Symptom.** Media-pipeline Maestro flows failed even when the product path
was healthy: stale `report-row-0` IDs, assertions on the wrong tab, cleanup
that assumed one back press, and pending-row waits that missed fast uploads.

**Root cause.** The flows were authored from memory after the report list,
navigation depth, and queue UI had already changed. They also assumed a
transient pending row would always be visible instead of accepting either
pending or completed state.

**Why tests passed.** Unit tests covered the upload queue and hooks, but no
guard checked that Maestro YAML still matched the live testID catalog and
screen navigation shape.

**Fix.** Commit this media-pipeline PR: update the affected flows to use the
current IDs/tabs, tolerate pending-or-completed upload state, seed/tap photo
library media, and persist logs under `/tmp/maestro-logs/`.

**Guardrail.** R6-R9 below; keep flow changes in the same PR as component
testID/navigation changes, and run the relevant flows once locally before PR.

---

## 2026-05-09 — Report-note RLS hardening kept exposing sibling entry points

**Symptom.** Adding optimistic text notes looked like a mobile-only UX change,
but review kept finding ways to create or reveal invalid `report_notes` state:
cross-project `report_id` / `file_id` pairings, revoked uploaders still able to
mutate files, removed note authors still able to edit/delete old notes, direct
hard deletes bypassing soft-delete RPCs, and soft-deleted projects/reports still
leaving active child rows visible to service-role/background paths.

**Root cause.** Authorization and soft-delete invariants were split across too
many entry points: table RLS policies, SECURITY DEFINER RPCs, triggers, legacy
direct DELETE policies, and child-table queries. Fixing one route made the next
sibling route stand out. Some helpers (`user_has_project_access`,
`user_project_role`) treated membership as valid without checking that the
parent project was still active.

**Why tests passed.** Existing RLS tests covered happy-path CRUD and a few
stranger-denial cases, but did not exercise current-role revocation, direct
DELETE bypasses, parent soft-delete child visibility, file/report/project
pairing invariants, or all RPC/table-policy parity paths in the same suite.

**Fix.** Commit
[`739442e`](https://github.com/patrickchin/haru3-reports/commit/739442e):

- Add DB invariants tying `report_notes.report_id` and `file_id` to the same
  active project/report/file, with preflight checks and child-side FK indexes.
- Require current project role for uploader/note-author/report-owner write
  paths, including soft-delete RPCs.
- Deny direct hard DELETE for soft-delete-owned tables and route tombstones
  through SECURITY DEFINER RPCs.
- Tombstone child reports, notes, and files when reports/projects are
  soft-deleted; make direct `report_notes.deleted_at` changes fail outside
  the intentional RPC guard.
- Extend RLS coverage for revoked members, downgraded uploaders, direct DELETE
  denial, active parent/child visibility, and report/file/project mismatch
  rejection.

**Guardrail.** R10 below; any table with soft-delete or denormalized project
ownership needs one RLS test matrix that covers REST policy, every RPC, direct
DELETE/UPDATE bypass attempts, parent tombstone visibility, and membership
revocation.

---

## Recurring patterns to watch for

These have bitten us more than once across different features. Treat as
a checklist when reviewing PRs that touch the relevant area.

### R1 — Fixture-mode stubs that hide real failures

Edge-function `use-fixtures.ts` shims that stub away **side effects**
(DB writes, storage writes, etc.) make `pnpm ios:mock` and Maestro
runs lie about whether the feature works end-to-end. Stubs are fine
for the **LLM call itself**; they are NOT fine for the
DB-write-after-LLM step that the UI depends on.

**Rule.** A fixture handler may stub the LLM / model call, but must
let the side effect run against the local Supabase stack — the stack
is what `pnpm ios:mock` is built on, so the credentials are there.

### R2 — `optional: true` on Maestro assertions

`optional: true` is for *flow-skipping* (this step might not be
present), NOT for *assertion-skipping*. If you write
`assertVisible: "Summary" optional: true`, you have written zero
test coverage for "Summary appears" — the run will pass whether or
not the element is on screen.

**Rule.** `optional: true` on `assertVisible` / `extendedWaitUntil`
is only acceptable when the element really may not appear (e.g.
the empty-state list might be empty). For "this MUST appear", drop
the flag.

### R3 — Mutation success without optimistic cache update

When a mutation writes data the very next render of the same screen
needs, `invalidateQueries` alone leaves a visible stale frame —
worse, it makes any server-side regression in the write path look
identical to "the cache hasn't refreshed yet". Always pair the
invalidate with an optimistic `setQueriesData` patch that mirrors
the server change.

**Rule.** If a mutation's `onSuccess` only calls
`invalidateQueries`, ask: "what does the user see in the 0-500 ms
between the mutation resolving and the refetch landing?" If the
answer is "the old data", add an optimistic merge.

### R4 — Mocked tests for things that need integration coverage

Hooks that call edge functions, edge functions that write to the
DB, and DB writes that flip RLS-gated UI all have a place where
mocks stop and real I/O takes over. Pure mock tests for the hook
will pass even when the edge function or DB write is broken.

**Rule.** If a code path crosses a boundary (client → edge fn →
DB → client refetch), there must be at least one test that
exercises the **whole** path with no mock at the seam — Maestro
in fixture mode counts.

### R5 — Threshold-gated UI hidden by short fixtures

A UI element gated on `transcript.length > LONG_TRANSCRIPT_CHAR_THRESHOLD`
(or any other size threshold) won't appear in fixture mode unless
the fixture data crosses the threshold. We've hit this twice now
(short `FIXTURE_TRANSCRIPT` vs the 400-char auto-summary cutoff).

**Rule.** When you add a threshold, also bump the fixture so it
crosses the threshold by a comfortable margin, or the feature is
invisible in `pnpm ios:mock` and Maestro.

### R6 — testID drift between components and Maestro flows

Every `testID=` literal in `app/` + `components/` belongs in the static
testID catalog. Maestro flows should reference catalogued IDs, not inline
strings remembered from an older UI.

**Rule.** When a component testID changes, update the catalog and every flow
in the same PR. Run the relevant flow before opening the PR.

### R7 — Fixture-mode-only flows must be tagged

Any flow that asserts upload, LLM, payment, or other fixture-backed completion
needs a `fixture-mode` Maestro tag. Production-preview builds may not be able
to complete the operation deterministically.

**Rule.** Tag fixture-dependent flows at creation time and filter them out of
non-fixture suites.

### R8 — Cleanup nav depth must be derived, not guessed

Hard-coded cleanup like one `btn-back` press breaks when the flow starts from
a deeper route or the screen adds an intermediate step.

**Rule.** Author cleanup against the actual nav depth at the failure point, or
use `launchApp: { clearState: false }` plus idempotent re-navigation.

### R9 — Triage order before debugging an E2E timeout

E2E timeouts often come from harness drift, not product code.

**Rule.** Check in this order: (1) can this build/backend complete the
operation, (2) does the testID still exist, (3) is the assertion on the right
screen. Only then suspect the feature.

### R10 — RLS hardening must cover every entry point

RLS fixes are not complete when the one failing policy passes. Tables that
have denormalized ownership (`project_id`, `author_id`, `uploaded_by`) and
soft-delete semantics usually have multiple write surfaces: direct PostgREST,
SECURITY DEFINER RPCs, triggers, old migration leftovers, and service-role
jobs. A revoked member or tombstoned parent can slip through whichever surface
was not tested.

**Rule.** For every RLS/soft-delete change, test the full matrix: active role,
revoked/downgraded role, direct UPDATE/DELETE, every SECURITY DEFINER RPC,
parent soft-delete visibility, and cross-project/linkage mismatch. If a helper
like `user_has_project_access()` changes, add a child-table regression too.
