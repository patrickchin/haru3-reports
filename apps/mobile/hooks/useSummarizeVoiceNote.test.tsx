import React, { forwardRef, useImperativeHandle } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import TestRenderer, { act } from "react-test-renderer";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  LONG_TRANSCRIPT_CHAR_THRESHOLD,
  SUMMARIZE_VOICE_NOTE_MUTATION_KEY,
  useIsSummarizingFile,
  useSummarizeVoiceNote,
} from "./useSummarizeVoiceNote";

const invokeMock = vi.fn();

vi.mock("@/lib/backend", () => ({
  backend: {
    functions: {
      invoke: (...args: unknown[]) => invokeMock(...args),
    },
  },
}));

type SummarizeHandle = ReturnType<typeof useSummarizeVoiceNote>;
type IsSummarizingHandle = { isSummarizing: boolean };

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const SummarizeHarness = forwardRef<SummarizeHandle, Record<string, unknown>>(
  (_props, ref) => {
    const value = useSummarizeVoiceNote();
    useImperativeHandle(ref, () => value, [value]);
    return null;
  },
);

const IsSummarizingHarness = forwardRef<IsSummarizingHandle, { fileId: string }>(
  ({ fileId }, ref) => {
    const isSummarizing = useIsSummarizingFile(fileId);
    useImperativeHandle(ref, () => ({ isSummarizing }), [isSummarizing]);
    return null;
  },
);

function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
}

async function flushPromises() {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

describe("useSummarizeVoiceNote", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("exports the documented threshold and mutation key", () => {
    expect(LONG_TRANSCRIPT_CHAR_THRESHOLD).toBe(400);
    expect(SUMMARIZE_VOICE_NOTE_MUTATION_KEY).toBe("summarize-voice-note");
  });

  it("rejects an empty transcript without calling the edge function", async () => {
    const ref = React.createRef<SummarizeHandle>();
    const queryClient = createQueryClient();
    const tree = (
      <QueryClientProvider client={queryClient}>
        <SummarizeHarness ref={ref} />
      </QueryClientProvider>
    );
    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(tree);
    });

    await act(async () => {
      await expect(
        ref.current!.mutateAsync({
          fileId: "11111111-1111-1111-1111-111111111111",
          transcript: "   \n  ",
        }),
      ).rejects.toThrow(/empty transcript/i);
    });

    expect(invokeMock).not.toHaveBeenCalled();
    act(() => {
      renderer.unmount();
    });
  });

  it("calls backend.functions.invoke with trimmed body and returns the parsed result", async () => {
    invokeMock.mockResolvedValueOnce({
      data: { title: "Site walk", summary: "All good." },
      error: null,
    });

    const ref = React.createRef<SummarizeHandle>();
    const queryClient = createQueryClient();
    const tree = (
      <QueryClientProvider client={queryClient}>
        <SummarizeHarness ref={ref} />
      </QueryClientProvider>
    );
    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(tree);
    });

    let result: { title: string; summary: string } | undefined;
    await act(async () => {
      result = await ref.current!.mutateAsync({
        fileId: "11111111-1111-1111-1111-111111111111",
        transcript: "  hello there  ",
      });
    });

    expect(invokeMock).toHaveBeenCalledTimes(1);
    expect(invokeMock.mock.calls[0]?.[0]).toBe("summarize-voice-note");
    expect(invokeMock.mock.calls[0]?.[1]).toEqual({
      body: {
        fileId: "11111111-1111-1111-1111-111111111111",
        transcript: "hello there",
      },
    });
    expect(result).toEqual({ title: "Site walk", summary: "All good." });

    act(() => {
      renderer.unmount();
    });
  });

  it("maps backend error into a thrown Error with prefix", async () => {
    invokeMock.mockResolvedValueOnce({
      data: null,
      error: new Error("boom"),
    });

    const ref = React.createRef<SummarizeHandle>();
    const queryClient = createQueryClient();
    const tree = (
      <QueryClientProvider client={queryClient}>
        <SummarizeHarness ref={ref} />
      </QueryClientProvider>
    );
    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(tree);
    });

    await act(async () => {
      await expect(
        ref.current!.mutateAsync({
          fileId: "22222222-2222-2222-2222-222222222222",
          transcript: "non-empty",
        }),
      ).rejects.toThrow(/Summarize failed: boom/);
    });

    act(() => {
      renderer.unmount();
    });
  });

  it("rejects when the response is missing title or summary", async () => {
    invokeMock.mockResolvedValueOnce({
      data: { title: "only title" },
      error: null,
    });

    const ref = React.createRef<SummarizeHandle>();
    const queryClient = createQueryClient();
    const tree = (
      <QueryClientProvider client={queryClient}>
        <SummarizeHarness ref={ref} />
      </QueryClientProvider>
    );
    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(tree);
    });

    await act(async () => {
      await expect(
        ref.current!.mutateAsync({
          fileId: "33333333-3333-3333-3333-333333333333",
          transcript: "non-empty",
        }),
      ).rejects.toThrow(/unexpected response shape/i);
    });

    act(() => {
      renderer.unmount();
    });
  });

  it("invalidates project-files query scoped to projectId on success", async () => {
    invokeMock.mockResolvedValueOnce({
      data: { title: "T", summary: "S" },
      error: null,
    });

    const ref = React.createRef<SummarizeHandle>();
    const queryClient = createQueryClient();
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

    const tree = (
      <QueryClientProvider client={queryClient}>
        <SummarizeHarness ref={ref} />
      </QueryClientProvider>
    );
    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(tree);
    });

    await act(async () => {
      await ref.current!.mutateAsync({
        fileId: "44444444-4444-4444-4444-444444444444",
        transcript: "non-empty",
        projectId: "project-xyz",
      });
    });

    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ["project-files", "project-xyz"],
    });

    act(() => {
      renderer.unmount();
    });
  });

  it("invalidates the broad project-files query when projectId is missing", async () => {
    invokeMock.mockResolvedValueOnce({
      data: { title: "T", summary: "S" },
      error: null,
    });

    const ref = React.createRef<SummarizeHandle>();
    const queryClient = createQueryClient();
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

    const tree = (
      <QueryClientProvider client={queryClient}>
        <SummarizeHarness ref={ref} />
      </QueryClientProvider>
    );
    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(tree);
    });

    await act(async () => {
      await ref.current!.mutateAsync({
        fileId: "55555555-5555-5555-5555-555555555555",
        transcript: "non-empty",
      });
    });

    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ["project-files"],
    });

    act(() => {
      renderer.unmount();
    });
  });
});

