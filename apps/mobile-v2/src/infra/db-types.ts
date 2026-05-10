/**
 * Minimal database types for Phase 0.
 *
 * TODO: Run `supabase gen types typescript --project-id <id>` against
 * the project and replace this file. For now, declare only what the
 * auth flow needs.
 *
 * DO NOT redeclare these types elsewhere. Everything imports from here.
 */

export type Profile = {
  id: string;
  phone: string;
  full_name: string | null;
  company_name: string | null;
  avatar_url: string | null;
  created_at: string;
  updated_at: string;
};

export type Project = {
  id: string;
  name: string;
  address: string | null;
  owner_id: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

export type ProjectMember = {
  id: string;
  project_id: string;
  profile_id: string;
  role: "owner" | "uploader" | "viewer";
  created_at: string;
  updated_at: string;
};

export type SiteReport = {
  id: string;
  project_id: string;
  title: string;
  status: "draft" | "generating" | "complete" | "failed";
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

export type ReportNote = {
  id: string;
  report_id: string;
  note_text: string | null;
  file_id: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

export type FileMetadata = {
  id: string;
  project_id: string;
  uploader_id: string;
  file_name: string;
  file_size: number;
  mime_type: string;
  storage_path: string;
  thumbnail_url: string | null;
  voice_title: string | null;
  voice_transcript: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: Profile;
        Insert: Omit<Profile, "created_at" | "updated_at">;
        Update: Partial<
          Omit<Profile, "id" | "phone" | "created_at" | "updated_at">
        >;
      };
      projects: {
        Row: Project;
        Insert: Omit<Project, "created_at" | "updated_at" | "deleted_at">;
        Update: Partial<Omit<Project, "id" | "created_at" | "updated_at">>;
      };
      project_members: {
        Row: ProjectMember;
        Insert: Omit<ProjectMember, "id" | "created_at" | "updated_at">;
        Update: Partial<
          Omit<ProjectMember, "id" | "created_at" | "updated_at">
        >;
      };
      site_reports: {
        Row: SiteReport;
        Insert: Omit<SiteReport, "created_at" | "updated_at" | "deleted_at">;
        Update: Partial<Omit<SiteReport, "id" | "created_at" | "updated_at">>;
      };
      report_notes: {
        Row: ReportNote;
        Insert: Omit<ReportNote, "created_at" | "updated_at" | "deleted_at">;
        Update: Partial<Omit<ReportNote, "id" | "created_at" | "updated_at">>;
      };
      file_metadata: {
        Row: FileMetadata;
        Insert: Omit<
          FileMetadata,
          "created_at" | "updated_at" | "deleted_at"
        >;
        Update: Partial<
          Omit<FileMetadata, "id" | "created_at" | "updated_at">
        >;
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
  };
};
