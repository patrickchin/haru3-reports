/**
 * Schema migrations for the on-device SQLite database.
 *
 * Migrations are an append-only ordered list. Each one is applied once,
 * inside a transaction, with `PRAGMA user_version` advanced atomically so
 * a partial apply on crash rolls back cleanly.
 *
 * Rules:
 *   - Never edit an existing migration's `sql` after it has shipped.
 *   - `version` numbers are dense and start at 1.
 *   - SQL is portable across `expo-sqlite` (running app) and
 *     `better-sqlite3` (unit tests). Avoid driver-specific syntax.
 */

export type Migration = {
  /** Strictly-increasing positive integer. */
  version: number;
  /** Short human label for logs. */
  name: string;
  /** SQL applied in a single transaction. May contain multiple statements. */
  sql: string;
};

/**
 * v1 — initial schema for local-first foundations.
 *
 * Mirrors the shape of `public.projects`, `public.reports`,
 * `public.project_members`, and `public.file_metadata` on the server, plus
 * the four sync columns that every mirrored row carries:
 *   server_updated_at, local_updated_at, sync_state, deleted_at.
 *
 * Local-only tables: outbox, generation_jobs, sync_meta, sync_events.
 *
 * This phase is read-only from the UI's perspective — no screen wiring
 * happens yet. We are just standing up the storage layer behind the
 * `EXPO_PUBLIC_LOCAL_FIRST` flag.
 */
