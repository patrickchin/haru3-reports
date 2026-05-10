export const AI_PROVIDERS = ['kimi', 'openai', 'anthropic', 'google', 'zai', 'deepseek'] as const;
export type AiProvider = (typeof AI_PROVIDERS)[number];

export const DEFAULT_PROVIDER: AiProvider = 'kimi';

export const PROVIDER_MODELS: Record<AiProvider, { default: string; available: string[] }> = {
  kimi: { default: 'kimi-k2-0905-preview', available: ['kimi-k2-0905-preview'] },
  openai: { default: 'gpt-4o-mini', available: ['gpt-4o-mini', 'gpt-4o'] },
  anthropic: { default: 'claude-sonnet-4-20250514', available: ['claude-sonnet-4-20250514', 'claude-haiku-4-5'] },
  google: { default: 'gemini-2.0-flash', available: ['gemini-2.0-flash', 'gemini-2.5-flash'] },
  zai: { default: 'glm-4.6', available: ['glm-4.6'] },
  deepseek: { default: 'deepseek-chat', available: ['deepseek-chat', 'deepseek-reasoner'] },
};

export const REPORT_TYPES = ['daily', 'safety', 'incident', 'inspection', 'site_visit', 'progress'] as const;
export type ReportType = (typeof REPORT_TYPES)[number];

export const REPORT_STATUSES = ['draft', 'final'] as const;
export type ReportStatus = (typeof REPORT_STATUSES)[number];

export const PROJECT_STATUSES = ['active', 'delayed', 'completed', 'archived'] as const;
export type ProjectStatus = (typeof PROJECT_STATUSES)[number];

export const PROJECT_ROLES = ['owner', 'admin', 'editor', 'viewer'] as const;
export type ProjectRole = (typeof PROJECT_ROLES)[number];

export const MEMBER_ROLES = ['admin', 'editor', 'viewer'] as const;
export type MemberRole = (typeof MEMBER_ROLES)[number];

export const FILE_CATEGORIES = ['document', 'image', 'voice-note', 'attachment', 'icon'] as const;
export type FileCategory = (typeof FILE_CATEGORIES)[number];

export const NOTE_KINDS = ['text', 'voice', 'image', 'video', 'document'] as const;
export type NoteKind = (typeof NOTE_KINDS)[number];

export const UPLOAD_STATUSES = ['pending', 'completed', 'failed'] as const;
export type UploadStatus = (typeof UPLOAD_STATUSES)[number];

export const STORAGE_BUCKETS = ['project-files', 'avatars'] as const;
export type StorageBucket = (typeof STORAGE_BUCKETS)[number];
