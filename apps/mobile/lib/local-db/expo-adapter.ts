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

export async function openLocalDb(userId: string): Promise<ExpoSqliteHandle> {
  if (!userId) {
    throw new Error("openLocalDb: userId is required");
  }
  const filename = `harpa-local-${userId}.db`;
  const raw = await SQLite.openDatabaseAsync(filename);
  await raw.execAsync("PRAGMA foreign_keys = ON");

  return {
    db: makeExecutor(raw),
    close: async () => {
      await raw.closeAsync();
    },
  };
}

function makeExecutor(raw: SQLite.SQLiteDatabase): SqlExecutor {
  const exec: SqlExecutor["exec"] = async (sql, params = []) => {
    if (params.length === 0) {
      // execAsync supports multiple statements; runAsync only one.
      await raw.execAsync(sql);
    } else {
      await raw.runAsync(sql, params as SqlParam[]);
    }
  };

  const all: SqlExecutor["all"] = async (sql, params = []) => {
    return (await raw.getAllAsync(sql, params as SqlParam[])) as SqlRow[] as never;
  };

  const get: SqlExecutor["get"] = async (sql, params = []) => {
    const row = await raw.getFirstAsync(sql, params as SqlParam[]);
    return (row as SqlRow | null) ?? null as never;
  };

  const transaction: SqlExecutor["transaction"] = async (fn) => {
    let result: unknown;
    await raw.withTransactionAsync(async () => {
      result = await fn({ exec, all, get, transaction });
    });
    return result as never;
  };

  return { exec, all, get, transaction };
}
