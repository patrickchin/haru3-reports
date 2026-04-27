/**
 * Generic SQL executor interface decoupling the migration runner and
 * repositories from any specific driver.
 *
 * Two implementations live in this folder:
 *   - `expo-adapter.ts`   wraps `expo-sqlite` for the running app.
 *   - `better-sqlite-adapter.ts` wraps `better-sqlite3` for unit tests.
 *
 * Keeping the surface tiny makes both adapters trivial to write and keeps
 * the rest of the local-first stack (migrations, repositories, sync engine)
 * fully unit-testable in Node.
 */

export type SqlParam = string | number | null;

export type SqlRow = Record<string, SqlParam>;

export interface SqlExecutor {
  /** Execute a statement that returns no rows. */
  exec(sql: string, params?: readonly SqlParam[]): Promise<void>;

  /** Execute a query and return all matching rows. */
  all<T extends SqlRow = SqlRow>(
    sql: string,
    params?: readonly SqlParam[],
  ): Promise<T[]>;

  /** Execute a query and return the first row, or null. */
  get<T extends SqlRow = SqlRow>(
    sql: string,
    params?: readonly SqlParam[],
  ): Promise<T | null>;

  /**
   * Run `fn` inside a transaction. The implementation must:
   *   - issue BEGIN before calling `fn`,
   *   - issue COMMIT if `fn` resolves,
   *   - issue ROLLBACK if `fn` throws (and re-throw the error).
   *
   * Nested transactions are not supported — callers must not call
   * `transaction` from within a transaction.
   */
  transaction<T>(fn: (tx: SqlExecutor) => Promise<T>): Promise<T>;
}
