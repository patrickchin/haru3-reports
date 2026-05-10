import {
  pgTable,
  uuid,
  text,
  timestamp,
  date,
  smallint,
  integer,
  bigint,
  jsonb,
  unique,
  index,
} from 'drizzle-orm/pg-core';

/** Shorthand for `timestamp(..., { withTimezone: true, mode: 'string' })`. */
const timestamptz = (name: string) =>
  timestamp(name, { withTimezone: true, mode: 'string' });

// ---------------------------------------------------------------------------
// profiles
// ---------------------------------------------------------------------------
export const profiles = pgTable('profiles', {
  id: uuid('id').primaryKey(), // references auth.users
  phone: text('phone').notNull(),
  fullName: text('full_name'),
  companyName: text('company_name'),
  avatarUrl: text('avatar_url'),
  aiProvider: text('ai_provider'),
  aiModel: text('ai_model'),
  createdAt: timestamptz('created_at').notNull().defaultNow(),
  updatedAt: timestamptz('updated_at').notNull().defaultNow(),
});

export type Profile = typeof profiles.$inferSelect;
export type NewProfile = typeof profiles.$inferInsert;

// ---------------------------------------------------------------------------
// projects
// ---------------------------------------------------------------------------
export const projects = pgTable(
  'projects',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ownerId: uuid('owner_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    address: text('address'),
    clientName: text('client_name'),
    status: text('status', {
      enum: ['active', 'delayed', 'completed', 'archived'],
    })
      .notNull()
      .default('active'),
    deletedAt: timestamptz('deleted_at'),
    createdAt: timestamptz('created_at').notNull().defaultNow(),
    updatedAt: timestamptz('updated_at').notNull().defaultNow(),
  },
  (t) => [index('projects_owner_id_idx').on(t.ownerId)],
);

export type Project = typeof projects.$inferSelect;
export type NewProject = typeof projects.$inferInsert;

// ---------------------------------------------------------------------------
// project_members
// ---------------------------------------------------------------------------
export const projectMembers = pgTable(
  'project_members',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    role: text('role', { enum: ['admin', 'editor', 'viewer'] })
      .notNull()
      .default('viewer'),
    invitedBy: uuid('invited_by').references(() => profiles.id, {
      onDelete: 'set null',
    }),
    createdAt: timestamptz('created_at').notNull().defaultNow(),
    updatedAt: timestamptz('updated_at').notNull().defaultNow(),
  },
  (t) => [
    unique('project_members_project_id_user_id_key').on(t.projectId, t.userId),
    index('project_members_user_id_idx').on(t.userId),
  ],
);

export type ProjectMember = typeof projectMembers.$inferSelect;
export type NewProjectMember = typeof projectMembers.$inferInsert;

// ---------------------------------------------------------------------------
// file_metadata (defined before reports because reports references it)
// ---------------------------------------------------------------------------
export const fileMetadata = pgTable(
  'file_metadata',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    uploadedBy: uuid('uploaded_by')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    bucket: text('bucket', { enum: ['project-files', 'avatars'] })
      .notNull()
      .default('project-files'),
    storagePath: text('storage_path').notNull(),
    category: text('category', {
      enum: ['document', 'image', 'voice-note', 'attachment', 'icon'],
    }).notNull(),
    filename: text('filename').notNull(),
    mimeType: text('mime_type').notNull(),
    sizeBytes: bigint('size_bytes', { mode: 'number' }).notNull(),
    durationMs: integer('duration_ms'),
    width: integer('width'),
    height: integer('height'),
    thumbnailPath: text('thumbnail_path'),
    blurhash: text('blurhash'),
    voiceTitle: text('voice_title'),
    voiceSummary: text('voice_summary'),
    uploadStatus: text('upload_status', {
      enum: ['pending', 'completed', 'failed'],
    })
      .notNull()
      .default('completed'),
    localUri: text('local_uri'),
    deletedAt: timestamptz('deleted_at'),
    createdAt: timestamptz('created_at').notNull().defaultNow(),
    updatedAt: timestamptz('updated_at').notNull().defaultNow(),
  },
  (t) => [
    unique('file_metadata_bucket_storage_path_key').on(t.bucket, t.storagePath),
    index('file_metadata_project_id_idx').on(t.projectId),
  ],
);

