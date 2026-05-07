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
