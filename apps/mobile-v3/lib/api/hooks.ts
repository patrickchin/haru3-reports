/**
 * React Query hooks for every API resource.
 *
 * Each query hook wraps `api.GET(...)` and unwraps the response envelope.
 * Each mutation hook wraps `api.POST/PATCH/PUT/DELETE(...)` and invalidates
 * related caches on success.
 *
 * Types are loose (`any`) until we generate the OpenAPI client types
 * from `packages/api-contract`. The shapes documented here match the
 * response structs defined in `packages/api/src/routes/`.
 */
import {
  useQuery,
  useMutation,
  useQueryClient,
  type UseQueryOptions,
} from '@tanstack/react-query';
import { api } from './client';
import { keys } from './keys';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Unwrap openapi-fetch response envelope; throw on error. */
async function unwrap<T>(promise: Promise<{ data?: T; error?: any }>): Promise<T> {
  const { data, error } = await promise;
  if (error) throw error;
  if (!data) throw new Error('Empty response');
  return data;
}

// ---------------------------------------------------------------------------
// Projects
// ---------------------------------------------------------------------------

export function useProjects(params?: { status?: string; cursor?: string; limit?: number }) {
  return useQuery({
    queryKey: keys.projects.list(),
    queryFn: () =>
      unwrap(
        api.GET('/api/v1/projects', {
          params: { query: params },
        } as any),
      ).then((r: any) => r.data as any[]),
  });
}

export function useProject(
  id: string,
  options?: Partial<Pick<UseQueryOptions, 'enabled'>>,
) {
  return useQuery({
    queryKey: keys.projects.detail(id),
    queryFn: () =>
      unwrap(
        api.GET('/api/v1/projects/{id}', {
          params: { path: { id } },
        } as any),
      ).then((r: any) => r.data),
    enabled: !!id && (options?.enabled ?? true),
  });
}

export function useCreateProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { name: string; address?: string; clientName?: string }) =>
      unwrap(api.POST('/api/v1/projects', { body } as any)).then((r: any) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: keys.projects.all });
    },
  });
}

export function useUpdateProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      ...body
    }: {
      id: string;
      name?: string;
      address?: string;
      clientName?: string;
      status?: string;
    }) =>
      unwrap(
        api.PATCH('/api/v1/projects/{id}', {
          params: { path: { id } },
          body,
        } as any),
      ).then((r: any) => r.data),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: keys.projects.detail(vars.id) });
      qc.invalidateQueries({ queryKey: keys.projects.list() });
    },
  });
}

export function useDeleteProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      unwrap(
        api.DELETE('/api/v1/projects/{id}', {
          params: { path: { id } },
        } as any),
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: keys.projects.all });
    },
  });
}

// ---------------------------------------------------------------------------
// Members
// ---------------------------------------------------------------------------

export function useMembers(projectId: string) {
  return useQuery({
    queryKey: keys.members.list(projectId),
    queryFn: () =>
      unwrap(
        api.GET('/api/v1/projects/{id}/members', {
          params: { path: { id: projectId } },
        } as any),
      ).then((r: any) => r.data as any[]),
    enabled: !!projectId,
  });
}

export function useAddMember() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      projectId,
      ...body
    }: {
      projectId: string;
      phone: string;
      role: 'admin' | 'editor' | 'viewer';
    }) =>
      unwrap(
        api.POST('/api/v1/projects/{id}/members', {
          params: { path: { id: projectId } },
          body,
        } as any),
      ).then((r: any) => r.data),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: keys.members.list(vars.projectId) });
    },
  });
}

export function useUpdateMember() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      projectId,
      userId,
      role,
    }: {
      projectId: string;
      userId: string;
      role: 'admin' | 'editor' | 'viewer';
    }) =>
      unwrap(
        api.PATCH('/api/v1/projects/{id}/members/{userId}', {
          params: { path: { id: projectId, userId } },
          body: { role },
        } as any),
      ).then((r: any) => r.data),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: keys.members.list(vars.projectId) });
    },
  });
}

export function useRemoveMember() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ projectId, userId }: { projectId: string; userId: string }) =>
      unwrap(
        api.DELETE('/api/v1/projects/{id}/members/{userId}', {
          params: { path: { id: projectId, userId } },
        } as any),
      ),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: keys.members.list(vars.projectId) });
    },
  });
}

// ---------------------------------------------------------------------------
// Reports
// ---------------------------------------------------------------------------

export function useReports(
  projectId: string,
  params?: { status?: string; cursor?: string; limit?: number },
) {
  return useQuery({
    queryKey: keys.reports.list(projectId),
    queryFn: () =>
      unwrap(
        api.GET('/api/v1/projects/{projectId}/reports', {
          params: { path: { projectId }, query: params },
        } as any),
      ).then((r: any) => r.data as any[]),
    enabled: !!projectId,
  });
}

