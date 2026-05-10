# mobile-v2 — Design Docs

A from-scratch rewrite of [apps/mobile](../../mobile/) into [apps/mobile-v2](../).
Same product, same visual design, ~50% fewer lines of code, designed to absorb every
recurring-bug pattern (R1–R11) from [docs/bugs/README.md](../../../docs/bugs/README.md).

> **Status:** design phase. No app code yet — only the documents in this folder.
> The first implementation phase ("Phase 0 — Scaffold") is the entry point in
> [05-migration-plan.md](05-migration-plan.md).

## Read in this order

> **Read [06-design-principles.md](06-design-principles.md) FIRST.** It overrides
> the docs below where they conflict. The other docs were generated against an
> over-strict initial brief; the principles doc captures the actual stance on
> code style, props, types, server sync, and migration strictness.

| # | Doc | What it answers |
|---|-----|-----------------|
| 6 | [06-design-principles.md](06-design-principles.md) | **Authoritative.** Style, components, types, sync model, pre-release migration stance. Wins on conflict. |
| 0 | [00-current-state.md](00-current-state.md) | What does v1 look like today? Routes, hotspots, libraries, patterns, smells. |
| 1 | [01-lessons-learned.md](01-lessons-learned.md) | What v1 bugs taught us. R-pattern taxonomy and design rules v2 must honour. |
| 2 | [02-architecture.md](02-architecture.md) | High-level shape: module boundaries, data layer, upload pipeline, audio, routing, ADRs. |
| 3 | [03-implementation.md](03-implementation.md) | Code-level conventions: folder tree, libraries, components, hooks, forms, dialogs, tests, lint, CI. Treat "max length" rules as advisory only — see principles doc. |
| 4 | [04-testing-strategy.md](04-testing-strategy.md) | Test pyramid, Vitest setup, RLS rule, Maestro rules, per-feature checklist, R-pattern regression mapping. |
| 5 | [05-migration-plan.md](05-migration-plan.md) | Phased ordering reference. Ignore the cutover/rollback choreography — we have no users; we just delete v1 when v2 is at parity. |

## Non-negotiables (carried over from v1)

These are encoded across the docs above; surfaced here so they cannot be missed.

- **Backend is fixed.** Supabase Postgres + RLS + Edge Functions are not rewritten.
- **RLS test rule.** Any v2 change that affects how the client reads/writes a Postgres table ships with a real-DB test in `supabase/tests/rls_*.test.ts`. See [AGENTS.md](../../../AGENTS.md) and [04-testing-strategy.md](04-testing-strategy.md).
- **Maestro testID parity.** v1's Maestro flows in [apps/mobile/.maestro](../../mobile/.maestro/) are the contract. v2 ships a typed `testIds` registry so renames break TypeScript first ([03-implementation.md](03-implementation.md) §12).
- **Standard-path-first.** No hand-rolled base64, no `Math.random()` IDs, no raw `Alert.alert`, no mocking the I/O primitive being changed. See [/Users/patchin/.claude/rules/common/standard-path-first.md](../../../../.claude/rules/common/standard-path-first.md).
- **Fixture mode plumbing preserved.** `EXPO_PUBLIC_E2E_MOCK_VOICE_NOTE` and the `USE_FIXTURES` edge-function flag work identically.
- **Hermes/iOS UUID quirk.** Use the blessed `expo-crypto.randomUUID()` → `globalThis.crypto.randomUUID()` chain. Never a `<time>-<rand>` fallback (PostgREST 400). See [01-lessons-learned.md](01-lessons-learned.md).

## Delivery model

Implementation will be driven by subagents per [05-migration-plan.md](05-migration-plan.md).
Each phase ships a runnable app and its own PR series. After every coding PR:

1. `code-reviewer` subagent.
2. `security-reviewer` subagent if the diff touches auth, RLS, user input, or sensitive data.
3. `database-reviewer` subagent if the diff touches schema, RPCs, or RLS.
4. Bug-log update if a bug recurred or almost-recurred (per [AGENTS.md](../../../AGENTS.md)).

## Cutover

We are pre-release with no users. When v2 hits feature parity:
`git rm -rf apps/mobile`, then `git mv apps/mobile-v2 apps/mobile`, update
EAS slug + root scripts, ship. No `apps/mobile-legacy/` parking lot, no OTA
rollback rehearsal. The history is in git. See
[06-design-principles.md](06-design-principles.md) §7.
