/**
 * Catalog of every `testID="btn-*"` rendered by the app, classified by risk.
 *
 * The companion gate `press-test-coverage.test.ts` enforces three things:
 *
 *   1. **No orphan**: every `testID="btn-..."` found in the source tree
 *      must appear here. Adding a new button is a deliberate decision and
 *      this file is where that decision gets recorded.
 *
 *   2. **No phantom**: every entry here must exist in the source tree.
 *      Renamed or removed buttons get caught immediately.
 *
 *   3. **Risky buttons must be covered**: any entry with a non-empty
 *      `risks` array must have either a unit press-and-invoke test
 *      (auto-detected: `testID` referenced inside any `*.test.*` file)
 *      OR a Maestro flow (auto-detected: `testID` referenced inside
 *      `.maestro/**`). Buttons whose `risks` is empty may set
 *      `exempt: "<reason>"` to document the deliberate non-coverage.
 *
 * Why not "every button must have a unit press test"?
 * -------------------------------------------------
 * ~70% of buttons in this app are pure navigation or state toggles
 * (`router.push(...)`, `setActiveTab(...)`, `setIsModalOpen(true)`).
 * A unit test for those re-asserts the React click model and adds
 * maintenance cost without raising the floor. The risk taxonomy below
 * targets the failure modes that DID slip through (e.g. the iOS
 * `NSCameraUsageDescription` crash that hid behind silent `void
 * handler()` calls): native-permission, mutation, destructive, auth.
 */

export type Risk =
  | "native-permission" // calls expo-image-picker / expo-audio / DocumentPicker etc.
  | "mutation" // triggers a TanStack mutation or network write
  | "destructive" // deletes or otherwise irreversibly mutates data
  | "auth"; // sign-in / sign-out / OTP / password change

export interface CatalogEntry {
  /** The exact `testID` string (without the `btn-` discrimination — full ID). */
  testID: string;
  /** Empty for navigation-only / state-only buttons. */
  risks: Risk[];
  /** Required when `risks` is empty AND the button is intentionally not tested. */
  exempt?: string;
  /**
   * For aliased buttons that invoke the same handler as another testID — e.g.
   * draft-menu shortcuts that re-trigger `btn-finalize-report`'s handler. The
   * gate considers the button covered iff at least one of these IDs is
   * covered. Use sparingly; only when the handler is literally the same
   * function/closure, not just "similar logic".
   */
  sharedHandlerWith?: string[];
  /** Optional free-form note (links to PR, design rationale, etc.). */
  notes?: string;
}

