/**
 * Single source of truth for which tables are pulled from the server,
 * and in what order.
 *
 * Order matters: parents (projects → reports → file_metadata) first so
 * child rows always have their FK targets locally when applied.
 * `report_notes` references reports + project + file_metadata, so it
 * pulls last.
 *
 * This module is deliberately dependency-free (no React, no expo) so
 * that `pull-rotation.test.ts` can import it under the Node-based
 * vitest runner. `SyncProvider.tsx` re-exports it.
 */
import {
  FILE_METADATA_PULLABLE,
  PROJECTS_PULLABLE,
  PROJECT_MEMBERS_PULLABLE,
  REPORTS_PULLABLE,
  REPORT_NOTES_PULLABLE,
  type PullableTable,
} from "./pull-engine";

export const PULLABLE_TABLES: readonly PullableTable[] = [
  PROJECTS_PULLABLE,
  REPORTS_PULLABLE,
  PROJECT_MEMBERS_PULLABLE,
  FILE_METADATA_PULLABLE,
  REPORT_NOTES_PULLABLE,
];
