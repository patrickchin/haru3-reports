/**
 * `better-sqlite3` adapter for unit tests only.
 *
 * Lives under lib/local-db/ rather than a `__tests__` folder so test files
 * can import it directly. Not bundled in the running app — `better-sqlite3`
 * is a devDependency and would fail to resolve in Metro.
 */
import Database from "better-sqlite3";

import type { SqlExecutor, SqlParam, SqlRow } from "./sql-executor";

export type BetterSqliteHandle = {
  db: SqlExecutor;
  close: () => void;
};

export function openInMemoryDb(): BetterSqliteHandle {
  const raw = new Database(":memory:");
  raw.pragma("journal_mode = MEMORY");
  raw.pragma("foreign_keys = ON");

  return {
    db: makeExecutor(raw),
    close: () => raw.close(),
  };
}

function makeExecutor(raw: Database.Database): SqlExecutor {
  const exec = async (sql: string, params: readonly SqlParam[] = []) => {
    if (params.length === 0) {
      raw.exec(sql);
    } else {
      raw.prepare(sql).run(...(params as SqlParam[]));
    }
  };

  const all = async <T extends SqlRow = SqlRow>(
    sql: string,
    params: readonly SqlParam[] = [],
  ): Promise<T[]> => {
    return raw.prepare(sql).all(...(params as SqlParam[])) as T[];
  };

  const get = async <T extends SqlRow = SqlRow>(
    sql: string,
    params: readonly SqlParam[] = [],
  ): Promise<T | null> => {
    const row = raw.prepare(sql).get(...(params as SqlParam[]));
    return (row as T | undefined) ?? null;
  };

  const transaction = async <T>(
    fn: (tx: SqlExecutor) => Promise<T>,
  ): Promise<T> => {
    raw.exec("BEGIN");
    try {
      const result = await fn({ exec, all, get, transaction });
      raw.exec("COMMIT");
      return result;
    } catch (err) {
      raw.exec("ROLLBACK");
      throw err;
    }
  };

  return { exec, all, get, transaction };
}