export const PRESS_TEST_CATALOG: readonly CatalogEntry[] = [
  // ── Auth (app/index.tsx, app/signup.tsx) ─────────────────────────────────
  {
    testID: "btn-login-send-code",
    risks: ["auth", "mutation"],
    notes: "Triggers Supabase signInWithOtp; covered by Maestro auth flow.",
  },
  {
    testID: "btn-login-verify-code",
    risks: ["auth", "mutation"],
    notes: "Verifies OTP and creates a session; covered by Maestro auth flow.",
  },
  {
    testID: "btn-login-change-number",
    risks: [],
    exempt: "State toggle: returns to phone-entry step. No side effect.",
  },
  {
    testID: "btn-signup-verify",
    risks: ["auth", "mutation"],
    notes: "Verifies OTP on the signup path; covered by Maestro auth flow.",
  },

  // ── Profile (app/profile.tsx) ────────────────────────────────────────────
  {
    testID: "btn-open-profile",
    risks: [],
    exempt: "Pure navigation: pushes /profile.",
  },
  {
    testID: "btn-open-ai-model",
    risks: [],
    exempt: "Pure navigation: pushes /profile/ai-model.",
  },
  {
    testID: "btn-open-usage",
    risks: [],
    exempt: "Pure navigation: pushes /profile/usage.",
  },
  {
    testID: "btn-clear-cache",
    risks: ["destructive"],
    notes: "Clears AsyncStorage + image cache; covered by Maestro profile flow.",
  },
  {
    testID: "btn-sign-out",
    risks: ["auth", "destructive"],
    notes: "Calls Supabase signOut; covered by Maestro profile/auth flows.",
  },
  {
    testID: "btn-avatar-upload",
    risks: ["native-permission", "mutation"],
    notes:
      "Photo library + uploadAvatar + updateProfile chain. Unit-tested in components/account/AvatarUploader.test.tsx.",
  },

  // ── Projects list (app/(tabs)/projects.tsx, app/projects/new.tsx) ────────
  {
    testID: "btn-new-project",
    risks: [],
    exempt: "Pure navigation: pushes /projects/new.",
  },
  {
    testID: "btn-submit-project",
    risks: ["mutation"],
    notes: "Creates a project via supabase insert; covered by Maestro projects flow.",
  },

  // ── Project detail (app/projects/[projectId]/index.tsx) ──────────────────
  {
    testID: "btn-edit-project",
    risks: [],
    exempt: "Pure navigation: pushes /projects/[id]/edit.",
  },
  {
    testID: "btn-open-reports",
    risks: [],
    exempt: "Pure navigation: pushes /projects/[id]/reports.",
  },
  {
    testID: "btn-open-members",
    risks: [],
    exempt: "Pure navigation: pushes /projects/[id]/members.",
  },
  {
    testID: "btn-copy-address",
    risks: [],
    exempt:
      "Clipboard write of static project field; no network/destructive action.",
  },
  {
    testID: "btn-copy-client",
    risks: [],
    exempt:
      "Clipboard write of static project field; no network/destructive action.",
  },

  // ── Project edit (app/projects/[projectId]/edit.tsx) ─────────────────────
  {
    testID: "btn-delete-project",
    risks: ["destructive", "mutation"],
    notes: "Soft-delete project; covered by Maestro projects flows.",
  },
  {
    testID: "btn-save-project",
    risks: ["mutation"],
    notes: "Updates project row; covered by Maestro projects flows.",
  },

  // ── Members (app/projects/[projectId]/members.tsx + AddMemberSheet) ──────
  {
    testID: "btn-add-member",
    risks: [],
    exempt: "Opens the AddMemberSheet modal — pure UI state.",
  },
  {
    testID: "btn-submit-member",
    risks: ["mutation"],
    notes: "Inserts project_member row; covered by Maestro members flows.",
  },

  // ── Reports list (app/projects/[projectId]/reports/index.tsx) ────────────
  {
    testID: "btn-new-report",
    risks: [],
    exempt: "Pure navigation: pushes /projects/[id]/reports/generate.",
  },

  // ── Generate report screen (app/projects/[projectId]/reports/generate.tsx)
  {
    testID: "btn-tab-notes",
    risks: [],
    exempt: "Tab switch — UI state only.",
  },
  {
    testID: "btn-tab-report",
    risks: [],
    exempt: "Tab switch — UI state only.",
  },
  {
    testID: "btn-tab-edit",
    risks: [],
    exempt:
      "Tab switch (with lazy blank-report seed) — covered by unit tests in __tests__/generate-screen-edit-tab.test.tsx.",
  },
  {
    testID: "btn-edit-manually",
    risks: [],
    exempt:
      "Empty-state CTA seeds a blank report and switches tab — covered by unit tests in __tests__/generate-screen-edit-tab.test.tsx.",
  },
  {
    testID: "btn-attachment",
    risks: [],
    exempt:
      "Opens the attachment AppDialogSheet — UI state only. Sheet's actions are unit-tested separately.",
  },
  {
    testID: "btn-menu-add-document",
    risks: ["mutation"],
    sharedHandlerWith: ["btn-attachment"],
    notes:
      "Draft-menu shortcut: same `handleMenuPick(\"document\")` invoked by the attachment sheet's Document action (unit-tested in __tests__/generate-screen-edit-tab.test.tsx).",
  },
  {
    testID: "btn-menu-add-photo",
    risks: ["native-permission", "mutation"],
    sharedHandlerWith: ["btn-attachment"],
    notes:
      "Draft-menu shortcut: same `handleMenuPick(\"image\")` invoked by the attachment sheet's Photo Library action (unit-tested in __tests__/generate-screen-edit-tab.test.tsx).",
  },
  {
    testID: "btn-menu-finalize",
    risks: ["mutation"],
    sharedHandlerWith: ["btn-finalize-report"],
    notes:
      "Draft-menu shortcut: same `setIsFinalizeConfirmVisible(true)` flow as btn-finalize-report (unit-tested in __tests__/generate-screen-edit-tab.test.tsx).",
  },
  {
    testID: "btn-menu-rebuild",
    risks: ["mutation"],
    sharedHandlerWith: ["btn-generate-update-report"],
    notes:
      "Draft-menu shortcut: same `handleRegenerate()` flow as btn-generate-update-report (unit-tested in __tests__/generate-screen-edit-tab.test.tsx).",
  },
  {
    testID: "btn-dismiss-file-upload-error",
    risks: [],
    exempt: "Closes the upload-error AppDialogSheet — UI state only.",
  },
  {
    testID: "btn-add-note",
    risks: ["mutation"],
    notes:
      "Creates a text note via report_notes mutation; covered by Maestro notes/voice-notes flows.",
  },
  {
    testID: "btn-camera-capture",
    risks: ["native-permission", "mutation"],
    notes:
      "Camera + preprocess + upload chain. Unit-tested in __tests__/generate-screen-edit-tab.test.tsx; Maestro coverage in voice-notes flows.",
  },
  {
    testID: "btn-record-start",
    risks: ["native-permission", "mutation"],
    notes:
      "Starts useSpeechToText().start() (microphone). Unit-tested in __tests__/generate-screen-edit-tab.test.tsx.",
  },
  {
    testID: "btn-record-stop",
    risks: ["native-permission", "mutation"],
    notes:
      "Stops useSpeechToText().stop() and persists the voice note. Unit-tested in __tests__/generate-screen-edit-tab.test.tsx.",
  },
  {
    testID: "btn-generate-update-report",
    risks: ["mutation"],
    notes:
      "Triggers the LLM generation mutation. Unit-tested in __tests__/generate-screen-edit-tab.test.tsx.",
  },
  {
    testID: "btn-finalize-report",
    risks: ["mutation"],
    notes:
      "Finalizes the report row (irreversible without admin). Unit-tested in __tests__/generate-screen-edit-tab.test.tsx.",
  },
  {
    testID: "btn-draft-menu",
    risks: ["destructive"],
    notes:
      "Opens the draft kebab menu (parent of btn-delete-draft). Unit-tested in components/reports/DeleteDraftButton.test.tsx.",
  },
  {
    testID: "btn-delete-draft",
    risks: ["destructive"],
    notes:
      "Soft-deletes the draft report. Unit-tested in components/reports/DeleteDraftButton.test.tsx.",
  },

  // ── Report detail (app/projects/[projectId]/reports/[reportId].tsx) ──────
  {
    testID: "btn-back",
    risks: [],
    exempt: "router.back() — pure navigation.",
  },
  {
    testID: "btn-report-actions",
    risks: [],
    exempt: "Opens the report actions sheet — UI state only.",
  },
  {
    testID: "btn-report-view-pdf",
    risks: [],
    exempt: "Opens the in-app PDF preview — UI state only.",
  },
  {
    testID: "btn-report-save-pdf",
    risks: ["mutation"],
    notes:
      "Saves the rendered PDF to device storage; covered by Maestro reports flows.",
  },
  {
    testID: "btn-report-share-pdf",
    risks: [],
    exempt:
      "Invokes Sharing.shareAsync on a previously rendered PDF; no app-state mutation.",
  },
  {
    testID: "btn-report-delete",
    risks: ["destructive", "mutation"],
    notes:
      "Soft-deletes the report; covered by Maestro reports/delete flows.",
  },
  {
    testID: "btn-pdf-open-externally",
    risks: [],
    exempt: "Opens the system PDF viewer — no app-state mutation.",
  },
  {
    testID: "btn-close-image-preview",
    risks: [],
    exempt: "Closes the image preview modal — UI state only.",
  },
];
