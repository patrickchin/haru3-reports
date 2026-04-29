/**
 * `expo-sqlite` adapter for the running app.
 *
 * Wraps an `expo-sqlite` SQLiteDatabase in our `SqlExecutor` interface.
 *
 * Per-user database file: `harpa-local-${userId}.db`. On logout the caller
 * is expected to close the handle and delete the file (handled in a later
 * phase by the auth flow).
 */
import * as SQLite from "expo-sqlite";

import type { SqlExecutor, SqlParam, SqlRow } from "./sql-executor";

export type ExpoSqliteHandle = {
  db: SqlExecutor;
  close: () => Promise<void>;
};

function fileNameFor(userId: string): string {
  return `harpa-local-${userId}.db`;
}

export async function openLocalDb(userId: string): Promise<ExpoSqliteHandle> {
  if (!userId) {
    throw new Error("openLocalDb: userId is required");
  }
  const filename = fileNameFor(userId);
  const raw = await SQLite.openDatabaseAsync(filename);
  await raw.execAsync("PRAGMA foreign_keys = ON");

  return {
    db: makeExecutor(raw),
    close: async () => {
      await raw.closeAsync();
    },
  };
}

/**
 * Delete the per-user SQLite file (and its WAL/SHM siblings).
 *
 * Called on logout so a shared device does not leave one user's reports,
 * voice-note paths, and outbox payloads on disk for the next user. The
 * caller MUST close the handle first.
 *
 * Idempotent — a missing file is not an error.
 */
export async function deleteLocalDb(userId: string): Promise<void> {
  if (!userId) return;
  try {
    await SQLite.deleteDatabaseAsync(fileNameFor(userId));
  } catch (err) {
    // Log but do not throw — logout must always succeed.
    // eslint-disable-next-line no-console
    console.warn("[local-db] deleteLocalDb failed", err);
  }
}

function makeExecutor(raw: SQLite.SQLiteDatabase): SqlExecutor {
  const exec = async (
    sql: string,
    params: readonly SqlParam[] = [],
  ): Promise<void> => {
    if (params.length === 0) {
      // execAsync supports multiple statements; runAsync only one.
      await raw.execAsync(sql);
    } else {
      await raw.runAsync(sql, params as SqlParam[]);
    }
  };

  const all = async <T extends SqlRow = SqlRow>(
    sql: string,
    params: readonly SqlParam[] = [],
  ): Promise<T[]> => {
    return (await raw.getAllAsync(sql, params as SqlParam[])) as T[];
  };

  const get = async <T extends SqlRow = SqlRow>(
    sql: string,
    params: readonly SqlParam[] = [],
  ): Promise<T | null> => {
    const row = await raw.getFirstAsync(sql, params as SqlParam[]);
    return (row as T | null) ?? null;
  };

  const transaction = async <T>(
    fn: (tx: SqlExecutor) => Promise<T>,
  ): Promise<T> => {
    let result: unknown;
    await raw.withTransactionAsync(async () => {
      result = await fn({ exec, all, get, transaction });
    });
    return result as T;
  };

  return { exec, all, get, transaction };
}
