import { describe, it, expect } from 'vitest';
import {
  AI_PROVIDERS,
  DEFAULT_PROVIDER,
  PROVIDER_MODELS,
  REPORT_TYPES,
  REPORT_STATUSES,
  PROJECT_STATUSES,
  PROJECT_ROLES,
  MEMBER_ROLES,
  FILE_CATEGORIES,
  NOTE_KINDS,
  UPLOAD_STATUSES,
  STORAGE_BUCKETS,
} from '../constants';
import type {
  AiProvider,
  ReportType,
  ReportStatus,
  ProjectStatus,
  ProjectRole,
  MemberRole,
  FileCategory,
  NoteKind,
  UploadStatus,
  StorageBucket,
} from '../constants';

// ---------------------------------------------------------------------------
// Constants – enum-like tuples
// ---------------------------------------------------------------------------

describe('constants', () => {
  describe('AI_PROVIDERS', () => {
    it('contains all expected providers', () => {
      expect(AI_PROVIDERS).toEqual([
        'kimi',
        'openai',
        'anthropic',
        'google',
        'zai',
        'deepseek',
      ]);
    });

    it('is a readonly tuple (length is fixed)', () => {
      expect(AI_PROVIDERS.length).toBe(6);
    });
  });

  describe('DEFAULT_PROVIDER', () => {
    it('is a valid AI provider', () => {
      expect((AI_PROVIDERS as readonly string[]).includes(DEFAULT_PROVIDER)).toBe(
        true,
      );
    });

    it('equals "kimi"', () => {
      expect(DEFAULT_PROVIDER).toBe('kimi');
    });
  });

  describe('PROVIDER_MODELS', () => {
    it('has an entry for every AI provider', () => {
      for (const provider of AI_PROVIDERS) {
        expect(PROVIDER_MODELS).toHaveProperty(provider);
      }
    });

    it('each entry has a default and available array', () => {
      for (const provider of AI_PROVIDERS) {
        const entry = PROVIDER_MODELS[provider];
        expect(typeof entry.default).toBe('string');
        expect(Array.isArray(entry.available)).toBe(true);
        expect(entry.available.length).toBeGreaterThan(0);
      }
    });

    it('default model is included in available list', () => {
      for (const provider of AI_PROVIDERS) {
        const entry = PROVIDER_MODELS[provider];
        expect(entry.available).toContain(entry.default);
      }
    });
  });

  describe('REPORT_TYPES', () => {
    it('contains expected report types', () => {
      expect(REPORT_TYPES).toEqual([
        'daily',
        'safety',
        'incident',
        'inspection',
        'site_visit',
        'progress',
      ]);
    });

    it('has at least one element', () => {
      expect(REPORT_TYPES.length).toBeGreaterThan(0);
    });
  });

  describe('REPORT_STATUSES', () => {
    it('contains draft and final', () => {
      expect(REPORT_STATUSES).toEqual(['draft', 'final']);
    });
  });

  describe('PROJECT_STATUSES', () => {
    it('contains expected statuses', () => {
      expect(PROJECT_STATUSES).toEqual([
        'active',
        'delayed',
        'completed',
        'archived',
      ]);
    });
  });

  describe('PROJECT_ROLES', () => {
    it('contains expected roles including owner', () => {
      expect(PROJECT_ROLES).toEqual(['owner', 'admin', 'editor', 'viewer']);
    });
  });

  describe('MEMBER_ROLES', () => {
    it('is a subset of PROJECT_ROLES (without owner)', () => {
      expect(MEMBER_ROLES).toEqual(['admin', 'editor', 'viewer']);
      for (const role of MEMBER_ROLES) {
        expect((PROJECT_ROLES as readonly string[]).includes(role)).toBe(true);
      }
    });
  });

  describe('FILE_CATEGORIES', () => {
    it('contains expected categories', () => {
      expect(FILE_CATEGORIES).toEqual([
        'document',
        'image',
        'voice-note',
        'attachment',
        'icon',
      ]);
    });
  });

  describe('NOTE_KINDS', () => {
    it('contains expected kinds', () => {
      expect(NOTE_KINDS).toEqual(['text', 'voice', 'image', 'video', 'document']);
    });
  });

  describe('UPLOAD_STATUSES', () => {
    it('contains expected statuses', () => {
      expect(UPLOAD_STATUSES).toEqual(['pending', 'completed', 'failed']);
    });
  });

  describe('STORAGE_BUCKETS', () => {
    it('contains expected buckets', () => {
      expect(STORAGE_BUCKETS).toEqual(['project-files', 'avatars']);
    });
  });
});

// ---------------------------------------------------------------------------
// Type-level checks (compile-time only, no runtime assertions needed)
// ---------------------------------------------------------------------------

describe('type safety', () => {
  it('AiProvider type matches tuple values', () => {
    const valid: AiProvider = 'openai';
    expect(AI_PROVIDERS).toContain(valid);
  });

  it('ReportType type matches tuple values', () => {
    const valid: ReportType = 'daily';
    expect(REPORT_TYPES).toContain(valid);
  });

  it('ReportStatus type matches tuple values', () => {
    const valid: ReportStatus = 'draft';
    expect(REPORT_STATUSES).toContain(valid);
  });

  it('ProjectStatus type matches tuple values', () => {
    const valid: ProjectStatus = 'active';
    expect(PROJECT_STATUSES).toContain(valid);
  });

  it('ProjectRole type matches tuple values', () => {
    const valid: ProjectRole = 'owner';
    expect(PROJECT_ROLES).toContain(valid);
  });

  it('MemberRole type matches tuple values', () => {
    const valid: MemberRole = 'viewer';
    expect(MEMBER_ROLES).toContain(valid);
  });

  it('FileCategory type matches tuple values', () => {
    const valid: FileCategory = 'image';
    expect(FILE_CATEGORIES).toContain(valid);
  });

  it('NoteKind type matches tuple values', () => {
    const valid: NoteKind = 'voice';
    expect(NOTE_KINDS).toContain(valid);
  });

  it('UploadStatus type matches tuple values', () => {
    const valid: UploadStatus = 'pending';
    expect(UPLOAD_STATUSES).toContain(valid);
  });

  it('StorageBucket type matches tuple values', () => {
    const valid: StorageBucket = 'avatars';
    expect(STORAGE_BUCKETS).toContain(valid);
  });
});
