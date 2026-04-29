/**
 * Public entry-point for the local-first SQLite layer.
 *
 * Phase 0 surface — only stand up the database. Repositories, sync engine,
 * and UI wiring land in later phases.
 */
export type { SqlExecutor, SqlParam, SqlRow } from "./sql-executor";
export { MIGRATIONS, SCHEMA_VERSION, type Migration } from "./migrations";
export { runMigrations, type RunMigrationsResult } from "./run-migrations";
export { openLocalDb, deleteLocalDb, type ExpoSqliteHandle } from "./expo-adapter";
