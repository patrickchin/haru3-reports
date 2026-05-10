/**
 * Schema alignment test — verifies that the Drizzle ORM schema at
 * `packages/api/src/db/schema.ts` matches the cumulative Supabase
 * migration result in `supabase/migrations/`.
 *
 * How this works: we import the Drizzle table objects and inspect their
 * column keys (the JS property names whose `.name` getter returns the
 * SQL column name). We assert against the expected column set derived
 * from reading every migration file in order.
 */

import { describe, it, expect } from 'vitest';
import {
  profiles,
  projects,
  projectMembers,
  reports,
  fileMetadata,
  reportNotes,
  tokenUsage,
} from '../schema';

// ---------------------------------------------------------------------------
// Helper: extract column names from a Drizzle table object.
// Drizzle tables expose columns as direct properties with a `.name` field.
// ---------------------------------------------------------------------------
function columnNames(table: Record<string, unknown>): Set<string> {
  const names = new Set<string>();
  for (const [, value] of Object.entries(table)) {
    if (
      value &&
      typeof value === 'object' &&
      'name' in value &&
      typeof (value as { name: unknown }).name === 'string'
    ) {
      names.add((value as { name: string }).name);
    }
  }
  return names;
}

function columnKeys(table: Record<string, unknown>): Set<string> {
  const keys = new Set<string>();
  for (const [key, value] of Object.entries(table)) {
    if (
      value &&
      typeof value === 'object' &&
      'name' in value &&
      typeof (value as { name: unknown }).name === 'string'
    ) {
      keys.add(key);
    }
  }
  return keys;
}

// ---------------------------------------------------------------------------
// Expected SQL column sets (cumulative result of all migrations)
// ---------------------------------------------------------------------------

const EXPECTED_PROFILES_COLS = new Set([
  'id',
  'phone',
  'full_name',
  'company_name',
  'avatar_url',
  'created_at',
  'updated_at',
]);

const EXPECTED_PROJECTS_COLS = new Set([
  'id',
  'owner_id',
  'name',
  'address',
  'client_name',
  'status',
  'deleted_at',
  'created_at',
  'updated_at',
]);

const EXPECTED_PROJECT_MEMBERS_COLS = new Set([
  'id',
  'project_id',
  'user_id',
  'role',
  'invited_by',
  'created_at',
  'updated_at', // added by 202604280001_local_first_pull_rpcs.sql
]);

const EXPECTED_REPORTS_COLS = new Set([
  'id',
  'project_id',
  'owner_id',
  'title',
  'report_type',
  'status',
  'visit_date',
  'confidence',
  'report_data',
  'last_generation',
  'last_processed_note_id',
  'deleted_at',
  'created_at',
  'updated_at',
]);

const EXPECTED_FILE_METADATA_COLS = new Set([
  'id',
  'project_id',
  'uploaded_by',
  'bucket',
  'storage_path',
  'category',
  'filename',
  'mime_type',
  'size_bytes',
  'duration_ms',
  // transcription — DROPPED by 202604300003
  // report_id    — DROPPED by 202604300003
  'width',
  'height',
  'thumbnail_path',
  'blurhash',
  'voice_title',
  'voice_summary',
  'upload_status',
  'local_uri',
  'deleted_at',
  'created_at',
  'updated_at',
]);

const EXPECTED_REPORT_NOTES_COLS = new Set([
  'id',
  'report_id',
  'project_id',
  'author_id',
  'position',
  'kind',
  'body',
  'file_id',
  'deleted_at',
  'created_at',
  'updated_at',
]);

