# Mobile UX/UI Audit And Improvement Plan

Written: 2026-04-20

This document is the working source of truth for the current mobile app UX audit and the first redesign pass for `apps/mobile`. It is based on the screenshot set provided in this thread and grounded in the current Expo Router + NativeWind implementation in this repo.

## Executive Summary

The app already has a strong workflow fit for construction reporting: sites, reports, field notes, report generation, issues, weather, manpower, and next steps all reflect a real jobsite workflow. The biggest gap is not product logic, but presentation and trust. The mobile UI currently feels closer to a credible MVP than a polished field product.

Top 5 product/design problems:

1. **Hierarchy is too flat.**
   Cards, list rows, buttons, stat tiles, and inputs rely on very similar borders, padding, and text weight, so important actions and information do not stand out enough.

2. **Terminology and navigation are inconsistent.**
   The UI mixes `Projects`, `Sites`, `Reports`, `Back`, `Back to Sign In`, and screen-specific back labels in a way that adds avoidable friction.

3. **High-value field workflows do not feel guided enough.**
   The new-report flow has a strong concept, but it needs clearer progress, stronger prompts, and better action hierarchy so crews can move faster with more confidence.

4. **The product leaks internal/development details.**
   `Delete (v3)`, raw environment strings, and visible development affordances reduce trust, even when the underlying product behavior is good.

5. **Scanability in field conditions needs work.**
   Several screens use low-contrast gray text, narrow action emphasis, and repetitive stacked cards that are harder to read outdoors or quickly while moving.

## Current State

### Stack and constraints

- Mobile app: Expo 55 + React Native + Expo Router
- Styling: NativeWind with shared primitives in `apps/mobile/components/ui`
- Data/state: TanStack Query + Supabase
- Report generation flows:
  - Route screens: `apps/mobile/app/projects/[projectId]/reports/*`
  - Report components: `apps/mobile/components/reports/*`
- Existing docs already live in `docs/`, so this audit belongs in the repo’s normal documentation structure.

### Screenshot-to-route map

- Sign in: `apps/mobile/app/index.tsx`
- Create account: `apps/mobile/app/signup.tsx`
- Onboarding/profile completion: `apps/mobile/app/onboarding.tsx`
- Sites tab: `apps/mobile/app/(tabs)/projects.tsx`
- Profile tab: `apps/mobile/app/(tabs)/profile.tsx`
- Account details: `apps/mobile/app/account.tsx`
- New site form: `apps/mobile/app/projects/new.tsx`
- Edit site form: `apps/mobile/app/projects/[projectId]/edit.tsx`
- Site reports list: `apps/mobile/app/projects/[projectId]/reports/index.tsx`
- Report creation / live generation: `apps/mobile/app/projects/[projectId]/reports/generate.tsx`
- Report detail: `apps/mobile/app/projects/[projectId]/reports/[reportId].tsx`

## Design Direction

- Keep the current **light theme** and **serious construction tone**.
- Standardize the user-facing label to **Sites** in the UI, while leaving route names and database table names as `projects` to avoid unnecessary churn.
- Optimize the first redesign pass for:
  - faster scanning,
  - stronger visual hierarchy,
  - better outdoor readability,
  - clearer action prioritization,
  - fewer “internal tool” cues,
  - safer destructive actions.

## Screen-By-Screen Audit

### 1. Sign in

Current strengths:

- Clear job-to-be-done.
- Good single-primary-action flow.
- Demo login is useful in development.

Issues:

- Too much empty vertical space.
- OTP step feels abrupt and lightly guided.
- Error/info states do not have enough structure.
- Raw Supabase URL lowers trust and should not be visible.

Improve:

- Pull the content higher on the screen.
- Add structured inline notices for OTP states.
- Add hint text for phone formatting and expected verification flow.
- Keep demo accounts visibly marked as development-only.

### 2. Create account

Current strengths:

- The 3-step flow is conceptually solid.
- Data collection is lightweight.

Issues:

- Stepper is technically present but visually weak.
- Back-label conventions are inconsistent.
- The flow does not reassure users what comes next.

Improve:

- Make the stepper more legible and more obviously progressive.
- Standardize the back affordance.
- Add contextual helper copy for phone verification and code entry.

### 3. Sites list

Current strengths:

- The list is readable.
- The “new site” action is easy to find.

Issues:

- Site cards are visually similar and low-signal.
- Metadata is useful but understated.
- The screen header is serviceable, but not polished.

Improve:

- Use stronger list-row hierarchy.
- Increase contrast between site name and metadata.
- Keep “Sites” terminology consistent across tabs and back navigation.

### 4. Reports list

Current strengths:

- The report list is straightforward.
- Draft vs final behavior already exists in the data.

Issues:

- Rows are too visually similar.
- Site context, draft state, and report timing could be easier to scan.
- Edit-site and create-report actions compete too evenly.

Improve:

- Use clearer row emphasis, draft badges, and metadata grouping.
- De-emphasize edit-site relative to new-report.
- Improve the empty state so it feels intentional.

### 5. New report / live generation

Current strengths:

