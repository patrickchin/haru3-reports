/**
 * Tests for voice-notes pipeline optimistic merge.
 *
 * MANDATORY per 2026-05-08 bug fix (R11) — ensures summary is
 * immediately visible in cache after summarization completes.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { QueryClient } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react-native";
import { useVoicePipeline } from "../use-voice-pipeline";
import * as transcribeModule from "../transcribe";
import * as summarizeModule from "../summarize";
import * as supabaseModule from "@/infra/supabase";
import * as uploadQueueModule from "@/features/uploads/queue";
import type { FileMetadata } from "@/infra/db-types";

vi.mock("@/infra/supabase");
vi.mock("@/features/uploads/queue");
vi.mock("../transcribe");
vi.mock("../summarize");

describe("useVoicePipeline optimistic merge", () => {
  let queryClient: QueryClient;
  let mockUploadQueue: any;
  let mockSupabase: any;

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });

    mockUploadQueue = {
      enqueueUpload: vi.fn(() => "job-123"),
      subscribe: vi.fn((callback) => {
        // Simulate immediate completion
        setTimeout(() => {
          mockUploadQueue.getJob = vi.fn(() => ({ state: "completed" }));
          callback();
        }, 0);
        return vi.fn(); // unsubscribe
      }),
      getJob: vi.fn(() => ({ state: "pending" })),
    };

    mockSupabase = {
      from: vi.fn(() => ({
        update: vi.fn(() => ({ eq: vi.fn(() => ({ error: null })) })),
      })),
    };

    vi.mocked(uploadQueueModule.getUploadQueue).mockReturnValue(mockUploadQueue);
    vi.mocked(supabaseModule.supabase).mockReturnValue(mockSupabase as any);
  });

  it("merges summary into cached file_metadata after summarization", async () => {
    const fileId = "file-abc";
    const longTranscript = "a".repeat(500); // > 400 chars threshold
    const mockSummary = { title: "Test Title", summary: "Test Summary" };

    // Mock transcribe and summarize
    vi.mocked(transcribeModule.transcribeAudio).mockResolvedValue({
      transcript: longTranscript,
      durationSeconds: 42,
    });
    vi.mocked(summarizeModule.summarizeVoiceNote).mockResolvedValue(mockSummary);

    // Pre-populate cache with a file_metadata row
    const cachedFile: FileMetadata = {
      id: fileId,
      project_id: "proj-1",
      uploader_id: "user-1",
      file_name: "voice-note.m4a",
      file_size: 1024,
      mime_type: "audio/m4a",
      storage_path: "/path/to/file",
      thumbnail_url: null,
      voice_title: null,
      voice_summary: null,
      voice_duration_ms: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      deleted_at: null,
    };

    queryClient.setQueryData(["project-files", "proj-1"], [cachedFile]);

    // Mock crypto.randomUUID to return our known fileId
    const cryptoMock = { randomUUID: vi.fn(() => fileId) };
    vi.stubGlobal("Crypto", cryptoMock);

    const wrapper = ({ children }: any) => children;
    const { result } = renderHook(() => useVoicePipeline(), { wrapper });

    // Execute pipeline
    await waitFor(() => {
      result.current.mutate({
        audioUri: "file://test.m4a",
        durationMs: 42000,
        projectId: "proj-1",
        uploaderId: "user-1",
      });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    // Assert: cached file_metadata now has the summary
    const updatedCache = queryClient.getQueryData<FileMetadata[]>([
      "project-files",
      "proj-1",
    ]);

    expect(updatedCache).toBeDefined();
    expect(updatedCache?.[0].voice_title).toBe(mockSummary.title);
    expect(updatedCache?.[0].voice_summary).toBe(mockSummary.summary);
  });

  it("does NOT merge if transcript is short (< 400 chars)", async () => {
    const fileId = "file-short";
    const shortTranscript = "Short note."; // < 400 chars

    vi.mocked(transcribeModule.transcribeAudio).mockResolvedValue({
      transcript: shortTranscript,
      durationSeconds: 5,
    });

    const cachedFile: FileMetadata = {
      id: fileId,
      project_id: "proj-1",
      uploader_id: "user-1",
      file_name: "short.m4a",
      file_size: 512,
      mime_type: "audio/m4a",
      storage_path: "/path/short",
      thumbnail_url: null,
      voice_title: null,
      voice_summary: null,
      voice_duration_ms: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      deleted_at: null,
    };

    queryClient.setQueryData(["project-files", "proj-1"], [cachedFile]);

    const cryptoMock = { randomUUID: vi.fn(() => fileId) };
    vi.stubGlobal("Crypto", cryptoMock);

    const wrapper = ({ children }: any) => children;
    const { result } = renderHook(() => useVoicePipeline(), { wrapper });

    await waitFor(() => {
      result.current.mutate({
        audioUri: "file://short.m4a",
        durationMs: 5000,
        projectId: "proj-1",
        uploaderId: "user-1",
      });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    // Summarize should NOT have been called
    expect(vi.mocked(summarizeModule.summarizeVoiceNote)).not.toHaveBeenCalled();

    // Cache should NOT have title/summary
    const updatedCache = queryClient.getQueryData<FileMetadata[]>([
      "project-files",
      "proj-1",
    ]);
    expect(updatedCache?.[0].voice_title).toBeNull();
    expect(updatedCache?.[0].voice_summary).toBeNull();
  });

  it("merges across multiple cached queries", async () => {
    const fileId = "file-multi";
    const longTranscript = "a".repeat(500);
    const mockSummary = { title: "Multi Title", summary: "Multi Summary" };

    vi.mocked(transcribeModule.transcribeAudio).mockResolvedValue({
      transcript: longTranscript,
      durationSeconds: 42,
    });
    vi.mocked(summarizeModule.summarizeVoiceNote).mockResolvedValue(mockSummary);

    const file1: FileMetadata = {
      id: fileId,
      project_id: "proj-1",
      uploader_id: "user-1",
      file_name: "multi.m4a",
      file_size: 2048,
      mime_type: "audio/m4a",
      storage_path: "/multi",
      thumbnail_url: null,
      voice_title: null,
      voice_summary: null,
      voice_duration_ms: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      deleted_at: null,
    };

    // Same file in two different query keys
    queryClient.setQueryData(["project-files", "proj-1"], [file1]);
    queryClient.setQueryData(["report-files", "report-1"], [{ ...file1 }]);

    const cryptoMock = { randomUUID: vi.fn(() => fileId) };
    vi.stubGlobal("Crypto", cryptoMock);

    const wrapper = ({ children }: any) => children;
    const { result } = renderHook(() => useVoicePipeline(), { wrapper });

    await waitFor(() => {
      result.current.mutate({
        audioUri: "file://multi.m4a",
        durationMs: 42000,
        projectId: "proj-1",
        uploaderId: "user-1",
      });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    // Both caches should have the summary
    const cache1 = queryClient.getQueryData<FileMetadata[]>(["project-files", "proj-1"]);
    const cache2 = queryClient.getQueryData<FileMetadata[]>(["report-files", "report-1"]);

    expect(cache1?.[0].voice_title).toBe(mockSummary.title);
    expect(cache2?.[0].voice_title).toBe(mockSummary.title);
  });
});