describe("useIsSummarizingFile", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns false when no mutation is in flight", () => {
    const ref = React.createRef<IsSummarizingHandle>();
    const queryClient = createQueryClient();
    const tree = (
      <QueryClientProvider client={queryClient}>
        <IsSummarizingHarness ref={ref} fileId="file-1" />
      </QueryClientProvider>
    );
    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(tree);
    });

    expect(ref.current?.isSummarizing).toBe(false);

    act(() => {
      renderer.unmount();
    });
  });

  it("the dedup predicate filters in-flight mutations by fileId", async () => {
    // This test asserts the *semantic* dedup contract: while a mutation for
    // fileId=A is in flight, the queryClient's isMutating predicate returns
    // >0 for A and 0 for B. We query the predicate directly because
    // `useQueryClient().isMutating()` is non-subscribing — it returns a
    // snapshot at render time, which matches how `VoiceNoteCard`
    // re-evaluates it on every render that the parent triggers.
    const deferred = createDeferred<{
      data: { title: string; summary: string };
      error: null;
    }>();
    invokeMock.mockImplementationOnce(() => deferred.promise);

    const summarizeRef = React.createRef<SummarizeHandle>();
    const queryClient = createQueryClient();
    const tree = (
      <QueryClientProvider client={queryClient}>
        <SummarizeHarness ref={summarizeRef} />
      </QueryClientProvider>
    );
    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(tree);
    });

    function predicateMatches(fileId: string): number {
      return queryClient.isMutating({
        mutationKey: [SUMMARIZE_VOICE_NOTE_MUTATION_KEY],
        predicate: (mutation) => {
          const vars = mutation.state.variables as
            | { fileId: string }
            | undefined;
          return vars?.fileId === fileId;
        },
      });
    }

    expect(predicateMatches("file-A")).toBe(0);
    expect(predicateMatches("file-B")).toBe(0);

    // Fire the mutation for file-A but don't resolve yet.
    act(() => {
      void summarizeRef.current!.mutateAsync({
        fileId: "file-A",
        transcript: "non-empty",
      });
    });
    await flushPromises();

    expect(predicateMatches("file-A")).toBe(1);
    // Sibling card watching a different file_id must NOT see the call.
    expect(predicateMatches("file-B")).toBe(0);

    // Resolve and confirm both flip back to 0.
    deferred.resolve({
      data: { title: "T", summary: "S" },
      error: null,
    });
    await flushPromises();
    await flushPromises();

    expect(predicateMatches("file-A")).toBe(0);
    expect(predicateMatches("file-B")).toBe(0);

    act(() => {
      renderer.unmount();
    });
  });
});
