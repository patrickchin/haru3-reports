# TODO

## Token Usage & Billing

- [x] Per-account token usage tracking
  - ~~Add a `token_usage` table~~ — `202604200001_token_usage.sql`
  - ~~Record token counts from `generateText` response~~ — `_shared/llm.ts` → `defaultRecordUsage`
  - ~~Add RLS policies~~ — migration includes row-level security
  - ~~Aggregate endpoint or DB view for per-account totals~~ — `monthly_token_usage` view
  - ~~Surface usage stats in the mobile app~~ — `usage.tsx` screen with monthly breakdown & charts
  - Set per-account quotas / rate limits based on plan tier

## Report Generation Log

- [ ] Persist generation attempts for debugging and admin visibility
  - Add a `report_generation_log` table (report_id, provider, model, duration_ms, success, error_message, notes_count, finish_reason, created_at)
  - Record each `generateText` call result in the `generate-report` edge function
  - The `admin-reports` detail endpoint already queries this table — just needs the migration
  - Add RLS policies (admin read, owner read own)

## Raw Notes Persistence

- [x] Store voice-to-text notes independently from the generated report
  - ~~`notes text[]` column on `reports` table~~ — in original migration `202603290001_projects_reports.sql`
  - ~~Save notes array on every auto-save in generate screen~~ — `doSave` writes `notes: currentNotes`
  - ~~Load notes on mount and resume from stored notes~~ — generate screen loads `data.notes` and restores state
  - Enables re-generation from stored notes without re-recording

## Report Comments

- [ ] Add commenting on reports for team collaboration
  - Add a `report_comments` table (id, report_id, project_id, author_id, body, edited_at, deleted_at, created_at, updated_at)
  - Denormalize `project_id` for RLS; enforce consistency via trigger
  - RLS: all project members (including viewers) can read and create; edit/soft-delete own; owner/admin can moderate
  - Flat chronological list (no threading in MVP)
  - TanStack Query hooks for list, create, edit, soft-delete
  - `CommentList`, `CommentItem`, `CommentComposer` components below report sections on detail screen
  - 2000-char body limit; plain text only
  - Design doc: `docs/features/report-comments.md`

## Project Activity Feed

- [ ] Lightweight audit log for project-level events
  - Add an `activity_log` table (id, user_id, project_id, action, metadata JSONB, created_at)
  - Record events: report created, report regenerated, project status changed, project created
  - Add RLS policies so users can only read their own project activity
  - Surface as a feed/timeline on the project detail screen

## Per-Project Statistics

- [ ] Aggregate report stats per project via a Postgres view
  - `CREATE VIEW project_stats` — report count, last visit date, report type distribution
  - Zero application code for the data layer, just a migration
  - Surface as a summary card on the project detail screen

## Remove Confidence / Completeness

- [ ] Drop the `confidence` column and completeness scoring — not useful
  - Migration to drop `confidence` from `reports` table
  - Remove `low_confidence` filter from `admin-reports` edge function
  - Remove `CompletenessCard` component and `getReportCompleteness` from report-helpers
  - Remove `confidence: completeness` write in the generate screen
  - Update seed data to drop confidence values

## Draft Auto-Save

- [x] ~~Persist in-progress report to database as draft~~ — drafts save to DB with `status='draft'`; `draft-report-actions.ts` handles delete
- [ ] Local crash-recovery via AsyncStorage
  - Save report + notes to AsyncStorage on each update (debounced)
  - On opening generate screen, check for a saved draft and offer to resume
  - Clear draft on successful save to database

## Edit Saved Reports

- [ ] Allow re-opening a finalized report for editing
  - "Edit" button on report detail screen
  - Navigate to generate screen pre-loaded with existing report data and notes
  - Update the existing report row rather than creating a new one

## Report Search & Filter

- [ ] Add search and filtering to the reports list screen
  - Text search across report titles
  - Filter by report type (daily/safety/incident/inspection/site_visit/progress)
  - Filter by draft vs final status

## Report Status Badges

- [ ] Show draft/final status visually in the reports list
  - Badge or tag on each report card (data already exists in `status` column)
  - Color-coded: draft = amber, final = green

## Share Report

- [x] Share a report from the detail screen
  - ~~Share via native share sheet~~ — PDF share via `expo-sharing` on report detail screen
  - Deep link back into the app for the specific report

## Project Detail Screen

- [x] Add a project overview screen
  - ~~Show project name, address, client, created date~~ — `projects/[projectId]/index.tsx`
  - ~~Quick stats: report count, last visit date~~ — `computeProjectOverviewStats`
  - ~~Navigation to reports list, edit project~~ — action buttons on overview
  - Navigation to activity feed (pending activity feed feature)

## Project Start & End Dates

- [ ] Add date fields to the project form
  - `start_date` and `expected_end_date` columns on `projects` table (migration)
  - Date pickers on the new/edit project form
  - Display on project detail screen

## Archive / Complete Project

- [ ] Surface the existing `status` column in the UI
  - Action on project detail or edit screen to mark as completed/archived
  - Filter or section on the projects list (active vs archived)
  - Archived projects move to a separate section or are hidden by default

