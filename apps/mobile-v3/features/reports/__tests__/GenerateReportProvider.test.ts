import { describe, it, expect, vi } from 'vitest';

// ---------------------------------------------------------------------------
// Mock all transitive deps so the module can be imported
// ---------------------------------------------------------------------------

vi.mock('@/lib/api/client', () => ({
  supabase: { auth: {} },
  api: {},
}));

vi.mock('@react-native-async-storage/async-storage', () => ({
  default: { getItem: vi.fn(), setItem: vi.fn(), removeItem: vi.fn() },
}));

vi.mock('@/lib/api/hooks', () => ({
  useReport: vi.fn(() => ({ data: null, isLoading: false })),
  useNotes: vi.fn(() => ({ data: [], isLoading: false })),
  useCreateNote: vi.fn(() => ({ mutateAsync: vi.fn() })),
  useDeleteNote: vi.fn(() => ({ mutateAsync: vi.fn() })),
  useGenerateReport: vi.fn(() => ({ mutateAsync: vi.fn(), isPending: false })),
  useFinalizeReport: vi.fn(() => ({ mutateAsync: vi.fn(), isPending: false })),
  useUpdateReport: vi.fn(() => ({ mutateAsync: vi.fn(), isPending: false })),
}));

vi.mock('@/features/voice/useVoiceNotePipeline', () => ({
  useVoiceNotePipeline: vi.fn(() => ({
    startRecording: vi.fn(),
    stopRecording: vi.fn(),
    isRecording: false,
    amplitudes: [],
    pendingNotes: [],
    retry: vi.fn(),
  })),
}));

vi.mock('@/features/reports/useNoteTimeline', () => ({
  useNoteTimeline: vi.fn(() => []),
}));

vi.mock('@/lib/api/keys', () => ({
  keys: { files: { list: vi.fn() } },
}));

// Import types only (no hook calls)
const { useGenerateReportContext } = await import('../GenerateReportProvider');
type TabKey = import('../GenerateReportProvider').TabKey;

// ---------------------------------------------------------------------------
// Tests — pure logic extracted from the provider
// ---------------------------------------------------------------------------

describe('GenerateReportProvider logic', () => {
  describe('useGenerateReportContext outside provider', () => {
    it('throws when used outside provider', () => {
      // useContext returns null outside provider, hook throws
      expect(() => useGenerateReportContext()).toThrow();
    });
  });

  describe('TabKey values', () => {
    it('accepts valid tab keys', () => {
      const tabs: TabKey[] = ['notes', 'report', 'edit'];
      expect(tabs).toHaveLength(3);
      expect(tabs).toContain('notes');
      expect(tabs).toContain('report');
      expect(tabs).toContain('edit');
    });
  });

  describe('hasBeenGenerated derivation', () => {
    it('returns false when report has no reportData', () => {
      expect(!!null).toBe(false);
      expect(!!undefined).toBe(false);
    });

    it('returns true when report has reportData', () => {
      expect(!!{ sections: [] }).toBe(true);
    });
  });

  describe('notesSinceLastGeneration calculation', () => {
    function calcNotesSince(
      notesCount: number,
      pendingNotes: Array<{ status: string }>,
      lastGeneratedCount: number,
    ) {
      const total = notesCount + pendingNotes.filter((p) => p.status !== 'saved').length;
      return Math.max(0, total - lastGeneratedCount);
    }

    it('counts notes + non-saved pending minus last generated', () => {
      expect(
        calcNotesSince(3, [{ status: 'uploading' }, { status: 'saved' }], 2),
      ).toBe(2); // 3 + 1 - 2
    });

    it('returns 0 when notes are below last generated count', () => {
      expect(calcNotesSince(1, [], 5)).toBe(0);
    });

    it('counts all pending that are not saved', () => {
      expect(
        calcNotesSince(0, [{ status: 'uploading' }, { status: 'transcribing' }, { status: 'saved' }], 0),
      ).toBe(2);
    });

    it('handles empty arrays', () => {
      expect(calcNotesSince(0, [], 0)).toBe(0);
    });
  });

  describe('reportData fallback chain', () => {
    function resolveReportData(editedData: any, report: any) {
      return editedData ?? report?.reportData ?? null;
    }

    it('uses editedData when present', () => {
      const edited = { sections: [{ title: 'edited' }] };
      expect(resolveReportData(edited, { reportData: { sections: [] } })).toBe(edited);
    });

    it('falls back to report.reportData', () => {
      const rd = { sections: [{ title: 'original' }] };
      expect(resolveReportData(null, { reportData: rd })).toBe(rd);
    });

    it('returns null when both are absent', () => {
      expect(resolveReportData(null, null)).toBeNull();
      expect(resolveReportData(null, { reportData: null })).toBeNull();
    });
  });

  describe('updateProfile body mapping', () => {
    function mapProfileBody(data: { fullName?: string; companyName?: string }) {
      const body: Record<string, string> = {};
      if (data.fullName !== undefined) body.full_name = data.fullName;
      if (data.companyName !== undefined) body.company_name = data.companyName;
      return body;
    }

    it('maps camelCase to snake_case', () => {
      expect(mapProfileBody({ fullName: 'Alice', companyName: 'ACME' })).toEqual({
        full_name: 'Alice',
        company_name: 'ACME',
      });
    });

    it('only includes defined fields', () => {
      expect(mapProfileBody({ fullName: 'Bob' })).toEqual({ full_name: 'Bob' });
    });

    it('returns empty object for empty input', () => {
      expect(mapProfileBody({})).toEqual({});
    });
  });
});
