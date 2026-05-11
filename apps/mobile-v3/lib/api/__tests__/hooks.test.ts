import { describe, it, expect, vi, beforeEach } from 'vitest';
import { keys } from '../keys';

// ---------------------------------------------------------------------------
// Mock the api client
// ---------------------------------------------------------------------------

const mockGET = vi.fn();
const mockPOST = vi.fn();
const mockPATCH = vi.fn();
const mockPUT = vi.fn();
const mockDELETE = vi.fn();

vi.mock('../client', () => ({
  api: {
    GET: mockGET,
    POST: mockPOST,
    PATCH: mockPATCH,
    PUT: mockPUT,
    DELETE: mockDELETE,
  },
}));

// Mock react-query to extract queryFn/mutationFn without rendering
const capturedQueries: Record<string, any> = {};
const capturedMutations: Record<string, any> = {};
const mockInvalidateQueries = vi.fn();

vi.mock('@tanstack/react-query', () => ({
  useQuery: (opts: any) => {
    capturedQueries[JSON.stringify(opts.queryKey)] = opts;
    return { data: undefined, isLoading: false };
  },
  useMutation: (opts: any) => {
    const key = `mutation-${Object.keys(capturedMutations).length}`;
    capturedMutations[key] = opts;
    return {
      mutateAsync: opts.mutationFn,
      mutate: opts.mutationFn,
    };
  },
  useQueryClient: () => ({
    invalidateQueries: mockInvalidateQueries,
  }),
}));

// ---------------------------------------------------------------------------
// Import hooks (they register via the mocked useQuery/useMutation)
// ---------------------------------------------------------------------------

const hooks = await import('../hooks');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function successResponse(data: any) {
  return { data: { data }, error: undefined };
}

function errorResponse(error: any) {
  return { data: undefined, error };
}

beforeEach(() => {
  vi.clearAllMocks();
  Object.keys(capturedQueries).forEach((k) => delete capturedQueries[k]);
  Object.keys(capturedMutations).forEach((k) => delete capturedMutations[k]);
});

// ---------------------------------------------------------------------------
// Projects
// ---------------------------------------------------------------------------

describe('useProjects', () => {
  it('uses correct query key', () => {
    hooks.useProjects();
    const key = JSON.stringify(keys.projects.list());
    expect(capturedQueries[key]).toBeDefined();
    expect(capturedQueries[key].queryKey).toEqual(keys.projects.list());
  });

  it('queryFn calls api.GET with correct path', async () => {
    mockGET.mockResolvedValueOnce(successResponse([{ id: 'p1' }]));
    hooks.useProjects({ status: 'active' });
    const key = JSON.stringify(keys.projects.list());
    const result = await capturedQueries[key].queryFn();
    expect(mockGET).toHaveBeenCalledWith('/api/v1/projects', expect.anything());
    expect(result).toEqual([{ id: 'p1' }]);
  });
});

describe('useProject', () => {
  it('uses correct query key with id', () => {
    hooks.useProject('proj-1');
    const key = JSON.stringify(keys.projects.detail('proj-1'));
    expect(capturedQueries[key]).toBeDefined();
  });

  it('is disabled when id is empty', () => {
    hooks.useProject('');
    const key = JSON.stringify(keys.projects.detail(''));
    expect(capturedQueries[key].enabled).toBe(false);
  });

  it('queryFn calls api.GET with path param', async () => {
    mockGET.mockResolvedValueOnce(successResponse({ id: 'proj-1', name: 'Test' }));
    hooks.useProject('proj-1');
    const key = JSON.stringify(keys.projects.detail('proj-1'));
    const result = await capturedQueries[key].queryFn();
    expect(mockGET).toHaveBeenCalledWith('/api/v1/projects/{id}', expect.objectContaining({
      params: { path: { id: 'proj-1' } },
    }));
  });
});

describe('useCreateProject', () => {
  it('calls api.POST with body', async () => {
    mockPOST.mockResolvedValueOnce(successResponse({ id: 'new-1', name: 'New' }));
    const { mutateAsync } = hooks.useCreateProject() as any;
    await mutateAsync({ name: 'New', address: '123 St' });
    expect(mockPOST).toHaveBeenCalledWith('/api/v1/projects', expect.objectContaining({
      body: { name: 'New', address: '123 St' },
    }));
  });
});

