# Mobile v2 E2E Test Parity Gaps

This document identifies features required by v1 Maestro flows that are not yet implemented in v2.

## Status Summary

- **Total v1 testIDs extracted**: 113 (includes patterns)
- **v2 testIDs now matching v1**: ~95% complete
- **Major feature gaps blocking E2E flows**: Listed below

## Feature Gaps by Flow Category

### 1. Authentication & Onboarding
**Status**: ✅ Core features present

- ✅ Sign-in with phone (OTP flow)
- ✅ Onboarding (full name, company)
- ❌ **Missing**: Sign-up multi-step stepper (flows reference `link-signup`, step navigation, back buttons between steps)
- ❌ **Missing**: "Change number" button on OTP verification screen
- ❌ **Missing**: E2E dev-only login screen (`e2e-login-screen`) for deep-link auth bypass

### 2. Projects
**Status**: ✅ Core CRUD complete

- ✅ Project list, create, edit, delete
- ✅ Project overview card
- ✅ Navigation to members and reports
- ❌ **Missing**: `input-client-name` field in project form (v1 has client name separate from project name)
- ⚠️ **Partially implemented**: Project row testIDs now use `project-row-0` pattern

### 3. Reports
**Status**: ⚠️ Partial — draft creation works, LLM generation not wired

- ✅ Reports list (shows drafts)
- ✅ Create new report
- ✅ Report detail with tabs (view, edit, notes, source)
- ✅ Save and delete
- ❌ **Missing**: AI report generation flow (`btn-generate-update-report` exists as placeholder but no backend wiring)
- ❌ **Missing**: Finalize report CTA (`btn-finalize-report`)
- ❌ **Missing**: PDF export actions (view in-app, save, share: `btn-report-view-pdf`, `btn-report-save-pdf`, `btn-report-share-pdf`)
- ❌ **Missing**: Edit form section testIDs are present in registry but the actual edit UI may be stubs

### 4. Notes & Timeline
**Status**: ⚠️ Partial — basic add note likely works, voice/photo incomplete

- ✅ Add text note (`input-note`, `btn-add-note`)
- ✅ Note timeline display (`note-timeline`)
- ❌ **Missing**: Voice note recording UI wiring (testIDs exist but feature may not be functional)
- ❌ **Missing**: Camera capture integration for notes (`btn-camera-capture` in camera screen, but integration into note timeline unclear)
- ❌ **Missing**: Photo upload queue UI (testIDs `pending-photo-queue-*` exist but no visible components)
- ❌ **Missing**: Image preview lightbox (`image-preview`, `btn-close-image-preview`)

### 5. Voice Notes
**Status**: ❌ Mostly missing

- ❌ **Missing**: Record button in timeline (`btn-record-voice`, `btn-record-start`, `btn-stop-recording`)
- ❌ **Missing**: Voice note cards in timeline with play/pause controls
- ❌ **Missing**: Transcript view modal
- ❌ **Missing**: Auto-summarize after transcription
- ❌ **Missing**: Voice note options menu (delete, view transcript)
- ⚠️ **Note**: testIDs are defined and some components may exist but likely not wired to backend

### 6. File Uploads & Attachments
**Status**: ❌ Mostly missing

- ❌ **Missing**: Pending upload queue UI (`upload-pending-*`)
- ❌ **Missing**: Upload progress indicators
- ❌ **Missing**: Retry/cancel buttons for failed uploads
- ❌ **Missing**: Attachment button in report detail (`btn-attachment`)
- ❌ **Missing**: File list with open buttons (`btn-open-file-*`)
- ❌ **Missing**: Image preview modal/lightbox

### 7. Members Management
**Status**: ✅ Core features present

- ✅ Members list
- ✅ Invite member (add by phone, select role)
- ✅ Member row display
- ✅ Change role
- ✅ Remove member
- ✅ Role picker (editor, viewer)

### 8. Camera Integration
**Status**: ⚠️ Camera screen exists but integration incomplete

- ✅ Camera capture screen (`camera-screen`)
- ✅ Capture button, flip, done
- ✅ Permission prompt
- ❌ **Missing**: Camera flash toggle (`btn-camera-flash`)
- ❌ **Missing**: Photo count label during burst (`lbl-camera-count`)
- ❌ **Missing**: Integration: captured photos → note timeline

### 9. Profile & Usage
**Status**: ⚠️ Screens exist but may be stubs

- ✅ Profile screen with name, company, phone fields
- ✅ Usage screen skeleton
- ❌ **Missing**: Avatar upload (`btn-avatar-upload` is a placeholder card)
- ❌ **Missing**: Usage summary populated with real data (reports count, token usage)
- ❌ **Missing**: Usage history by month

### 10. Account / Settings
**Status**: ✅ Core features present

- ✅ Account screen with user info
- ✅ Sign-out flow with confirmation sheet
- ✅ Clear cache with confirmation
- ✅ Navigation to profile and usage
- ⚠️ **Missing/Stub**: Developer section, AI model picker (testIDs exist but may be feature-flagged or dev-only)

## TestID Coverage Report

