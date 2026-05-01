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
 * v2 — outbox in-flight state column.
 *
 * Fixes a coalescing race in the push engine: previously the engine
 * picked rows with `attempts = 0`, then issued the RPC. A concurrent
 * local mutation could coalesce into that still-`attempts=0` row and
 * be silently dropped when the engine deleted the row on success.
 *
 * Each outbox row now carries an explicit lifecycle:
 *   queued            — eligible for picking; safe to coalesce into.
 *   in_flight         — currently being pushed; never coalesce into.
 *   permanent_failed  — exhausted retries; never picked again.
 *
 * Backfill is a no-op for default 'queued'. The engine resets any
 * orphaned `in_flight` rows back to `queued` on startup — safe because
 * the server is idempotent via `client_op_id`.
 */
const V2_OUTBOX_STATE: Migration = {
  version: 2,
  name: "outbox_state",
  sql: `
    ALTER TABLE outbox ADD COLUMN state TEXT NOT NULL DEFAULT 'queued';
    CREATE INDEX outbox_state_idx ON outbox (state, next_attempt_at);
  `,
};

/**
 * v3 — sibling column for the report conflict snapshot.
 *
 * Previously the push engine stashed the server's row under
 * `report_data_json._serverSnapshot` so the resolver could render a
 * diff. That conflated user-visible report content with sync metadata
 * — every read had to remember to strip the snapshot, and every diff
 * had to re-parse a nested JSON path.
 *
 * `conflict_snapshot_json` lives next to `report_data_json` and stores
 * the raw mutation response (id, title, status, notes, report_data,
 * updated_at, …). NULL means "no pending conflict".
 *
 * Backfill: existing rows in conflict — if any — keep their stashed
 * snapshot under `report_data_json._serverSnapshot`. The resolver
 * reads from both places during the migration window: prefer the
 * sibling column when present, fall back to the old path. Once all
 * known conflicts are resolved this fallback can be deleted.
 */
const V3_CONFLICT_SNAPSHOT_COLUMN: Migration = {
  version: 3,
  name: "report_conflict_snapshot_column",
  sql: `
    ALTER TABLE reports ADD COLUMN conflict_snapshot_json TEXT;
  `,
};

/**
 * v4 — report_notes table (multi-modal report inputs).
 *
 * Replaces the flat `notes_json TEXT` column on reports with a proper
 * relational table. Each note is either raw text or a reference to a
 * file in file_metadata (voice audio, image, video, document).
 *
 * The generation system uses `last_processed_note_id` (on reports) for
 * incremental generation instead of the old array-index count.
 */
const V4_REPORT_NOTES: Migration = {
  version: 4,
  name: "report_notes",
  sql: `
    CREATE TABLE report_notes (
      id              TEXT PRIMARY KEY,
      report_id       TEXT NOT NULL,
      project_id      TEXT NOT NULL,
      author_id       TEXT NOT NULL,
      position        INTEGER NOT NULL,
      kind            TEXT NOT NULL DEFAULT 'text',
      body            TEXT,
      file_id         TEXT,
      deleted_at      TEXT,
      created_at      TEXT NOT NULL,
      updated_at      TEXT NOT NULL,
      server_updated_at TEXT,
      local_updated_at  TEXT NOT NULL,
      sync_state      TEXT NOT NULL DEFAULT 'synced'
    );
    CREATE INDEX report_notes_report_position_idx ON report_notes (report_id, position);
    CREATE INDEX report_notes_project_idx ON report_notes (project_id);
    CREATE INDEX report_notes_sync_state_idx ON report_notes (sync_state);

    ALTER TABLE reports ADD COLUMN last_processed_note_id TEXT;
  `,
};

/**
 * v5 — Drop legacy `notes_json` column from reports.
 *
 * Report notes now live in the `report_notes` table (v4). The flat
 * `notes_json` TEXT column on `reports` is no longer read or written by
 * any code path, so we remove it to avoid confusion.
 *
 * `file_metadata.transcription` and `file_metadata.report_id` are kept
 * locally — the voice-note-machine still writes them as part of its
 * upload→transcribe→create-note pipeline — but they are no longer synced
 * to/from the server (the server columns were dropped in migration
 * 202604300003).
 */
