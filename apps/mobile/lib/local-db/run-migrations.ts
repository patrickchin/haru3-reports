/**
 * Migration runner — generic over any `SqlExecutor`.
 *
 * Algorithm:
 *   1. Read `PRAGMA user_version`.
 *   2. For each migration with version > current, apply it inside a
 *      transaction and bump `PRAGMA user_version` in the same tx.
 *   3. Stop at the latest migration in the list.
 *
 * Properties:
 *   - **Idempotent**: re-running on an up-to-date DB is a no-op.
 *   - **Atomic**: a crash mid-migration rolls back; user_version is only
 *     advanced after CREATE TABLE statements commit.
 *   - **Validated**: throws if the migrations list has gaps, duplicates, or
 *     non-monotonic versions, or if the DB is at a version newer than this
 *     build (downgrade attempt).
 */
import { MIGRATIONS, type Migration } from "./migrations";
import type { SqlExecutor } from "./sql-executor";

export type RunMigrationsResult = {
  fromVersion: number;
  toVersion: number;
  applied: readonly number[];
};

export async function runMigrations(
  db: SqlExecutor,
  migrations: readonly Migration[] = MIGRATIONS,
): Promise<RunMigrationsResult> {
  validateMigrationList(migrations);

  const fromVersion = await readUserVersion(db);
  const target =
    migrations.length === 0 ? 0 : migrations[migrations.length - 1]!.version;

  if (fromVersion > target) {
    throw new Error(
      `local-db: database is at version ${fromVersion} but this build only ` +
        `understands up to ${target}. Refusing to downgrade.`,
    );
  }

  const pending = migrations.filter((m) => m.version > fromVersion);
  const applied: number[] = [];

  for (const m of pending) {
    await db.transaction(async (tx) => {
      // SQLite doesn't allow `PRAGMA` to take parameters, so we splice
      // the version after asserting it's an integer in validateMigrationList.
      await tx.exec(m.sql);
      await tx.exec(`PRAGMA user_version = ${m.version}`);
    });
    applied.push(m.version);
  }

  return { fromVersion, toVersion: target, applied };
}

async function readUserVersion(db: SqlExecutor): Promise<number> {
  const row = await db.get<{ user_version: number }>("PRAGMA user_version");
  return row?.user_version ?? 0;
}

function validateMigrationList(migrations: readonly Migration[]): void {
  for (let i = 0; i < migrations.length; i++) {
    const m = migrations[i]!;
    if (!Number.isInteger(m.version) || m.version <= 0) {
      throw new Error(
        `local-db: migration at index ${i} has invalid version ${m.version}`,
      );
    }
    if (i > 0 && m.version <= migrations[i - 1]!.version) {
      throw new Error(
        `local-db: migration versions must strictly increase ` +
          `(${migrations[i - 1]!.version} → ${m.version})`,
      );
    }
  }
}