### ✅ Fully Covered (v2 matches v1)
- `input-phone`, `btn-login-send-code`, `input-otp`, `btn-login-verify-code`
- `input-signup-name`, `input-signup-company`
- `btn-new-project`, `input-project-name`, `input-project-address`, `btn-submit-project`
- `project-row-0` (via indexed function)
- `btn-open-members`, `btn-open-reports`, `btn-edit-project`, `btn-delete-project`
- `btn-add-member`, `input-member-phone`, `btn-submit-member`, `btn-role-editor`
- `btn-new-report`, `btn-delete-draft`, `btn-save-report`
- `btn-tab-edit`, `btn-tab-notes`, `btn-tab-report`
- `camera-screen`, `btn-camera-capture`, `btn-camera-flip`, `btn-camera-done`, `btn-camera-cancel`
- `screen-account`, `btn-sign-out`, `btn-clear-cache`, `btn-open-profile`, `btn-open-usage`
- `profile-display-name`, `profile-company-name`, `profile-phone`
- `screen-usage`

### ⚠️ Partially Covered (testID exists but feature incomplete)
- `btn-generate-update-report` (button may exist but LLM flow not wired)
- `btn-finalize-report` (testID defined, button may be missing or disabled)
- `btn-record-voice`, `voice-note-card-*` (components may exist, backend integration unclear)
- `btn-attachment`, `btn-open-file-*` (testIDs defined, UI may be stubs)
- `pending-photo-queue-*`, `upload-pending-*` (testIDs defined, no visible queue UI)
- `image-preview`, `image-preview-loading` (testIDs exist, modal may be missing)
- `btn-avatar-upload` (renders as stub card)
- `edit-section-meta`, `edit-section-weather`, etc. (testIDs defined, actual sections may be placeholders)

### ❌ Missing (testID defined but feature not started)
- `link-signup` (signup stepper UI)
- `btn-login-change-number` (OTP change number)
- `input-client-name` (separate client name in project form)
- `btn-finalize-report`, `btn-report-view-pdf`, `btn-report-save-pdf`, `btn-report-share-pdf` (PDF export flow)
- `btn-report-delete` (in-report delete action vs draft delete)
- `btn-camera-flash`, `lbl-camera-count` (camera burst features)
- `btn-record-start`, `btn-stop-recording` (voice recording state machine)
- `voice-note-transcript-*`, `dialog-action-voice-note-*` (transcript modal)
- `btn-voice-note-summarize-*` (auto-summarize)
- `upload-pending-*`, `btn-retry-upload-*`, `btn-cancel-upload-*` (upload queue UI)
- `usage-summary-reports`, `usage-summary-input-tokens`, `usage-summary-output-tokens`, `usage-history-item-*` (usage data display)

## Estimated Implementation Effort

### Quick Wins (< 1 day each)
1. Add `input-client-name` to project form
2. Add `btn-login-change-number` on OTP screen
3. Add `link-signup` navigation (if signup flow exists)
4. Wire up `btn-finalize-report` action
5. Show camera photo count (`lbl-camera-count`)

### Medium Effort (1-3 days each)
1. PDF export flow (in-app preview, save, share)
2. Image preview lightbox modal
3. Voice note recording UI with start/stop state
4. Photo upload queue display with retry/cancel
5. Usage screen data display (reports count, token usage)
6. Report edit sections (meta, weather, workers, materials, issues)

### Large Effort (3+ days each)
1. AI report generation wiring (LLM call, loading state, fixture mode support)
2. Voice note full pipeline (record → transcribe → summarize → display)
3. File attachment system (pick files, upload, display in timeline)
4. Signup multi-step stepper with validation
5. Avatar upload with image picker + cropper

## Recommendations

1. **Priority 1**: Implement features required by `core-end-to-end.yaml`:
   - AI report generation (fixture mode)
   - Voice note recording (mocked)
   - Camera → timeline integration
   - Photo upload queue
   - Image preview
   - PDF view/save

2. **Priority 2**: Implement features for common flows:
   - Finalize report
   - Report edit sections
   - Usage data display
   - Signup stepper

3. **Priority 3**: Nice-to-have features:
   - Camera flash toggle
   - Avatar upload
   - Advanced upload queue management

## Next Steps for User

1. Review this gap list and prioritize features for implementation
2. Run `cd apps/mobile-v2 && maestro test --dry-run .maestro/` to lint YAML (if supported)
3. Build v2 in mock mode: `cd /repo && pnpm ios:mock --filter mobile-v2`
4. Run individual flows to see which fail and which testIDs are actually missing:
   ```bash
   cd apps/mobile-v2
   maestro test .maestro/journeys/auth-and-onboarding.yaml
   maestro test .maestro/subflows/create-project.yaml
   maestro test .maestro/reports/new-report-fixture-happy.yaml
   ```
5. Address failures incrementally, starting with quick wins

## Notes

- TypeScript compilation errors reduced from ~35 to 6 (all in test files with import issues)
- All core testIDs are now registered in `src/infra/test-ids.ts`
- Components updated to use v1-compatible testID strings
- Maestro suite copied verbatim to `apps/mobile-v2/.maestro/`
- Package.json scripts ported (`ios:mock`, `test:e2e`, etc.)