const V1_INITIAL_SCHEMA: Migration = {
  version: 1,
  name: "initial_schema",
  sql: `
    -- ============================================================
    -- Mirrored: projects
    -- ============================================================
    CREATE TABLE projects (
      id                  TEXT PRIMARY KEY,
      owner_id            TEXT NOT NULL,
      name                TEXT NOT NULL,
      address             TEXT,
      client_name         TEXT,
      status              TEXT NOT NULL DEFAULT 'active',
      created_at          TEXT NOT NULL,
      updated_at          TEXT NOT NULL,
      deleted_at          TEXT,
      server_updated_at   TEXT,
      local_updated_at    TEXT NOT NULL,
      sync_state          TEXT NOT NULL DEFAULT 'synced'
    );
    CREATE INDEX projects_owner_idx ON projects (owner_id);
    CREATE INDEX projects_sync_state_idx ON projects (sync_state);

    -- ============================================================
    -- Mirrored: project_members
    -- ============================================================
    CREATE TABLE project_members (
      project_id          TEXT NOT NULL,
      user_id             TEXT NOT NULL,
      role                TEXT NOT NULL,
      created_at          TEXT NOT NULL,
      updated_at          TEXT NOT NULL,
      deleted_at          TEXT,
      server_updated_at   TEXT,
      local_updated_at    TEXT NOT NULL,
      sync_state          TEXT NOT NULL DEFAULT 'synced',
      PRIMARY KEY (project_id, user_id)
    );

    -- ============================================================
    -- Mirrored: reports
    -- notes_json + report_data_json store JSON as TEXT.
    -- ============================================================
    CREATE TABLE reports (
      id                  TEXT PRIMARY KEY,
      project_id          TEXT NOT NULL,
      owner_id            TEXT NOT NULL,
      title               TEXT NOT NULL DEFAULT '',
      report_type         TEXT NOT NULL DEFAULT 'daily',
      status              TEXT NOT NULL DEFAULT 'draft',
      visit_date          TEXT,
      confidence          INTEGER,
      notes_json          TEXT NOT NULL DEFAULT '[]',
      report_data_json    TEXT NOT NULL DEFAULT '{}',
      generation_state    TEXT NOT NULL DEFAULT 'idle',
      generation_error    TEXT,
      created_at          TEXT NOT NULL,
      updated_at          TEXT NOT NULL,
      deleted_at          TEXT,
      server_updated_at   TEXT,
      local_updated_at    TEXT NOT NULL,
      sync_state          TEXT NOT NULL DEFAULT 'synced'
    );
    CREATE INDEX reports_project_visit_idx ON reports (project_id, visit_date DESC);
    CREATE INDEX reports_sync_state_idx ON reports (sync_state);
    CREATE INDEX reports_generation_state_idx ON reports (generation_state);

    -- ============================================================
    -- Mirrored: file_metadata
    -- ============================================================
    CREATE TABLE file_metadata (
      id                  TEXT PRIMARY KEY,
      project_id          TEXT NOT NULL,
      uploaded_by         TEXT NOT NULL,
      bucket              TEXT NOT NULL,
      storage_path        TEXT,
      category            TEXT NOT NULL,
      filename            TEXT NOT NULL,
      mime_type           TEXT NOT NULL,
      size_bytes          INTEGER NOT NULL,
      duration_ms         INTEGER,
      transcription       TEXT,
      report_id           TEXT,
      local_audio_path    TEXT,
      transcription_state TEXT NOT NULL DEFAULT 'done',
      upload_state        TEXT NOT NULL DEFAULT 'done',
      created_at          TEXT NOT NULL,
      updated_at          TEXT NOT NULL,
      deleted_at          TEXT,
      server_updated_at   TEXT,
      local_updated_at    TEXT NOT NULL,
      sync_state          TEXT NOT NULL DEFAULT 'synced'
    );
    CREATE INDEX file_metadata_report_idx ON file_metadata (report_id, transcription_state);
    CREATE INDEX file_metadata_sync_state_idx ON file_metadata (sync_state);

    -- ============================================================
    -- Local-only: outbox (pending mutations to push to the server)
    -- ============================================================
    CREATE TABLE outbox (
      id                  INTEGER PRIMARY KEY AUTOINCREMENT,
      entity              TEXT NOT NULL,
      entity_id           TEXT NOT NULL,
      op                  TEXT NOT NULL,
      payload_json        TEXT NOT NULL,
      base_version        TEXT,
      attempts            INTEGER NOT NULL DEFAULT 0,
      next_attempt_at     TEXT NOT NULL,
      last_error          TEXT,
      client_op_id        TEXT NOT NULL UNIQUE,
      created_at          TEXT NOT NULL
    );
    CREATE INDEX outbox_drain_idx ON outbox (next_attempt_at, attempts);
    CREATE INDEX outbox_entity_idx ON outbox (entity, entity_id);

    -- ============================================================
    -- Local-only: generation_jobs (deferred LLM calls)
    -- ============================================================
    CREATE TABLE generation_jobs (
      id                          INTEGER PRIMARY KEY AUTOINCREMENT,
      report_id                   TEXT NOT NULL,
      mode                        TEXT NOT NULL,
      last_processed_note_count   INTEGER NOT NULL DEFAULT 0,
      state                       TEXT NOT NULL DEFAULT 'queued',
      attempts                    INTEGER NOT NULL DEFAULT 0,
      next_attempt_at             TEXT NOT NULL,
      error                       TEXT,
      created_at                  TEXT NOT NULL,
      completed_at                TEXT
    );
    CREATE INDEX generation_jobs_state_idx ON generation_jobs (state, next_attempt_at);
    CREATE INDEX generation_jobs_report_idx ON generation_jobs (report_id);

    -- ============================================================
    -- Local-only: sync_meta (per-table pull cursor)
    -- ============================================================
    CREATE TABLE sync_meta (
      table_name      TEXT PRIMARY KEY,
      last_pulled_at  TEXT,
      user_id         TEXT NOT NULL
    );

    -- ============================================================
    -- Local-only: sync_events (debug ring buffer; capped by app code)
    -- ============================================================
    CREATE TABLE sync_events (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      ts          TEXT NOT NULL,
      level       TEXT NOT NULL,
      kind        TEXT NOT NULL,
      message     TEXT NOT NULL,
      data_json   TEXT
    );
    CREATE INDEX sync_events_ts_idx ON sync_events (ts DESC);
  `,
};

/**
 * Append new migrations here in version order. NEVER edit a published one.
 */
export const MIGRATIONS: readonly Migration[] = [V1_INITIAL_SCHEMA];

/** Latest schema version this build understands. */
export const SCHEMA_VERSION = MIGRATIONS[MIGRATIONS.length - 1]!.version;