- This is the strongest product concept in the app.
- Real-time voice-or-text note capture is valuable and differentiated.
- Completeness guidance is already pointing in the right direction.

Issues:

- The screen currently feels more functional than confident.
- The notes/report tabs need stronger hierarchy.
- Empty states and update notices are useful but look utilitarian.
- “Regenerate from Scratch” is too prominent for a risky secondary action.
- Debug mode is appropriately dev-gated in code, but the main surface still needs clearer production-facing polish.

Improve:

- Treat this as the flagship workflow.
- Make note capture the clear primary behavior.
- Convert completeness guidance into more intentional prompt chips / missing-topic guidance.
- Use calmer, more structured status notices for autosave and report updates.
- Make finalize primary and regenerate secondary.

### 6. Report detail

Current strengths:

- The report content itself is strong and domain-specific.
- Stats, weather, issues, next steps, and sections all reflect useful field information.

Issues:

- The screen reads as a long stack of similarly weighted cards.
- The top summary does not yet deliver an instant “what happened today” read.
- Destructive and export actions need clearer prioritization.

Improve:

- Strengthen the top header and metadata area.
- Keep report metrics highly visible at the top.
- Make export actions secondary and destructive actions tertiary/guarded.
- Reduce repeated “everything is a bordered box” feeling by improving section rhythm.

### 7. Profile

Current strengths:

- The screen has the right high-level content groups.
- Usage and account details are relevant.

Issues:

- It mixes normal user settings with internal AI-provider control.
- Account blocks and settings rows still feel visually flat.
- Sign out needs to remain visible without dominating the screen.

Improve:

- Keep account information first.
- Hide AI-provider selection unless it is genuinely needed for the current user audience.
- Make the settings list feel more product-grade and less placeholder-like.

### 8. Account details

Current strengths:

- Clear and simple.

Issues:

- Read-only fields look too similar to editable fields.
- The screen feels unfinished because there is little structure around the data.

Improve:

- Use read-only input styling explicitly.
- Add a small contextual explanation of what can be edited elsewhere vs what is fixed.

### 9. Site create/edit forms

Current strengths:

- The forms are short and task-focused.

Issues:

- “Project” terminology is user-visible.
- Delete site/project actions are too prominent relative to save.
- Form feedback is unstructured.

Improve:

- Rename the user-facing surface to `Site`.
- Move destructive actions into a lower-emphasis treatment.
- Use shared input help/error treatment consistently.

## Cross-Cutting Findings

### Hierarchy

- Main issue: too many containers share the same border, fill, and weight.
- Fix by introducing emphasis levels in shared cards, stat tiles, notices, and list rows.

### Terminology

- Standardize UI copy to `Sites`.
- Keep route and data model names as `projects` for now.

### Navigation

- Standardize back placement and label style.
- Use context labels only when they add clarity: `Sites`, `Reports`, `Sign In`, otherwise default to `Back`.

### Action prioritization

- One primary action per screen.
- Supportive actions should be clearly secondary.
- Destructive actions should never visually compete with the primary flow.

### Contrast and field usability

- Increase contrast between primary text and secondary text.
- Preserve a light theme but reduce washed-out gray-on-beige combinations.
- Keep targets at least touch-friendly and easy to hit on smaller phones.

### Empty states

- Current empty states are informative but bare.
- Improve with clearer titles, descriptions, and optional actions.

### Dev-artifact leakage

- Remove or gate:
  - raw env strings,
  - unstable version labels like `Delete (v3)`,
  - internal/provider-only settings from normal user flows.
- Note: Metro overlays and Expo dev affordances come from the development runtime rather than the app UI itself; they should not be used as production design references.

## Prioritized Backlog

### P0 now

- Standardize user-facing `Sites` terminology.
- Improve shared UI tokens and primitives.
- Remove raw environment leakage from auth.
- Hide AI-provider settings from normal users.
- Improve sign-in, signup, sites list, reports list, report generation, report detail, account, and site form hierarchy.
- De-emphasize destructive actions and keep confirmations.

### P1 next

- Add search/filter/grouping on sites and reports.
- Add a more explicit anchor or quick-jump pattern on long report detail screens.
- Improve offline/cache management and notification surfaces.
- Introduce stronger section summaries and change tracking in report generation.

### P2 later

- Full visual brand refinement.
- More sophisticated site/report analytics surfaces.
- More granular role-aware settings.
- Stronger accessibility auditing for type scaling and screen reader behavior.

## Step-By-Step Implementation Plan

### 1. Strengthen the design system

Target files:

- `apps/mobile/tailwind.config.js`
- `apps/mobile/components/ui/Button.tsx`
- `apps/mobile/components/ui/Card.tsx`
- `apps/mobile/components/ui/Input.tsx`
- New shared primitives under `apps/mobile/components/ui/`

Changes:

- Add semantic status colors for info, warning, danger, and success.
- Add clearer text tiers and touch-target sizing.
- Expand button variants into primary, secondary, outline, quiet, and destructive behaviors.
- Add card emphasis levels so every section does not look identical.
- Add shared primitives:
  - `ScreenHeader`
  - `SectionHeader`
  - `StatTile`
  - `EmptyState`
  - `InlineNotice`