describe('useUpdateProject', () => {
  it('calls api.PATCH with id in path and body', async () => {
    mockPATCH.mockResolvedValueOnce(successResponse({ id: 'p1', name: 'Updated' }));
    const { mutateAsync } = hooks.useUpdateProject() as any;
    await mutateAsync({ id: 'p1', name: 'Updated' });
    expect(mockPATCH).toHaveBeenCalledWith('/api/v1/projects/{id}', expect.objectContaining({
      params: { path: { id: 'p1' } },
    }));
  });
});

describe('useDeleteProject', () => {
  it('calls api.DELETE with id in path', async () => {
    mockDELETE.mockResolvedValueOnce({ data: {}, error: undefined });
    const { mutateAsync } = hooks.useDeleteProject() as any;
    await mutateAsync('p1');
    expect(mockDELETE).toHaveBeenCalledWith('/api/v1/projects/{id}', expect.objectContaining({
      params: { path: { id: 'p1' } },
    }));
  });
});

// ---------------------------------------------------------------------------
// Members
// ---------------------------------------------------------------------------

describe('useMembers', () => {
  it('uses correct query key with projectId', () => {
    hooks.useMembers('proj-1');
    const key = JSON.stringify(keys.members.list('proj-1'));
    expect(capturedQueries[key]).toBeDefined();
  });

  it('is disabled when projectId is empty', () => {
    hooks.useMembers('');
    const key = JSON.stringify(keys.members.list(''));
    expect(capturedQueries[key].enabled).toBe(false);
  });
});

describe('useAddMember', () => {
  it('calls api.POST with projectId in path', async () => {
    mockPOST.mockResolvedValueOnce(successResponse({ id: 'm1' }));
    const { mutateAsync } = hooks.useAddMember() as any;
    await mutateAsync({ projectId: 'p1', phone: '+1234', role: 'editor' });
    expect(mockPOST).toHaveBeenCalledWith('/api/v1/projects/{id}/members', expect.objectContaining({
      params: { path: { id: 'p1' } },
    }));
  });
});

describe('useRemoveMember', () => {
  it('calls api.DELETE with projectId and userId', async () => {
    mockDELETE.mockResolvedValueOnce({ data: {}, error: undefined });
    const { mutateAsync } = hooks.useRemoveMember() as any;
    await mutateAsync({ projectId: 'p1', userId: 'u1' });
    expect(mockDELETE).toHaveBeenCalledWith('/api/v1/projects/{id}/members/{userId}', expect.objectContaining({
      params: { path: { id: 'p1', userId: 'u1' } },
    }));
  });
});

// ---------------------------------------------------------------------------
// Reports
// ---------------------------------------------------------------------------

describe('useReports', () => {
  it('uses correct query key', () => {
    hooks.useReports('proj-1');
    const key = JSON.stringify(keys.reports.list('proj-1'));
    expect(capturedQueries[key]).toBeDefined();
    expect(capturedQueries[key].enabled).toBe(true);
  });

  it('queryFn calls api.GET with projectId path', async () => {
    mockGET.mockResolvedValueOnce(successResponse([{ id: 'r1' }]));
    hooks.useReports('proj-1');
    const key = JSON.stringify(keys.reports.list('proj-1'));
    await capturedQueries[key].queryFn();
    expect(mockGET).toHaveBeenCalledWith('/api/v1/projects/{projectId}/reports', expect.anything());
  });
});

describe('useReport', () => {
  it('uses correct query key', () => {
    hooks.useReport('r1');
    const key = JSON.stringify(keys.reports.detail('r1'));
    expect(capturedQueries[key]).toBeDefined();
  });

  it('is disabled when id is empty', () => {
    hooks.useReport('');
    const key = JSON.stringify(keys.reports.detail(''));
    expect(capturedQueries[key].enabled).toBe(false);
  });
});

describe('useCreateReport', () => {
  it('calls api.POST with projectId and body', async () => {
    mockPOST.mockResolvedValueOnce(successResponse({ id: 'r-new' }));
    const { mutateAsync } = hooks.useCreateReport() as any;
    await mutateAsync({ projectId: 'p1', title: 'Site Visit' });
    expect(mockPOST).toHaveBeenCalledWith('/api/v1/projects/{projectId}/reports', expect.objectContaining({
      params: { path: { projectId: 'p1' } },
    }));
  });
});

