import { describe, it, expect } from 'vitest';
import { keys } from '../../api/keys';

describe('query key factories', () => {
  // ---------------------------------------------------------------------------
  // Projects
  // ---------------------------------------------------------------------------

  describe('projects', () => {
    it('all is a stable reference', () => {
      expect(keys.projects.all).toEqual(['projects']);
    });

    it('list() extends all', () => {
      expect(keys.projects.list()).toEqual(['projects', 'list']);
    });

    it('detail(id) includes id', () => {
      expect(keys.projects.detail('abc-123')).toEqual([
        'projects',
        'detail',
        'abc-123',
      ]);
    });

    it('detail keys differ by id', () => {
      expect(keys.projects.detail('a')).not.toEqual(keys.projects.detail('b'));
    });
  });

  // ---------------------------------------------------------------------------
  // Reports
  // ---------------------------------------------------------------------------

  describe('reports', () => {
    it('list(projectId) includes projectId', () => {
      expect(keys.reports.list('proj-1')).toEqual([
        'reports',
        'list',
        'proj-1',
      ]);
    });

    it('detail(id) includes id', () => {
      expect(keys.reports.detail('rpt-1')).toEqual([
        'reports',
        'detail',
        'rpt-1',
      ]);
    });
  });

  // ---------------------------------------------------------------------------
  // Notes
  // ---------------------------------------------------------------------------

  describe('notes', () => {
    it('list(reportId) includes reportId', () => {
      expect(keys.notes.list('rpt-1')).toEqual(['notes', 'list', 'rpt-1']);
    });
  });

  // ---------------------------------------------------------------------------
  // Files
  // ---------------------------------------------------------------------------

  describe('files', () => {
    it('list(projectId) includes projectId', () => {
      expect(keys.files.list('proj-1')).toEqual(['files', 'list', 'proj-1']);
    });

    it('detail(id) includes id', () => {
      expect(keys.files.detail('f-1')).toEqual(['files', 'detail', 'f-1']);
    });
  });

  // ---------------------------------------------------------------------------
  // Members
  // ---------------------------------------------------------------------------

  describe('members', () => {
    it('list(projectId) includes projectId', () => {
      expect(keys.members.list('proj-1')).toEqual([
        'members',
        'list',
        'proj-1',
      ]);
    });
  });

  // ---------------------------------------------------------------------------
  // Profile
  // ---------------------------------------------------------------------------

  describe('profile', () => {
    it('current() key', () => {
      expect(keys.profile.current()).toEqual(['profile', 'current']);
    });

    it('usage() key', () => {
      expect(keys.profile.usage()).toEqual(['profile', 'usage']);
    });

    it('usageHistory() key', () => {
      expect(keys.profile.usageHistory()).toEqual([
        'profile',
        'usage-history',
      ]);
    });
  });

  // ---------------------------------------------------------------------------
  // AI
  // ---------------------------------------------------------------------------

  describe('ai', () => {
    it('providers() key', () => {
      expect(keys.ai.providers()).toEqual(['ai', 'providers']);
    });

    it('settings() key', () => {
      expect(keys.ai.settings()).toEqual(['ai', 'settings']);
    });
  });

  // ---------------------------------------------------------------------------
  // Key hierarchy
  // ---------------------------------------------------------------------------

  describe('key hierarchy', () => {
    it('list key starts with all key', () => {
      const all = keys.projects.all;
      const list = keys.projects.list();
      expect(list.slice(0, all.length)).toEqual(all);
    });

    it('detail key starts with all key', () => {
      const all = keys.reports.all;
      const detail = keys.reports.detail('x');
      expect(detail.slice(0, all.length)).toEqual(all);
    });

    it('different resource keys are disjoint', () => {
      expect(keys.projects.all[0]).not.toBe(keys.reports.all[0]);
      expect(keys.files.all[0]).not.toBe(keys.notes.all[0]);
    });
  });
});