### 2. Clean up trust issues immediately

Target screens:

- `apps/mobile/app/index.tsx`
- `apps/mobile/app/(tabs)/profile.tsx`
- `apps/mobile/app/projects/[projectId]/reports/[reportId].tsx`
- `apps/mobile/app/projects/[projectId]/reports/generate.tsx`

Changes:

- Remove raw env strings from sign-in.
- Keep debug UI dev-only.
- Remove unstable/destructive copy leakage.
- Hide AI-provider controls unless the current audience explicitly needs them.

### 3. Redesign high-value flows

Auth and onboarding:

- `apps/mobile/app/index.tsx`
- `apps/mobile/app/signup.tsx`
- `apps/mobile/app/onboarding.tsx`

Changes:

- Reduce dead space.
- Add better OTP/state guidance.
- Improve step clarity and perceived progress.

Sites and reports:

- `apps/mobile/app/(tabs)/projects.tsx`
- `apps/mobile/app/projects/[projectId]/reports/index.tsx`

Changes:

- Improve row hierarchy, metadata grouping, and empty states.
- Keep create actions clearly primary.

Reporting workflow:

- `apps/mobile/app/projects/[projectId]/reports/generate.tsx`
- `apps/mobile/app/projects/[projectId]/reports/[reportId].tsx`
- `apps/mobile/components/reports/*`

Changes:

- Improve generation status notices and completeness hierarchy.
- Keep note capture primary.
- Make regenerate visually secondary.
- Strengthen top-of-report scanability and issue emphasis.

Settings and forms:

- `apps/mobile/app/(tabs)/profile.tsx`
- `apps/mobile/app/account.tsx`
- `apps/mobile/app/projects/new.tsx`
- `apps/mobile/app/projects/[projectId]/edit.tsx`

Changes:

- Separate account info from internal settings.
- Make read-only vs editable surfaces distinct.
- Rename UI copy from project to site.

## AI Workflow

### Primary recommendation

Use Claude/Codex directly against this repo for implementation after the audit doc is written. This is the best fit because the product already exists as an Expo/React Native app with NativeWind and shared UI primitives. The codebase, not an external mockup tool, should remain the source of truth.

### Optional tool usage

- **Google Stitch**: useful for quickly exploring 2 to 3 alternate mobile directions before implementation. Good for structure, design rules, and idea divergence, not as the implementation source of truth for this React Native app.
- **Figma Make**: useful when stakeholder review or design collaboration matters and you want a more explicit design artifact before code.
- **v0**: acceptable for isolated idea exploration, but not recommended as the main redesign path here because the product already exists in Expo/React Native and v0 is more naturally aligned to web/Tailwind-centric flows.

### Claude/Codex prompt template

Use prompts like this instead of vague “make it better” requests:

```md
Update `apps/mobile/app/projects/[projectId]/reports/generate.tsx` and any shared UI primitives it uses.

Context:
- This is the flagship workflow for field users on phones.
- Users are on construction sites, often outdoors, and need fast scanability with high contrast.
- Keep the current light theme and serious construction tone.

Goals:
- Make note capture feel like the primary task.
- Improve the hierarchy between Notes, Report, and any status feedback.
- Make "Finalize Report" the clear primary action.
- Make regenerate/retry actions clearly secondary.

Constraints:
- Reuse or extend shared primitives in `apps/mobile/components/ui`.
- Preserve current behavior and route structure.
- Do not expose debug-only tooling in production UI.
- Preserve existing test IDs and update Maestro flows only when labels change.

Testing:
- Update any relevant unit tests for new helper logic.
- Update or add Maestro coverage for the changed flow where practical.
```

### Prompt checklist

Every implementation prompt should specify:

- target screen or component path,
- who the user is,
- when they use the screen,
- the desired visual direction,
- light-theme and high-contrast constraints,
- which shared components must be reused or extended,
- which test IDs or Maestro flows must be preserved.

## Acceptance Checklist

- No raw environment or internal-only text is visible in normal production UI.
- User-facing terminology uses `Sites` consistently.
- Every screen has one clear primary action.
- Destructive actions are visually de-emphasized and guarded.
- Text contrast is improved for field readability.
- Long report screens are easier to scan from the top down.
- Read-only account data looks different from editable form fields.
- Empty states feel intentional rather than placeholder-like.
- Updated flows preserve route behavior and core reporting logic.
- Relevant unit and Maestro coverage are updated where practical.

## Sources For AI Tool Guidance

- Google Stitch announcement:
  https://blog.google/innovation-and-ai/models-and-research/google-labs/stitch-ai-ui-design/
- Figma Make:
  https://www.figma.com/make/
- Figma Make developer docs:
  https://developers.figma.com/docs/code/intro-to-figma-make/
- v0 docs:
  https://v0.app/docs
- v0 Design Mode:
  https://v0.app/docs/design-mode
- Vercel prompt guidance for v0:
  https://vercel.com/blog/how-to-prompt-v0