describe('useDeleteReport', () => {
  it('calls api.DELETE with report id', async () => {
    mockDELETE.mockResolvedValueOnce({ data: {}, error: undefined });
    const { mutateAsync } = hooks.useDeleteReport() as any;
    await mutateAsync('r1');
    expect(mockDELETE).toHaveBeenCalledWith('/api/v1/reports/{id}', expect.objectContaining({
      params: { path: { id: 'r1' } },
    }));
  });
});

describe('useGenerateReport', () => {
  it('calls api.POST to generate endpoint', async () => {
    mockPOST.mockResolvedValueOnce(successResponse({ id: 'r1', status: 'generating' }));
    const { mutateAsync } = hooks.useGenerateReport() as any;
    await mutateAsync('r1');
    expect(mockPOST).toHaveBeenCalledWith('/api/v1/reports/{id}/generate', expect.anything());
  });
});

describe('useFinalizeReport', () => {
  it('calls api.POST to finalize endpoint', async () => {
    mockPOST.mockResolvedValueOnce(successResponse({ id: 'r1', status: 'finalized' }));
    const { mutateAsync } = hooks.useFinalizeReport() as any;
    await mutateAsync('r1');
    expect(mockPOST).toHaveBeenCalledWith('/api/v1/reports/{id}/finalize', expect.anything());
  });
});

// ---------------------------------------------------------------------------
// Notes
// ---------------------------------------------------------------------------

describe('useNotes', () => {
  it('uses correct query key', () => {
    hooks.useNotes('r1');
    const key = JSON.stringify(keys.notes.list('r1'));
    expect(capturedQueries[key]).toBeDefined();
  });

  it('is disabled when reportId is empty', () => {
    hooks.useNotes('');
    const key = JSON.stringify(keys.notes.list(''));
    expect(capturedQueries[key].enabled).toBe(false);
  });
});

describe('useCreateNote', () => {
  it('calls api.POST with reportId and body', async () => {
    mockPOST.mockResolvedValueOnce(successResponse({ id: 'n1' }));
    const { mutateAsync } = hooks.useCreateNote() as any;
    await mutateAsync({ reportId: 'r1', kind: 'voice', body: 'hello' });
    expect(mockPOST).toHaveBeenCalledWith('/api/v1/reports/{reportId}/notes', expect.objectContaining({
      params: { path: { reportId: 'r1' } },
    }));
  });
});

describe('useDeleteNote', () => {
  it('calls api.DELETE with reportId and note id', async () => {
    mockDELETE.mockResolvedValueOnce({ data: {}, error: undefined });
    const { mutateAsync } = hooks.useDeleteNote() as any;
    await mutateAsync({ reportId: 'r1', id: 'n1' });
    expect(mockDELETE).toHaveBeenCalledWith('/api/v1/reports/{reportId}/notes/{id}', expect.objectContaining({
      params: { path: { reportId: 'r1', id: 'n1' } },
    }));
  });
});

describe('useReorderNotes', () => {
  it('calls api.POST with noteIds body', async () => {
    mockPOST.mockResolvedValueOnce({ data: {}, error: undefined });
    const { mutateAsync } = hooks.useReorderNotes() as any;
    await mutateAsync({ reportId: 'r1', noteIds: ['n2', 'n1', 'n3'] });
    expect(mockPOST).toHaveBeenCalledWith('/api/v1/reports/{reportId}/notes/reorder', expect.objectContaining({
      params: { path: { reportId: 'r1' } },
      body: { noteIds: ['n2', 'n1', 'n3'] },
    }));
  });
});

// ---------------------------------------------------------------------------
// Files
// ---------------------------------------------------------------------------

describe('useFiles', () => {
  it('uses correct query key', () => {
    hooks.useFiles('p1');
    const key = JSON.stringify(keys.files.list('p1'));
    expect(capturedQueries[key]).toBeDefined();
  });
});

describe('usePresignUpload', () => {
  it('calls api.POST to presign endpoint', async () => {
    mockPOST.mockResolvedValueOnce(successResponse({ signedUrl: 'https://s3/...', storagePath: 'voice/abc' }));
    const { mutateAsync } = hooks.usePresignUpload() as any;
    const result = await mutateAsync({ fileName: 'a.m4a', mimeType: 'audio/m4a', category: 'voice' });
    expect(mockPOST).toHaveBeenCalledWith('/api/v1/uploads/presign', expect.anything());
    expect(result).toEqual({ signedUrl: 'https://s3/...', storagePath: 'voice/abc' });
  });
});