const EXPECTED_TOKEN_USAGE_COLS = new Set([
  'id',
  'user_id',
  'project_id',
  'report_id',
  'input_tokens',
  'output_tokens',
  'cached_tokens',
  'model',
  'provider',
  'created_at',
]);

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Drizzle schema alignment with Supabase migrations', () => {
  describe('profiles', () => {
    it('has all expected columns', () => {
      const cols = columnNames(profiles as unknown as Record<string, unknown>);
      for (const expected of EXPECTED_PROFILES_COLS) {
        expect(cols.has(expected), `missing SQL column: ${expected}`).toBe(
          true,
        );
      }
    });

    it('has no extra columns beyond what migrations define', () => {
      const cols = columnNames(profiles as unknown as Record<string, unknown>);
      for (const col of cols) {
        expect(
          EXPECTED_PROFILES_COLS.has(col),
          `extra column in Drizzle not in migrations: ${col}`,
        ).toBe(true);
      }
    });
  });

  describe('projects', () => {
    it('has all expected columns', () => {
      const cols = columnNames(projects as unknown as Record<string, unknown>);
      for (const expected of EXPECTED_PROJECTS_COLS) {
        expect(cols.has(expected), `missing SQL column: ${expected}`).toBe(
          true,
        );
      }
    });

    it('has no extra columns beyond what migrations define', () => {
      const cols = columnNames(projects as unknown as Record<string, unknown>);
      for (const col of cols) {
        expect(
          EXPECTED_PROJECTS_COLS.has(col),
          `extra column in Drizzle not in migrations: ${col}`,
        ).toBe(true);
      }
    });
  });

  describe('project_members', () => {
    it('has all expected columns', () => {
      const cols = columnNames(
        projectMembers as unknown as Record<string, unknown>,
      );
      for (const expected of EXPECTED_PROJECT_MEMBERS_COLS) {
        expect(cols.has(expected), `missing SQL column: ${expected}`).toBe(
          true,
        );
      }
    });

    it('has no extra columns beyond what migrations define', () => {
      const cols = columnNames(
        projectMembers as unknown as Record<string, unknown>,
      );
      for (const col of cols) {
        expect(
          EXPECTED_PROJECT_MEMBERS_COLS.has(col),
          `extra column in Drizzle not in migrations: ${col}`,
        ).toBe(true);
      }
    });
  });

  describe('reports', () => {
    it('has all expected columns', () => {
      const cols = columnNames(reports as unknown as Record<string, unknown>);
      for (const expected of EXPECTED_REPORTS_COLS) {
        expect(cols.has(expected), `missing SQL column: ${expected}`).toBe(
          true,
        );
      }
    });

    it('has no extra columns beyond what migrations define', () => {
      const cols = columnNames(reports as unknown as Record<string, unknown>);
      for (const col of cols) {
        expect(
          EXPECTED_REPORTS_COLS.has(col),
          `extra column in Drizzle not in migrations: ${col}`,
        ).toBe(true);
      }
    });
  });

  describe('file_metadata', () => {
    it('has all expected columns', () => {
      const cols = columnNames(
        fileMetadata as unknown as Record<string, unknown>,
      );
      for (const expected of EXPECTED_FILE_METADATA_COLS) {
        expect(cols.has(expected), `missing SQL column: ${expected}`).toBe(
          true,
        );
      }
    });

    it('has no extra columns beyond what migrations define', () => {
      const cols = columnNames(
        fileMetadata as unknown as Record<string, unknown>,
      );
      for (const col of cols) {
        expect(
          EXPECTED_FILE_METADATA_COLS.has(col),
          `extra column in Drizzle not in migrations: ${col} — this column was dropped by migration 202604300003`,
        ).toBe(true);
      }
    });
  });

  describe('report_notes', () => {
    it('has all expected columns', () => {
      const cols = columnNames(
        reportNotes as unknown as Record<string, unknown>,
      );
      for (const expected of EXPECTED_REPORT_NOTES_COLS) {
        expect(cols.has(expected), `missing SQL column: ${expected}`).toBe(
          true,
        );
      }
    });

    it('has no extra columns beyond what migrations define', () => {
      const cols = columnNames(
        reportNotes as unknown as Record<string, unknown>,
      );
      for (const col of cols) {
        expect(
          EXPECTED_REPORT_NOTES_COLS.has(col),
          `extra column in Drizzle not in migrations: ${col}`,
        ).toBe(true);
      }
    });
  });

  describe('token_usage', () => {
    it('has all expected columns', () => {
      const cols = columnNames(
        tokenUsage as unknown as Record<string, unknown>,
      );
      for (const expected of EXPECTED_TOKEN_USAGE_COLS) {
        expect(cols.has(expected), `missing SQL column: ${expected}`).toBe(
          true,
        );
      }
    });

    it('has no extra columns beyond what migrations define', () => {
      const cols = columnNames(
        tokenUsage as unknown as Record<string, unknown>,
      );
      for (const col of cols) {
        expect(
          EXPECTED_TOKEN_USAGE_COLS.has(col),
          `extra column in Drizzle not in migrations: ${col}`,
        ).toBe(true);
      }
    });
  });
});
