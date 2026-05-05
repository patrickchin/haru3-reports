export type Feature = {
  slug: string;
  title: string;
  source: string;
  blurb: string;
  screenshot: string;
  highlights: string[];
};

export const features: Feature[] = [
  {
    slug: "phone-otp-auth",
    title: "Phone OTP Authentication",
    source: "app/index.tsx + app/signup.tsx",
    blurb:
      "Sign in or sign up with a phone number; a one-time SMS code completes the flow. Demo accounts are exposed in dev builds for fast access.",
    screenshot: "01-login.png",
    highlights: [
      "Phone-based auth via Supabase GoTrue",
      "OTP code entry with resend timer",
      "Three demo accounts in dev (`__DEV__`)",
      "Server selector (local vs cloud) for testing",
    ],
  },
  {
    slug: "onboarding",
    title: "Onboarding",
    source: "app/onboarding.tsx",
    blurb:
      "First-run profile setup: full name and role, completed before the user reaches the projects list.",
    screenshot: "02-onboarding.png",
    highlights: [
      "Captures display name + role",
      "One-time, gated by profile completeness flag",
      "Skippable in dev demo accounts",
    ],
  },
  {
    slug: "projects-list",
    title: "Projects List",
    source: "app/(tabs)/projects.tsx",
    blurb:
      "The home tab. Each project card shows site name, address, latest activity, and a thumbnail. Tap to enter the project.",
    screenshot: "03-projects-list.png",
    highlights: [
      "Pull-to-refresh",
      "Offline-first cache via TanStack Query + local DB",
      "Sticky `+ New Project` action",
      "Connection banner (offline ↔ reconnected) with smooth Reanimated transitions",
    ],
  },
  {
    slug: "new-project",
    title: "Create / Edit Project",
    source: "app/projects/new.tsx + app/projects/[projectId]/edit.tsx",
    blurb:
      "Create a new construction site or edit an existing one — name, address, optional cover photo.",
    screenshot: "04-new-project.png",
    highlights: [
      "Name + address (autocomplete)",
      "Cover photo via camera or library",
      "Edits sync via Supabase, queued when offline",
    ],
  },
  {
    slug: "project-home",
    title: "Project Home",
    source: "app/projects/[projectId]/index.tsx",
    blurb:
      "Per-project dashboard: drafts, recent reports, members, files. The hub for everything that belongs to a single site.",
    screenshot: "05-project-home.png",
    highlights: [
      "Drafts tile (peach tint) + completed reports",
      "Members + files quick links",
      "Project edit + delete from header",
    ],
  },
  {
    slug: "members",
    title: "Project Members",
    source: "app/projects/[projectId]/members.tsx",
    blurb:
      "Invite teammates to a project, manage roles, and remove access.",
    screenshot: "06-members.png",
    highlights: [
      "Invite by phone or email",
      "Role assignment (owner / editor / viewer)",
      "Pending-invite states",
      "RLS-enforced server side",
    ],
  },
  {
    slug: "notes-capture",
    title: "Notes & Voice Notes",
    source: "app/projects/[projectId]/reports/generate.tsx (Notes tab)",
    blurb:
      "Capture observations as text notes, photos, or voice notes. Voice notes auto-transcribe; the timeline preserves the order they were captured.",
    screenshot: "07-notes.png",
    highlights: [
      "Multiline text composer with `Add` action",
      "Photo capture (camera + library)",
      "Voice recorder with waveform",
      "Auto-transcription via Whisper edge function",
      "Long-press to copy a note's text",
      "Numbered timeline rows with timestamps",
    ],
  },
  {
    slug: "ai-report-generation",
    title: "AI Report Generation",
    source: "app/projects/[projectId]/reports/generate.tsx (Report tab)",
    blurb:
      "Tap `Update report` and the captured notes get folded into a structured site report — weather, workforce, materials, issues, next steps, and free-form sections.",
    screenshot: "08-report-generation.png",
    highlights: [
      "Routed via `report-core` AI providers (OpenAI / Anthropic)",
      "Streaming response with skeleton placeholders",
      "Single orange `Update report` hero CTA (one accent per viewport)",
      "Full schema in `docs/04-report-schema.md`",
    ],
  },
  {
    slug: "manual-report-edit",
    title: "Manual Report Editing",
    source: "components/reports/* (card-level toggles)",
    blurb:
      "Every card on the report has its own pencil. Tap to edit a card, ✓ to commit, ✕ to cancel — all changes autosave in the background.",
    screenshot: "09-report-edit.png",
    highlights: [
      "Per-card edit toggle (no global edit mode)",
      "Add/remove rows for Workers, Materials, Issues, Next Steps",
      "Debounced 1.5s autosave via `useReportAutoSave`",
      "Saves on AppState→background and on screen unmount",
    ],
  },
  {
    slug: "saved-reports",
    title: "Saved Reports",
    source: "app/projects/[projectId]/reports/[reportId].tsx",
    blurb:
      "Read-only view of a finalized report, with full edit affordances and a PDF export.",
    screenshot: "10-saved-report.png",
    highlights: [
      "Finalized report detail",
      "PDF preview + share",
      "Inline edit with autosave",
      "Delete via destructive action sheet",
    ],
  },
  {
    slug: "pdf-export",
    title: "PDF Preview & Share",
    source: "components/reports/PdfPreviewModal.tsx",
    blurb:
      "Render any report to a clean, print-ready PDF and share it through the system share sheet.",
    screenshot: "11-pdf.png",
    highlights: [
      "Server-rendered PDF (edge function)",
      "On-device preview",
      "Native share sheet (iOS / Android)",
    ],
  },
  {
    slug: "files",
    title: "Project Files",
    source: "components/files/*",
    blurb:
      "All photos and uploaded documents for a project, gridded by date with a full-screen preview.",
    screenshot: "12-files.png",
    highlights: [
      "Image grid with thumbnails",
      "Full-screen viewer with pinch-zoom",
      "Cache seeded at upload time — no `Downloading` flashes",
      "Soft-delete (recoverable)",
    ],
  },
  {
    slug: "offline-sync",
    title: "Offline-First Sync",
    source: "components/sync/ConnectionBanner.tsx + lib/local-db/*",
    blurb:
      "Everything works offline. Edits queue in a local SQLite store and replay to Supabase when the connection returns.",
    screenshot: "13-offline.png",
    highlights: [
      "SQLite-backed write queue",
      "Conflict banner with manual resolution",
      "Sticky reconnect banner (Reanimated cross-fade)",
      "No data loss on app kill",
    ],
  },
  {
    slug: "profile-account",
    title: "Profile, Account & Usage",
    source: "app/profile.tsx + app/account.tsx + app/usage.tsx",
    blurb:
      "Manage display name, photo, and language; review billing-relevant usage (tokens, transcription minutes); sign out.",
    screenshot: "14-profile.png",
    highlights: [
      "Profile photo + display name",
      "Language preference",
      "AI token / minute usage",
      "Sign out",
    ],
  },
];