describe('useDeleteFile', () => {
  it('calls api.DELETE with file id', async () => {
    mockDELETE.mockResolvedValueOnce({ data: {}, error: undefined });
    const { mutateAsync } = hooks.useDeleteFile() as any;
    await mutateAsync('f1');
    expect(mockDELETE).toHaveBeenCalledWith('/api/v1/files/{id}', expect.objectContaining({
      params: { path: { id: 'f1' } },
    }));
  });
});

// ---------------------------------------------------------------------------
// Transcription
// ---------------------------------------------------------------------------

describe('useTranscribe', () => {
  it('calls api.POST with fileId in path', async () => {
    mockPOST.mockResolvedValueOnce(successResponse({ id: 'f1', transcript: 'hello' }));
    const { mutateAsync } = hooks.useTranscribe() as any;
    const result = await mutateAsync('f1');
    expect(mockPOST).toHaveBeenCalledWith('/api/v1/voice-notes/{fileId}/transcribe', expect.objectContaining({
      params: { path: { fileId: 'f1' } },
    }));
    expect(result).toEqual({ id: 'f1', transcript: 'hello' });
  });
});

describe('useSummarize', () => {
  it('calls api.POST with fileId in path', async () => {
    mockPOST.mockResolvedValueOnce(successResponse({ id: 'f1', summary: 'short' }));
    const { mutateAsync } = hooks.useSummarize() as any;
    await mutateAsync('f1');
    expect(mockPOST).toHaveBeenCalledWith('/api/v1/voice-notes/{fileId}/summarize', expect.anything());
  });
});

// ---------------------------------------------------------------------------
// Profile
// ---------------------------------------------------------------------------

describe('useProfile', () => {
  it('uses correct query key', () => {
    hooks.useProfile();
    const key = JSON.stringify(keys.profile.current());
    expect(capturedQueries[key]).toBeDefined();
  });
});

describe('useUpdateProfile', () => {
  it('calls api.PATCH with body', async () => {
    mockPATCH.mockResolvedValueOnce(successResponse({ full_name: 'Alice' }));
    const { mutateAsync } = hooks.useUpdateProfile() as any;
    await mutateAsync({ full_name: 'Alice' });
    expect(mockPATCH).toHaveBeenCalledWith('/api/v1/profile', expect.anything());
  });
});

describe('useUsage', () => {
  it('uses correct query key', () => {
    hooks.useUsage();
    const key = JSON.stringify(keys.profile.usage());
    expect(capturedQueries[key]).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// AI Settings
// ---------------------------------------------------------------------------

describe('useAiProviders', () => {
  it('uses correct query key', () => {
    hooks.useAiProviders();
    const key = JSON.stringify(keys.ai.providers());
    expect(capturedQueries[key]).toBeDefined();
  });
});

describe('useUpdateAiSettings', () => {
  it('calls api.PUT with body', async () => {
    mockPUT.mockResolvedValueOnce(successResponse({ provider: 'openai', model: 'gpt-4' }));
    const { mutateAsync } = hooks.useUpdateAiSettings() as any;
    await mutateAsync({ provider: 'openai', model: 'gpt-4' });
    expect(mockPUT).toHaveBeenCalledWith('/api/v1/ai/settings', expect.anything());
  });
});

// ---------------------------------------------------------------------------
// unwrap error handling (tested via hooks)
// ---------------------------------------------------------------------------

describe('unwrap error handling', () => {
  it('throws when API returns error', async () => {
    mockGET.mockResolvedValueOnce(errorResponse({ message: 'Not found', status: 404 }));
    hooks.useProjects();
    const key = JSON.stringify(keys.projects.list());
    await expect(capturedQueries[key].queryFn()).rejects.toEqual({ message: 'Not found', status: 404 });
  });

  it('throws when API returns empty data', async () => {
    mockGET.mockResolvedValueOnce({ data: undefined, error: undefined });
    hooks.useProjects();
    const key = JSON.stringify(keys.projects.list());
    await expect(capturedQueries[key].queryFn()).rejects.toThrow('Empty response');
  });
});