const V5_DROP_NOTES_JSON: Migration = {
  version: 5,
  name: "drop_reports_notes_json",
  sql: `
    ALTER TABLE reports DROP COLUMN notes_json;
  `,
};

/**
 * V6 — Add `last_generation_json` to reports.
 *
 * Mirrors the new server column `reports.last_generation` (jsonb). Stored
 * as TEXT containing JSON; null means no generation has been recorded.
 * Persists the most recent generate-report request/response/usage/error
 * so the Debug tab can hydrate from disk after re-opening a draft.
 */
const V6_REPORT_LAST_GENERATION: Migration = {
  version: 6,
  name: "add_reports_last_generation",
  sql: `
    ALTER TABLE reports ADD COLUMN last_generation_json TEXT;
  `,
};

/**
 * v7 — Unique position per report (non-deleted rows only).
 *
 * Without this, two concurrent inserts (text note + voice transcription)
 * can both compute MAX(position)+1 and create rows with the same
 * position, making ordering non-deterministic.
 *
 * SQLite partial indexes use WHERE. Soft-deleted rows are excluded so
 * position gaps from deletions are harmless.
 *
 * IMPORTANT: existing on-device DBs already contain duplicate
 * (report_id, position) pairs from before this index existed (the same
 * race we're now preventing). If we just `CREATE UNIQUE INDEX`, SQLite
 * raises SQLITE_CONSTRAINT_UNIQUE, the migration throws, SyncProvider
 * falls back to `db=null`, and *every* local-first query is disabled —
 * the user sees no projects, no reports, no notes. Mirror the server
 * fix (supabase migration 202605010006): renumber duplicates first,
 * keeping the earliest row at its original position and bumping the
 * rest to the tail of the report. This file is being edited in place
 * (not a new migration) because v7 has never successfully applied to
 * any device that has the duplicates — its `user_version` was rolled
 * back by the failing transaction, so re-running the same version
 * number is safe and required.
 */
const V7_REPORT_NOTES_POSITION_UNIQUE: Migration = {
  version: 7,
  name: "report_notes_position_unique",
  sql: `
    DROP INDEX IF EXISTS report_notes_report_position_idx;

    -- Renumber duplicates: for each (report_id, position) collision,
    -- keep the earliest row (created_at, id) at its original position
    -- and bump the rest beyond MAX(position) for that report. The new
    -- numbers can't collide with each other or with existing rows.
    WITH duplicates AS (
      SELECT
        id,
        report_id,
        position,
        created_at,
        ROW_NUMBER() OVER (
          PARTITION BY report_id, position
          ORDER BY created_at, id
        ) AS dup_rank
      FROM report_notes
      WHERE deleted_at IS NULL
    ),
    report_max AS (
      SELECT report_id, MAX(position) AS max_pos
      FROM report_notes
      WHERE deleted_at IS NULL
      GROUP BY report_id
    ),
    renumbered AS (
      SELECT
        d.id,
        rm.max_pos
          + ROW_NUMBER() OVER (PARTITION BY d.report_id ORDER BY d.position, d.id)
          AS new_position
      FROM duplicates d
      JOIN report_max rm ON rm.report_id = d.report_id
      WHERE d.dup_rank > 1
    )
    UPDATE report_notes
    SET    position = (SELECT new_position FROM renumbered r WHERE r.id = report_notes.id),
           updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
           sync_state = CASE WHEN sync_state = 'synced' THEN 'pending' ELSE sync_state END
    WHERE id IN (SELECT id FROM renumbered);

    CREATE UNIQUE INDEX report_notes_report_position_uniq
      ON report_notes (report_id, position)
      WHERE deleted_at IS NULL;
  `,
};

/**
 * Append new migrations here in version order. NEVER edit a published one.
 */
export const MIGRATIONS: readonly Migration[] = [
  V1_INITIAL_SCHEMA,
  V2_OUTBOX_STATE,
  V3_CONFLICT_SNAPSHOT_COLUMN,
  V4_REPORT_NOTES,
  V5_DROP_NOTES_JSON,
  V6_REPORT_LAST_GENERATION,
  V7_REPORT_NOTES_POSITION_UNIQUE,
];

/** Latest schema version this build understands. */
export const SCHEMA_VERSION = MIGRATIONS[MIGRATIONS.length - 1]!.version;
