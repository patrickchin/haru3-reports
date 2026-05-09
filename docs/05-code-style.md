# Code Style — Component & Module Conventions

> Authored 2026-05-10 as the contract for the overnight `simplify` refactor
> loop and going forward. Subagents and humans must cite this doc in commit
> messages when a change is motivated by it (e.g. `refactor(mobile): split
> ReportEditForm per docs/05-code-style.md`).

The premise: **less code is better**. More JS = bigger bundle, slower
startup, more places for bugs to hide, more cognitive load per change.
Every line you don't write is a line nobody has to read, test, debug,
or delete later.

## 1. Hard ceilings

These are limits, not targets. A file/component at the ceiling is a smell;
something at half the ceiling is fine.

| Thing                          | Soft limit | Hard limit |
| ------------------------------ | ---------- | ---------- |
| Component file (.tsx)          | 250 LOC    | 400 LOC    |
| Hook / util file (.ts)         | 300 LOC    | 600 LOC    |
| Any file (absolute)            | —          | 800 LOC    |
| Function body                  | 30 LOC     | 60 LOC     |
| Component prop count           | 5          | 7          |
| Hook return-tuple/object keys  | 5          | 8          |
| Cyclomatic complexity / fn     | 8          | 12         |
| useEffect deps                 | 4          | 6          |

Over the hard limit ⇒ split, or document why with
`// justified-deviation: <reason>` on the offending symbol.

## 2. Separate I/O from rendering

The recurring problem in this codebase is components that fetch, upload,
subscribe, AND render. Split them:

- **Hooks own I/O** — `useReport(id)`, `useUploadVoiceNote()`,
  `useProjectFiles(projectId)`. They expose state + actions, no JSX.
- **Components own rendering** — they receive data + callbacks via props
  and render. No `fetch`, no `supabase.from(...)`, no `FileSystem.*`,
  no `Audio.*` calls inside a component body.
- **Containers wire them up** — a thin component (~30 LOC) that calls the
  hook(s) and passes results to a presenter.

Rule of thumb: if a component has both `useEffect` doing a network call
**and** more than ~30 lines of JSX, it must be split.

## 3. No speculative abstraction

This is a project-wide rule (`implementationDiscipline`); restating because
refactor passes love to violate it:

- Do **not** extract a helper/hook/component used only once unless the
  extraction makes the calling site materially easier to read or test.
- Do **not** add props "for future flexibility." YAGNI.
- Do **not** introduce a generic `<Card>` to replace 3 specific cards
  unless the 3 actually share behaviour (not just visual padding).
- Do **not** add docstrings, type aliases, or comments to code you
  didn't change in this commit.

## 4. Pending / loading / error states

Do not duplicate JSX for loading/pending/loaded variants of the same
visual. Pick one of:

- **Skeleton-in-place** — render the same component shell with placeholder
  content driven by a `state: 'pending' | 'ready' | 'error'` prop.
- **Discriminated render at the boundary** — the container picks
  `<Skeleton/>` vs `<Real .../>`; the real component never knows about
  loading.

Anti-pattern: a `VoiceNoteCard` with three nearly-identical JSX trees for
`uploading`, `transcribing`, `ready`.

## 5. Props

- Pass primitives, not whole entities, when the child only needs a field.
  Exception: when you need ≥4 fields, pass the entity.
- Never pass a prop the child doesn't consume in this commit.
- Boolean flags that switch large branches of JSX (`isReadOnly`,
  `isPending`) are a code smell — usually means two components in one.
- `onX` callbacks: name by intent (`onDelete`, `onShare`), not by
  mechanism (`handlePress`).
- No "render prop" props (`renderHeader`, `headerSlot`) unless the same
  component is used in ≥3 sites with genuinely different headers.

## 6. State

- Lift only as far as needed. If two siblings both need it, the parent
  owns it. If one ancestor 5 levels up "might want it later," it does not.
- Co-locate state with the component that owns the mutation.
- React Query / SWR-style caches > prop-drilled fetched data > Context >
  global store. Reach for context only when ≥3 unrelated subtrees need
  the same data.
- Reducers are for state with ≥3 transitions or ≥3 fields that mutate
  together. Otherwise use `useState`.

## 7. Hooks

- A hook does one thing. `useVoiceNotePipeline` doing recording AND
  transcription AND upload AND retry = three hooks pretending to be one.
- Return an object, not a tuple, when you have >2 values. Name the keys.
- Don't return functions you don't need at the call site.
- Side effects belong in `useEffect` with the correct deps; don't fake
  it with refs to dodge the linter.

## 8. Standard path first

(Restating `standard-path-first.md` because it bites here.)

Before adding a util, check: does the platform already do this?

- File upload? `fetch` with a `Blob` from `FileSystem.uri`, not
  base64 round-trips.
- IDs? `crypto.randomUUID()`.
- Dates? `date-fns` (already a dep). Not hand-rolled `getTime()` math.
- JSON validation? Use whatever schema lib is in `package.json` already.
- SQL? Parameterized via supabase-js, never string-interpolated.

## 9. File / directory layout

- Co-locate tests: `Foo.tsx` + `Foo.test.tsx` in the same directory.
- Co-locate styles. No `styles/` mega-folder.
- One default export per file. Named exports for helpers used only in
  the same file should not be exported.
- Folder = feature, not type. `components/voice-notes/` not
  `components/cards/` + `components/lists/`.

## 10. Tests

- A refactor that changes structure without behaviour must keep the
  same tests green. If a test breaks, it's either testing implementation
  details (rewrite the test) or the refactor changed behaviour (revert).
- Snapshot tests: regenerate only with a human-readable diff in the same
  PR. Do not blanket `--update`.
- Coverage must not drop. If splitting a file drops coverage on the
  extracted part, add tests for the extracted part in the same commit.
- E2E (Maestro) `testID`s are part of the public API — preserve them
  unless updating the corresponding `.maestro` flow in the same commit.

## 11. Edge functions

- One responsibility per function. `generate-report` should not also
  transcribe.
- Validate input at the boundary with a schema; trust nothing from the
  client.
- Shared code goes in `supabase/functions/_shared/`, not copy-pasted.
- Response shape changes are a breaking change — update mobile callers
  in the same commit.

## 12. Commit hygiene during refactors

- One logical change per commit. `refactor(mobile): extract
  VoiceNoteUploadHook` is one commit; renaming a file is a separate
  commit.
- Conventional commits. Refactors use `refactor(scope):`.
- Cite this doc when applicable.
- Never mix refactor and behaviour change in the same commit.

## 13. The deletion test

Before adding code, ask: *can I delete code instead and get the same
result?* Before extracting a component, ask: *would inlining it make
the call site clearer?* Often the answer is yes.