export function useReport(
  id: string,
  options?: Partial<Pick<UseQueryOptions, 'enabled'>>,
) {
  return useQuery({
    queryKey: keys.reports.detail(id),
    queryFn: () =>
      unwrap(
        api.GET('/api/v1/reports/{id}', {
          params: { path: { id } },
        } as any),
      ).then((r: any) => r.data),
    enabled: !!id && (options?.enabled ?? true),
  });
}

export function useCreateReport() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      projectId,
      ...body
    }: {
      projectId: string;
      title?: string;
      reportType?: string;
      visitDate?: string;
    }) =>
      unwrap(
        api.POST('/api/v1/projects/{projectId}/reports', {
          params: { path: { projectId } },
          body,
        } as any),
      ).then((r: any) => r.data),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: keys.reports.list(vars.projectId) });
    },
  });
}

export function useUpdateReport() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      ...body
    }: {
      id: string;
      title?: string;
      status?: string;
      reportData?: Record<string, unknown>;
    }) =>
      unwrap(
        api.PATCH('/api/v1/reports/{id}', {
          params: { path: { id } },
          body,
        } as any),
      ).then((r: any) => r.data),
    onSuccess: (data: any) => {
      qc.invalidateQueries({ queryKey: keys.reports.detail(data.id) });
      if (data.projectId) {
        qc.invalidateQueries({ queryKey: keys.reports.list(data.projectId) });
      }
    },
  });
}

export function useDeleteReport() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      unwrap(
        api.DELETE('/api/v1/reports/{id}', {
          params: { path: { id } },
        } as any),
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: keys.reports.all });
    },
  });
}

export function useGenerateReport() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      unwrap(
        api.POST('/api/v1/reports/{id}/generate', {
          params: { path: { id } },
        } as any),
      ).then((r: any) => r.data),
    onSuccess: (data: any) => {
      qc.invalidateQueries({ queryKey: keys.reports.detail(data.id) });
    },
  });
}

export function useFinalizeReport() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      unwrap(
        api.POST('/api/v1/reports/{id}/finalize', {
          params: { path: { id } },
        } as any),
      ).then((r: any) => r.data),
    onSuccess: (data: any) => {
      qc.invalidateQueries({ queryKey: keys.reports.detail(data.id) });
    },
  });
}

export function useReportPdf(id: string) {
  return useQuery({
    queryKey: [...keys.reports.detail(id), 'pdf'] as const,
    queryFn: () =>
      unwrap(
        api.GET('/api/v1/reports/{id}/pdf', {
          params: { path: { id } },
        } as any),
      ).then((r: any) => r.data as { url: string }),
    enabled: !!id,
  });
}

// ---------------------------------------------------------------------------
// Report Notes
// ---------------------------------------------------------------------------

export function useNotes(reportId: string) {
  return useQuery({
    queryKey: keys.notes.list(reportId),
    queryFn: () =>
      unwrap(
        api.GET('/api/v1/reports/{reportId}/notes', {
          params: { path: { reportId } },
        } as any),
      ).then((r: any) => r.data as any[]),
    enabled: !!reportId,
  });
}

export function useCreateNote() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      reportId,
      ...body
    }: {
      reportId: string;
      kind: string;
      body?: string;
      fileId?: string;
    }) =>
      unwrap(
        api.POST('/api/v1/reports/{reportId}/notes', {
          params: { path: { reportId } },
          body,
        } as any),
      ).then((r: any) => r.data),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: keys.notes.list(vars.reportId) });
    },
  });
}

export function useUpdateNote() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      reportId,
      id,
      ...body
    }: {
      reportId: string;
      id: string;
      body?: string;
    }) =>
      unwrap(
        api.PATCH('/api/v1/reports/{reportId}/notes/{id}', {
          params: { path: { reportId, id } },
          body,
        } as any),
      ).then((r: any) => r.data),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: keys.notes.list(vars.reportId) });
    },
  });
}

export function useDeleteNote() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ reportId, id }: { reportId: string; id: string }) =>
      unwrap(
        api.DELETE('/api/v1/reports/{reportId}/notes/{id}', {
          params: { path: { reportId, id } },
        } as any),
      ),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: keys.notes.list(vars.reportId) });
    },
  });
}

export function useReorderNotes() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      reportId,
      noteIds,
    }: {
      reportId: string;
      noteIds: string[];
    }) =>
      unwrap(
        api.POST('/api/v1/reports/{reportId}/notes/reorder', {
          params: { path: { reportId } },
          body: { noteIds },
        } as any),
      ),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: keys.notes.list(vars.reportId) });
    },
  });
}

// ---------------------------------------------------------------------------
// Files
// ---------------------------------------------------------------------------

