# Retrospective — Camera Upload OOM (hand-rolled binary pipeline)

Date: 2026-05-08
Owner: @patrickchin
Branch that fixed it: [`feat/media-pipeline`](https://github.com/patrickchin/haru3-reports/tree/feat/media-pipeline)
Root-cause commit: `5b1df4c feat(mobile): stream uploads as Blob and enable Android largeHeap`
Design doc: [docs/10-media-pipeline.md](../10-media-pipeline.md)

Headline lesson: **the failure was not "base64 + big files". It was
shipping a hand-rolled byte pipeline where the platform and the SDK
already provide a one-line standard path.** base64 is one symptom;
the disease is reaching for a custom hack instead of the documented
primitive.

## 1. What happened

Users on Samsung Galaxy phones reported "the app closes when I take a
photo for a report". The OS camera intent returned, the React Native
process disappeared, and any in-flight draft state was lost.

## 2. Root cause

`apps/mobile/hooks/useProjectFiles.ts` (and a duplicated copy in
`apps/mobile/components/account/AvatarUploader.tsx`) uploaded files via:

```ts
const base64 = await FileSystem.readAsStringAsync(uri, { encoding: Base64 });
const decoded = atob(base64);
const bytes = new Uint8Array(decoded.length);
for (let i = 0; i < decoded.length; i++) bytes[i] = decoded.charCodeAt(i);
return Storage.upload(path, bytes);
```

For a typical 4–12 MB phone JPEG this allocates, **at peak, in the JS
heap**:

| stage | size | multiplier |
|-------|-----:|-----------:|
| base64 string | file × 4/3 | ≈ 1.33× |
| atob binary string | file × 1   | + 1×    |
| Uint8Array        | file × 1   | + 1×    |
| **peak**          |            | **≈ 3.3×** |

Add Glide loading other full-resolution Supabase images at the same
time and the process crossed the Android `lmkd` `min2x` watermark. The
kernel killed it on return from the camera intent.

The native alternative — `fetch(uri).then(r => r.blob())` and pass the
Blob straight to `supabase.storage.upload(...)` — never materializes
the file in the JS heap at all. Supabase's storage client streams the
Blob via native `fetch`. Net memory cost: **~0**.

## 3. Why our debugging led nowhere for ~3 sessions

The user-visible report was "camera doesn't work". We investigated:

1. **iOS Info.plist permissions** (`f25ec7a`) — fixed a real but
   *unrelated* iOS SIGABRT for missing `NSCameraUsageDescription`.
   Not the reported crash, on the wrong platform.
2. **Android permissions allowlist** — verified, added regression test.
   Not it.
3. **Maestro flow flakiness, xcodebuild SDK 26 fmt issues, simulator
   boot problems** — environmental noise from trying to reproduce
   locally on a simulator that doesn't OOM the way a real Galaxy does.
4. **Press-and-invoke unit tests** — added 17 of them, all green. The
   tests proved the *handler* fires; they did not exercise the byte
   path with realistic inputs.

Nothing in our process pointed at the actual hot-path: `readBytes()`
in `useProjectFiles.ts`. The architect review on `feat/media-pipeline`
spotted it in ~5 minutes by reading the file rather than the symptom.

## 4. Why the original design was bad

The deeper failure is not "big files + base64". It is that the
original author **invented a custom byte-shuffling pipeline instead of
using the canonical primitive that the platform and the SDK already
provide for exactly this problem**.

For a Supabase upload from a React Native local URI, the documented,
one-line, vendor-blessed path is:

```ts
const blob = await (await fetch(uri)).blob();
await supabase.storage.from(bucket).upload(path, blob);
```

That is the pattern in the Supabase docs, the React Native fetch
spec, and every example in the `expo-image-picker` README. It is
streaming, native, zero-copy in JS, and shorter than what we wrote.

What we wrote instead:

```ts
const base64 = await FileSystem.readAsStringAsync(uri, { encoding: Base64 });
const decoded = atob(base64);
const bytes = new Uint8Array(decoded.length);
for (let i = 0; i < decoded.length; i++) bytes[i] = decoded.charCodeAt(i);
await Storage.upload(path, bytes);
```

This is a hand-rolled binary codec written in interpreted JS. Every
line is a smell on its own:

- `readAsStringAsync(..., Base64)` to move bytes — the API exists for
  encoding metadata into JSON, not for moving file payloads.
- `atob` on a > 1 MB string — that function is for short tokens.
- A `for` loop in JS converting char codes to bytes — this is what
  `TextEncoder`, `Uint8Array.from`, `Buffer`, and `fetch().blob()`
  exist to make unnecessary.
- A `Uint8Array` passed to a storage client whose own examples take a
  `Blob` and stream it.

None of that is novel work. None of it required the abstraction it
introduced. It is a **bespoke replacement for a documented standard
path**, and bespoke replacements need bespoke testing, bespoke
memory analysis, and bespoke maintenance — none of which got done.

The size-of-payload story (peak ~3.3× heap, OOM on Galaxy) is the
specific way this particular hack failed. The general lesson is
that the moment we wrote our own pipeline instead of calling the
blessed one, we owned a class of failure modes the platform vendor
had already solved for us.

The design did not ask the only question that mattered first:
**"What is the standard, documented way to do this?"** Answering
that takes 30 seconds of reading the SDK docs. Skipping it cost us
three debug sessions and shipped a Galaxy-killer to production.

## 5. Why our tests didn't catch it

- `useProjectFiles.test.tsx` mocked `expo-file-system` to return a
  fixed short string. It never observed allocation.
- `AvatarUploader.test.tsx` mocked `Storage.upload` to a no-op. It
  never measured input size.
- No fixture exercised a realistic photo (~10 MB).
- No CI step checked Android-process memory budget under a typical
  capture flow.
- The press-test coverage gate (`acd95f2`) confirmed the *button*
  fired; it cannot, by design, see what happens inside the handler.

Coverage % was high. Coverage of the failure mode was zero.

## 6. Prevention — process changes

The central rule we are adopting:

> **Use the documented, standard, vendor-blessed path before
> inventing one. If a hand-rolled alternative is unavoidable, name
> the standard path, name why it is insufficient, and accept the
> cost of bespoke tests + bespoke maintenance.**

Lift these into `docs/09-testing.md`, `docs/01-architecture.md`,
and the `architect` / `code-reviewer` / `typescript-reviewer` agent
prompts.

### 6.1 Mandatory "standard path" check (any non-trivial change)

Before writing any new code that touches an external system — file
I/O, network, storage SDK, auth, crypto, image/audio/video, native
bridge, IPC, queueing, caching, dates, money, identifiers — the
implementer (human or agent) must answer in writing:

1. **What is the standard, documented way to do this?** Cite the
   vendor doc, RFC, MDN page, or framework guide. "I think..." is
   not an answer.
2. **Are we doing it that way?** If yes, proceed. If no, continue.
3. **Why not?** Concrete, specific, falsifiable reason. "It felt
   cleaner", "I wanted DI", and "I didn't know about it" are not
   reasons.
4. **What does our hand-rolled alternative cost?** Bespoke tests,
   bespoke memory/perf analysis, bespoke maintenance, the support
   surface when the platform vendor changes their happy path.

If any of (1)–(4) cannot be answered, the design is not ready to
implement.

### 6.2 Architect pass for any "interesting" I/O

Any change that reads or writes a file, image, audio, video, large
JSON, or arbitrary blob must go through the `architect` subagent
before implementation, with explicit answers to:

- What is the standard primitive (per §6.1)?
- What is the realistic *p95* input size? (Photos: 12 MB. Videos:
  200 MB. Voice notes: 10 MB.)
- How many copies of the payload exist simultaneously, and in which
  heap (JS vs. native)?
- Is there a streaming path? If we are not using it, why?

### 6.3 Realistic-size fixtures

Add `apps/mobile/__tests__/fixtures/large-photo.jpg` (~10 MB, LFS)
and at least one upload test that runs end-to-end through the real
`uriToBlob` path against it. Guard memory with a budget assertion
where possible. The rule generalizes: when the standard path is
bypassed, the test fixture must look like real production input,
not like the smallest thing that compiles.

### 6.4 "Trust the bug report, then the architecture"

When a user reports a platform-specific crash:

1. Reproduce on the *reported platform first*. Simulator-only repro
   attempts are deferred until after we have a device-side log.
2. Read the bug-adjacent code paths *before* adding logging or tests.
   Specifically: when the symptom involves binary, native, or memory,
   open the code that touches binary, native, or memory.
3. Treat green unit tests as evidence of nothing when the symptom is
   memory, native, or runtime.
4. When the offending code is a bespoke replacement for a standard
   primitive (per §6.1), suspect the bespoke code first.

### 6.5 Lint / CI guardrails — "banned without justification"

Add a CI grep that flags any of the following in app code without a
`// justified-deviation: <reason>` comment on the same line or
immediately above. The list is the **specific** symptoms of the
general disease (custom code where a standard path exists). Grow it
when we find new ones; do not delete entries:

```
# Custom binary pipelines instead of fetch().blob() / Blob upload
readAsStringAsync\(.+Base64
EncodingType\.Base64
\batob\(
Buffer\.from\([^)]*['"]base64

# Hand-rolled date math instead of date-fns / Temporal
(getTime|valueOf)\(\)\s*[+-]\s*\d+\s*\*\s*\d+\s*\*
new Date\([^)]*\.getFullYear\(\)

# Hand-rolled crypto / IDs instead of crypto.randomUUID() / WebCrypto
Math\.random\(\).*(token|id|secret|nonce|key)

# Hand-rolled SQL escaping / string concatenation in queries
`SELECT [^`]*\$\{

# Hand-rolled JSON parse-then-validate instead of zod / valibot at boundary
JSON\.parse\(.+\) as [A-Z]
```

False positives are acceptable; the goal is to force a one-line
justification that names the standard alternative and why it does
not fit.

### 6.6 Agent prompt patches

Add to the `architect` and `typescript-reviewer` system prompts
(verbatim, paste into `~/.claude/agents/`, `.opencode/agents/`,
`.github/agents/`):

> **Standard-path-first rule.** Before proposing or accepting any
> implementation, ask: "What is the documented, vendor-blessed,
> standard way to do this?" If a standard path exists, use it. If
> the design diverges, the divergence must (a) name the standard
> path, (b) explain in one sentence why it is insufficient, and (c)
> commit to the bespoke test + memory/perf budget that the standard
> path would have given for free.
>
> Anti-patterns to flag as HIGH on sight, regardless of input size:
> 1. Hand-rolled binary codecs in JS (`atob`, `btoa`,
>    `Buffer.from(..., 'base64')`, `readAsStringAsync(..Base64)`,
>    char-code loops) when a `Blob`/`fetch`/`ReadableStream` exists.
> 2. Hand-rolled date arithmetic when `date-fns` / `Temporal` is
>    available.
> 3. `Math.random()` for IDs, tokens, nonces, secrets, anything
>    security-adjacent.
> 4. String-interpolated SQL / shell / HTML when a parameterized API
>    exists.
> 5. Inline JSON validation by type assertion when zod/valibot is
>    in the project.
> 6. Any new abstraction that wraps exactly one call to a standard
>    library function with no added behavior.

Add to `code-reviewer`:

> When you see a custom helper, ask: **does this replace a one-line
> call to a standard library or vendor SDK function?** If yes, that
> is a HIGH finding unless the PR description names the standard
> path and gives a concrete reason it does not fit.

### 6.7 Smell list — pin to the agent context

These should trigger an immediate "name the standard path or
refactor" response from any reviewer agent:

1. A hand-rolled binary, date, crypto, ID, parsing, SQL, or HTML
   pipeline where a stdlib / SDK / framework primitive exists.
2. A loop in JS that copies bytes from one buffer to another for any
   user file > 1 MB.
3. Tests that mock the I/O primitive being changed (you are not
   testing the change, you are testing the mock).
4. A new utility module whose entire body is a thin renaming of a
   standard function (`function uploadFile(...) { return supabase...
   }` adds nothing — call the SDK directly).

## 7. What actually fixed it

- `5b1df4c` — `lib/uploads/blob.ts` (`uriToBlob`), removes ~30 lines
  of `atob` glue, peak heap drops from ~3.3× → ~0×.
- Same commit adds `expo-build-properties` plugin with
  `android.largeHeap: true` for headroom on legacy devices.
- The rest of `feat/media-pipeline` (upload queue, in-app camera,
  background upload, foreground service, optimistic UI) is the longer
  fix that prevents *recurrence* by removing the OS camera intent
  altogether.

## 8. Action items

- [ ] Land `feat/media-pipeline` PR-1..PR-8 in sequence per
      [docs/10-media-pipeline.md](../10-media-pipeline.md).
- [ ] Add the CI grep guard from §6.5 (start with the base64 +
      date + Math.random + SQL-interpolation entries; grow the list
      every retro).
- [ ] Patch agent prompts per §6.6–6.7 — add the
      **standard-path-first rule** + smell list to
      `~/.claude/agents/architect.md`, `typescript-reviewer.md`,
      `code-reviewer.md`, and the equivalents under
      `.opencode/agents/` and `.github/agents/`.
- [ ] Add `large-photo.jpg` fixture + memory-budget upload test.
- [ ] Update `docs/09-testing.md` with the realistic-fixture rule and
      the "test the change, not the mock" anti-pattern.
- [ ] Add a "standard-path-first" section to
      [docs/01-architecture.md](../01-architecture.md) listing
      banned hand-rolled patterns (binary codecs, date math, ID
      generation, SQL interpolation, inline JSON validation) and the
      blessed alternatives.
