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
  user_id: string;
  role: "owner" | "editor" | "viewer";
  created_at: string;
  updated_at: string;
};

export type SiteReport = {
  id: string;
  project_id: string;
  owner_id: string;
  title: string;
  report_type: string;
  status: "draft" | "final";
  visit_date: string | null;
  confidence: number | null;
  notes: string[];
  report_data?: unknown;
  created_at: string;
  updated_at: string;
};

export type ReportNote = {
  id: string;
  report_id: string;
  project_id: string;
  author_id: string;
  position: number;
  kind: "text" | "voice" | "image" | "video" | "document";
  body: string | null;
  file_id: string | null;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
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
  // voice_transcript was dropped in migration 202604300003 - transcripts now live in report_notes.body
  voice_summary: string | null;
  voice_duration_ms: number | null;
  width?: number | null;
  height?: number | null;
  blurhash?: string | null;
  duration_ms?: number | null;
  upload_status?: "pending" | "completed" | "failed";
  local_uri?: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

export type TokenUsage = {
  id: string;
  user_id: string;
  project_id: string | null;
  report_id: string | null;
  input_tokens: number;
  output_tokens: number;
  cached_tokens: number;
  model: string;
  provider: string;
  created_at: string;
};

export type TokenUsageMonthly = {
  user_id: string;
  month: string;
  input_tokens: number;
  output_tokens: number;
  cached_tokens: number;
  generation_count: number;
};

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: Profile;
        Insert: {
          id: string;
          phone: string;
          full_name?: string | null;
          company_name?: string | null;
          avatar_url?: string | null;
        };
        Update: Partial<
          Omit<Profile, "id" | "phone" | "created_at" | "updated_at">
        >;
        Relationships: [];
      };
      projects: {
        Row: Project;
        Insert: {
          name: string;
          address?: string | null;
          owner_id: string;
        };
        Update: Partial<Omit<Project, "id" | "created_at" | "updated_at">>;
        Relationships: [];
      };
      project_members: {
        Row: ProjectMember;
        Insert: {
          project_id: string;
          user_id: string;
          role: "owner" | "editor" | "viewer";
        };
        Update: Partial<
          Omit<ProjectMember, "id" | "created_at" | "updated_at">
        >;
        Relationships: [];
      };
      reports: {
        Row: SiteReport;
        Insert: {
          id: string;
          project_id: string;
          owner_id: string;
          title: string;
          status: "draft" | "final";
          report_type?: string;
          visit_date?: string | null;
          confidence?: number | null;
          notes?: string[];
          report_data?: unknown;
        };
        Update: Partial<Omit<SiteReport, "id" | "created_at" | "updated_at">> & {
          deleted_at?: string;
        };
        Relationships: [];
      };
      report_notes: {
        Row: ReportNote;
        Insert: {
          id: string;
          report_id: string;
          project_id: string;
          author_id: string;
          position: number;
          kind: "text" | "voice" | "image" | "video" | "document";
          body?: string | null;
          file_id?: string | null;
        };
        Update: Partial<Omit<ReportNote, "id" | "created_at" | "updated_at">> & {
          deleted_at?: string;
        };
        Relationships: [];
      };
      file_metadata: {
        Row: FileMetadata;
        Insert: {
          project_id: string;
          uploader_id: string;
          file_name: string;
          file_size: number;
          mime_type: string;
          storage_path: string;
          thumbnail_url?: string | null;
          voice_title?: string | null;
          // voice_transcript was dropped in migration 202604300003
          voice_summary?: string | null;
          voice_duration_ms?: number | null;
          width?: number | null;
          height?: number | null;
          blurhash?: string | null;
          duration_ms?: number | null;
        };
        Update: Partial<
          Omit<FileMetadata, "id" | "created_at" | "updated_at">
        >;
        Relationships: [];
      };
      token_usage: {
        Row: TokenUsage;
        Insert: Omit<TokenUsage, "id" | "created_at">;
        Update: never;
        Relationships: [];
      };
    };
    Views: {
      token_usage_monthly: {
        Row: TokenUsageMonthly;
        Relationships: [];
      };
    };
    Functions: {
      soft_delete_project: {
        Args: { p_id: string };
        Returns: void;
      };
      soft_delete_report: {
        Args: { p_id: string };
        Returns: void;
      };
      soft_delete_report_note: {
        Args: { p_id: string };
        Returns: void;
      };
      lookup_profile_id_by_phone: {
        Args: { p_phone: string };
        Returns: string | null;
      };
    };
    Enums: {};
    CompositeTypes: {};
  };
};