export function useFiles(
  projectId: string,
  params?: { category?: string; cursor?: string; limit?: number },
) {
  return useQuery({
    queryKey: keys.files.list(projectId),
    queryFn: () =>
      unwrap(
        api.GET('/api/v1/projects/{projectId}/files', {
          params: { path: { projectId }, query: params },
        } as any),
      ).then((r: any) => r.data as any[]),
    enabled: !!projectId,
  });
}

export function useFile(id: string) {
  return useQuery({
    queryKey: keys.files.detail(id),
    queryFn: () =>
      unwrap(
        api.GET('/api/v1/files/{id}', {
          params: { path: { id } },
        } as any),
      ).then((r: any) => r.data),
    enabled: !!id,
  });
}

export function usePresignUpload() {
  return useMutation({
    mutationFn: (body: {
      fileName: string;
      mimeType: string;
      category: string;
    }) =>
      unwrap(api.POST('/api/v1/uploads/presign', { body } as any)).then(
        (r: any) => r.data as { signedUrl: string; storagePath: string },
      ),
  });
}

export function useCreateFile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: {
      projectId: string;
      reportId?: string;
      storagePath: string;
      category: string;
      filename: string;
      mimeType: string;
      sizeBytes: number;
      durationMs?: number;
      width?: number;
      height?: number;
    }) =>
      unwrap(api.POST('/api/v1/files', { body } as any)).then(
        (r: any) => r.data,
      ),
    onSuccess: (data: any) => {
      if (data.projectId) {
        qc.invalidateQueries({ queryKey: keys.files.list(data.projectId) });
      }
    },
  });
}

export function useDeleteFile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      unwrap(
        api.DELETE('/api/v1/files/{id}', {
          params: { path: { id } },
        } as any),
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: keys.files.all });
    },
  });
}

export function useTranscribe() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (fileId: string) =>
      unwrap(
        api.POST('/api/v1/voice-notes/{fileId}/transcribe', {
          params: { path: { fileId } },
        } as any),
      ).then((r: any) => r.data),
    onSuccess: (data: any) => {
      qc.invalidateQueries({ queryKey: keys.files.detail(data.id) });
    },
  });
}

export function useSummarize() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (fileId: string) =>
      unwrap(
        api.POST('/api/v1/voice-notes/{fileId}/summarize', {
          params: { path: { fileId } },
        } as any),
      ).then((r: any) => r.data),
    onSuccess: (data: any) => {
      qc.invalidateQueries({ queryKey: keys.files.detail(data.id) });
    },
  });
}

// ---------------------------------------------------------------------------
// Profile
// ---------------------------------------------------------------------------

export function useProfile() {
  return useQuery({
    queryKey: keys.profile.current(),
    queryFn: () =>
      unwrap(api.GET('/api/v1/profile', {})).then((r: any) => r.data),
  });
}

export function useUpdateProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: {
      full_name?: string;
      company_name?: string;
    }) =>
      unwrap(api.PATCH('/api/v1/profile', { body } as any)).then(
        (r: any) => r.data,
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: keys.profile.all });
    },
  });
}

export function useUsage() {
  return useQuery({
    queryKey: keys.profile.usage(),
    queryFn: () =>
      unwrap(api.GET('/api/v1/profile/usage', {})).then(
        (r: any) =>
          r.data as {
            totalInputTokens: number;
            totalOutputTokens: number;
            totalCachedTokens: number;
          },
      ),
  });
}

export function useUsageHistory(params?: { cursor?: string; limit?: number }) {
  return useQuery({
    queryKey: keys.profile.usageHistory(),
    queryFn: () =>
      unwrap(
        api.GET('/api/v1/profile/usage/history', {
          params: { query: params },
        } as any),
      ).then((r: any) => r.data as any[]),
  });
}

// ---------------------------------------------------------------------------
// AI Settings
// ---------------------------------------------------------------------------

export function useAiProviders() {
  return useQuery({
    queryKey: keys.ai.providers(),
    queryFn: () =>
      unwrap(api.GET('/api/v1/ai/providers', {})).then(
        (r: any) =>
          r.data as Array<{
            id: string;
            name: string;
            models: Array<{ id: string; isDefault: boolean }>;
          }>,
      ),
  });
}

export function useAiSettings() {
  return useQuery({
    queryKey: keys.ai.settings(),
    queryFn: () =>
      unwrap(api.GET('/api/v1/ai/settings', {})).then(
        (r: any) => r.data as { provider: string; model: string },
      ),
  });
}

export function useUpdateAiSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { provider: string; model: string }) =>
      unwrap(api.PUT('/api/v1/ai/settings', { body } as any)).then(
        (r: any) => r.data as { provider: string; model: string },
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: keys.ai.settings() });
    },
  });
}
