import { describe, it, expect } from 'vitest';
import { getTableName } from 'drizzle-orm';
import * as schema from '../schema.js';

/**
 * Snapshot tests for schema exports — catches accidental additions,
 * removals, or renames of exported tables and types.
 */
describe('db/schema exports', () => {
  it('exports the expected set of table objects', () => {
    const tableNames = Object.keys(schema).filter(
      (key) => {
        const val = (schema as Record<string, unknown>)[key];
        return (
          val &&
          typeof val === 'object' &&
          // Drizzle tables have a Symbol.for('drizzle:Name') or a _ property
          ('_' in val || Symbol.for('drizzle:Name') in (val as object))
        );
      },
    );

    // Sort for stable comparison
    expect(tableNames.sort()).toEqual([
      'fileMetadata',
      'profiles',
      'projectMembers',
      'projects',
      'reportNotes',
      'reports',
      'tokenUsage',
    ]);
  });

  it('exports type aliases for each table', () => {
    const profileKeys = Object.keys(schema.profiles).filter(
      (k) => !k.startsWith('_') && !k.startsWith('$'),
    );
    expect(profileKeys).toContain('id');
    expect(profileKeys).toContain('phone');
    expect(profileKeys).toContain('fullName');
    expect(profileKeys).toContain('createdAt');
  });

  it.each([
    ['profiles', schema.profiles, 'profiles'],
    ['projects', schema.projects, 'projects'],
    ['reports', schema.reports, 'reports'],
    ['tokenUsage', schema.tokenUsage, 'token_usage'],
    ['fileMetadata', schema.fileMetadata, 'file_metadata'],
    ['reportNotes', schema.reportNotes, 'report_notes'],
    ['projectMembers', schema.projectMembers, 'project_members'],
  ] as const)('%s table has SQL name "%s"', (_label, table, expectedSqlName) => {
    expect(getTableName(table)).toBe(expectedSqlName);
  });
});