export type FileMetadata = typeof fileMetadata.$inferSelect;
export type NewFileMetadata = typeof fileMetadata.$inferInsert;

// ---------------------------------------------------------------------------
// report_notes (defined before reports for the last_processed_note_id FK)
// ---------------------------------------------------------------------------
export const reportNotes = pgTable(
  'report_notes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    reportId: uuid('report_id').notNull(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    authorId: uuid('author_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    position: integer('position').notNull(),
    kind: text('kind', {
      enum: ['text', 'voice', 'image', 'video', 'document'],
    }).notNull(),
    body: text('body'),
    fileId: uuid('file_id').references(() => fileMetadata.id, {
      onDelete: 'set null',
    }),
    deletedAt: timestamptz('deleted_at'),
    createdAt: timestamptz('created_at').notNull().defaultNow(),
    updatedAt: timestamptz('updated_at').notNull().defaultNow(),
  },
  (t) => [
    index('report_notes_report_id_idx').on(t.reportId),
    index('report_notes_project_id_idx').on(t.projectId),
  ],
);

export type ReportNote = typeof reportNotes.$inferSelect;
export type NewReportNote = typeof reportNotes.$inferInsert;

// ---------------------------------------------------------------------------
// reports
// ---------------------------------------------------------------------------
export const reports = pgTable(
  'reports',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    ownerId: uuid('owner_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    title: text('title').notNull().default(''),
    reportType: text('report_type', {
      enum: [
        'daily',
        'safety',
        'incident',
        'inspection',
        'site_visit',
        'progress',
      ],
    })
      .notNull()
      .default('daily'),
    status: text('status', { enum: ['draft', 'final'] })
      .notNull()
      .default('draft'),
    visitDate: date('visit_date'),
    confidence: smallint('confidence'),
    reportData: jsonb('report_data').notNull().default({}),
    lastGeneration: jsonb('last_generation'),
    lastProcessedNoteId: uuid('last_processed_note_id').references(
      () => reportNotes.id,
      { onDelete: 'set null' },
    ),
    deletedAt: timestamptz('deleted_at'),
    createdAt: timestamptz('created_at').notNull().defaultNow(),
    updatedAt: timestamptz('updated_at').notNull().defaultNow(),
  },
  (t) => [
    index('reports_project_id_idx').on(t.projectId),
    index('reports_owner_id_idx').on(t.ownerId),
  ],
);

export type Report = typeof reports.$inferSelect;
export type NewReport = typeof reports.$inferInsert;

// ---------------------------------------------------------------------------
// token_usage
// ---------------------------------------------------------------------------
export const tokenUsage = pgTable(
  'token_usage',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    projectId: uuid('project_id').references(() => projects.id, {
      onDelete: 'set null',
    }),
    reportId: uuid('report_id').references(() => reports.id, {
      onDelete: 'set null',
    }),
    inputTokens: integer('input_tokens').notNull().default(0),
    outputTokens: integer('output_tokens').notNull().default(0),
    cachedTokens: integer('cached_tokens').notNull().default(0),
    model: text('model').notNull(),
    provider: text('provider').notNull(),
    createdAt: timestamptz('created_at').notNull().defaultNow(),
  },
  (t) => [
    index('token_usage_user_id_idx').on(t.userId),
    index('token_usage_project_id_idx').on(t.projectId),
  ],
);

export type TokenUsage = typeof tokenUsage.$inferSelect;
export type NewTokenUsage = typeof tokenUsage.$inferInsert;