## Editable Profile

- [ ] Allow editing name and company on the account screen
  - Switch from read-only to inline-editable fields
  - Save button to update the `profiles` row

## Project Members

- [x] Multi-user project membership with roles
  - ~~`project_members` table~~ — `202604210001_project_members.sql` with Owner/Admin/Editor/Viewer roles
  - ~~Members screen~~ — `projects/[projectId]/members.tsx` with role filters, add/remove members
  - ~~Profiles teammate visibility~~ — `202604210002_profiles_teammate_visibility.sql`

## Soft Delete

- [x] Soft-delete support for projects and reports
  - ~~`deleted_at` column on both tables~~ — `202604180001_soft_delete.sql`
  - ~~RLS policies exclude soft-deleted rows~~

## Report Comments

- [ ] Add a comments / discussion thread to each report
  - `report_comments` table (id, report_id, user_id, body, created_at, updated_at, deleted_at)
  - RLS policies: project members can read; author can edit/delete own comments
  - Comments section on the report detail screen (scrollable thread below report content)
  - Inline reply support (optional: `parent_id` for threaded replies)
  - Push notification when a teammate comments on your report
  - @mention support for tagging project members

## Multi-Language Speech-to-Text

- [ ] Add a language picker for voice transcription
  - Setting on profile screen to choose speech recognition locale (currently hardcoded `en-US`)
  - Pass selected locale to the speech-to-text hook
  - Persist preference in AsyncStorage or profile metadata

---

# Larger Features

## Admin Portal (Web)

- [ ] Internal admin dashboard for platform-wide visibility and analytics
  - Standalone web app behind admin auth (currently only the `admin-reports` edge function exists)
  - User & organisation management — list, search, view detail, deactivate
  - Report browser — search/filter all reports across all users, drill into detail
  - Platform analytics: report volume over time, active users, reports per org, avg generation time, token spend
  - Per-organisation breakdowns: report counts, project counts, active members
  - Data export (CSV / PDF) for reports and analytics
  - Moderation tools: flag/review low-quality reports, view generation logs

## Web App

- [ ] User-facing web application (scope TBD, likely complementary to mobile)
  - Tech decision: Next.js / Vite React — currently a bare Vite scaffold exists in `apps/web`
  - Likely features unique to web:
    - Data analytics dashboards (charts, tables, filters) for a user's own projects & reports
    - Bulk report browsing / search / export
    - PDF report generation and download
    - Project settings and team management UI
  - Likely overlap with mobile:
    - View reports (read-only, richer layout on desktop)
    - Project list and detail
    - Account / profile settings
  - Design principle: web is the "desk" companion — analysis, review, export; mobile is the "field" tool — voice capture, quick edits

## Organisations & Team Collaboration

- [ ] Multi-user organisations with shared projects
  - `organisations` table (id, name, created_at) and `organisation_members` (org_id, user_id, role: owner/admin/member/viewer)
  - Link projects to an organisation rather than (or in addition to) a single owner
  - RLS policies: members see all org projects; role-based write access
  - Invite flow: admin invites by phone/email, invitee joins org on signup or from account screen
  - Report sign-off / approval workflow:
    - Member submits report → PM reviews → PM approves or requests changes
    - `report_approvals` table (report_id, approver_id, status: pending/approved/rejected, comment, created_at)
    - Notifications on status change
  - Shared activity feed scoped to the organisation

## Cost & Financial Tracking

- [ ] Track project expenditure across labour, equipment, and materials
  - `cost_entries` table (id, project_id, report_id nullable, category: labour/equipment_rental/equipment_purchase/materials/other, description, amount, currency, entry_date, created_at)
  - Capture costs during report generation — LLM already extracts manpower counts, equipment hours, material quantities; prompt can be extended to estimate costs when unit prices are provided
  - Manual cost entry screen in mobile app (quick-add from project detail)
  - Per-project cost summary: total spend, breakdown by category, spend over time chart
  - Budget tracking: optional budget field on projects, progress bar vs actuals
  - Web app: richer cost analytics, export to CSV/Excel

## Photo & Document Attachments

- [ ] Attach photos and files to reports and activities
  - Supabase Storage bucket for report media
  - Camera / gallery picker in the mobile generate screen
  - Associate images with specific activities or issues via metadata
  - Display in report view; include in PDF exports
  - Storage quotas per plan tier

## Offline Mode & Sync

- [ ] Full offline support for field use with poor connectivity
  - Local SQLite (via expo-sqlite or WatermelonDB) mirroring key tables
  - Queue report generation requests when offline; sync when back online
  - Conflict resolution strategy for concurrent edits (last-write-wins or manual merge)
  - Offline indicator in the app UI

## PDF / Export

- [x] Generate PDF reports from structured report data
  - ~~Client-side PDF rendering~~ — `export-report-pdf.ts` via `expo-print`
  - ~~Export as PDF or share~~ — share via `expo-sharing`, save to device
- [ ] PDF enhancements
  - Branded template with company logo
  - Photo attachments in PDF
  - Server-side rendering for consistency
  - Batch export for a date range or project
