/**
 * Drizzle ORM schema mirroring the Supabase Postgres tables we care
 * about in the API.
 *
 * **Source of truth: `supabase/migrations/`.** This file is a typed
 * mirror, not the schema authority. Keep the column types in sync;
 * a CI check (`drizzle-kit check`) will diverge if they drift.
 *
 * Phase 0 scope: structural shells for tables touched by sync RPCs.
 * Indexes, generated columns, and RLS policies stay in the SQL
 * migrations.
 */
import {
  boolean,
  index,
  integer,
  jsonb,
  pgSchema,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

// `auth.users` lives in Supabase's reserved schema. We only reference
// its `id` for FK typing; we never query it directly from the API.
const authSchema = pgSchema("auth");
export const authUsers = authSchema.table("users", {
  id: uuid("id").primaryKey(),
});

export const profiles = pgTable("profiles", {
  id: uuid("id")
    .primaryKey()
    .references(() => authUsers.id, { onDelete: "cascade" }),
  phone: text("phone"),
  fullName: text("full_name"),
  companyName: text("company_name"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
});

export const projects = pgTable(
  "projects",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerId: uuid("owner_id")
      .notNull()
      .references(() => authUsers.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    address: text("address"),
    clientName: text("client_name"),
    status: text("status").notNull().default("active"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    serverUpdatedAt: timestamp("server_updated_at", {
      withTimezone: true,
    }).notNull(),
    serverVersion: text("server_version").notNull(),
  },
  (t) => ({
    ownerIdx: index("projects_owner_idx").on(t.ownerId),
    serverUpdatedIdx: index("projects_server_updated_idx").on(
      t.serverUpdatedAt,
    ),
  }),
);

export const reports = pgTable(
  "reports",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    ownerId: uuid("owner_id")
      .notNull()
      .references(() => authUsers.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    reportType: text("report_type").notNull(),
    status: text("status").notNull().default("draft"),
    visitDate: timestamp("visit_date", { withTimezone: true }),
    confidence: integer("confidence"),
    reportData: jsonb("report_data"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    serverUpdatedAt: timestamp("server_updated_at", {
      withTimezone: true,
    }).notNull(),
    serverVersion: text("server_version").notNull(),
  },
  (t) => ({
    projectIdx: index("reports_project_idx").on(t.projectId),
    ownerIdx: index("reports_owner_idx").on(t.ownerId),
    serverUpdatedIdx: index("reports_server_updated_idx").on(
      t.serverUpdatedAt,
    ),
  }),
);

export const reportNotes = pgTable(
  "report_notes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    reportId: uuid("report_id")
      .notNull()
      .references(() => reports.id, { onDelete: "cascade" }),
    ownerId: uuid("owner_id")
      .notNull()
      .references(() => authUsers.id, { onDelete: "cascade" }),
    body: text("body"),
    transcript: text("transcript"),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    serverUpdatedAt: timestamp("server_updated_at", {
      withTimezone: true,
    }).notNull(),
    serverVersion: text("server_version").notNull(),
  },
  (t) => ({
    reportIdx: index("report_notes_report_idx").on(t.reportId),
  }),
);

export const projectMembers = pgTable(
  "project_members",
  {
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => authUsers.id, { onDelete: "cascade" }),
    role: text("role").notNull().default("viewer"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  },
  (t) => ({
    pk: index("project_members_pk").on(t.projectId, t.userId),
  }),
);

export const fileMetadata = pgTable(
  "file_metadata",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    reportId: uuid("report_id").references(() => reports.id, {
      onDelete: "cascade",
    }),
    ownerId: uuid("owner_id")
      .notNull()
      .references(() => authUsers.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    storagePath: text("storage_path").notNull(),
    mimeType: text("mime_type"),
    sizeBytes: integer("size_bytes"),
    width: integer("width"),
    height: integer("height"),
    thumbnailPath: text("thumbnail_path"),
    blurhash: text("blurhash"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    serverUpdatedAt: timestamp("server_updated_at", {
      withTimezone: true,
    }).notNull(),
    serverVersion: text("server_version").notNull(),
  },
  (t) => ({
    reportIdx: index("file_metadata_report_idx").on(t.reportId),
  }),
);

export const tokenUsage = pgTable("token_usage", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => authUsers.id, { onDelete: "cascade" }),
  provider: text("provider").notNull(),
  model: text("model").notNull(),
  inputTokens: integer("input_tokens").notNull(),
  outputTokens: integer("output_tokens").notNull(),
  costUsd: text("cost_usd"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
});

export const clientOps = pgTable(
  "client_ops",
  {
    clientOpId: text("client_op_id").primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => authUsers.id, { onDelete: "cascade" }),
    entity: text("entity").notNull(),
    appliedAt: timestamp("applied_at", { withTimezone: true }).notNull(),
    response: jsonb("response").notNull(),
    isError: boolean("is_error").notNull().default(false),
  },
  (t) => ({
    userIdx: index("client_ops_user_idx").on(t.userId),
  }),
);

/** Aggregated export so route handlers can `import * as schema from ...`. */
export const schema = {
  profiles,
  projects,
  reports,
  reportNotes,
  projectMembers,
  fileMetadata,
  tokenUsage,
  clientOps,
};
