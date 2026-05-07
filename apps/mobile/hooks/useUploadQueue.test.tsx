import React from "react";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
} from "vitest";
import TestRenderer, { act } from "react-test-renderer";

import {
  deriveSnapshot,
  useUploadQueue,
  type UploadQueueSnapshot,
} from "./useUploadQueue";
import type { UploadJob, UploadJobState, UploadQueue } from "@/lib/uploads";

declare global {
  // eslint-disable-next-line no-var
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
});

const mountedRenderers: TestRenderer.ReactTestRenderer[] = [];
afterEach(() => {
  act(() => {
    for (const r of mountedRenderers) r.unmount();
    mountedRenderers.length = 0;
  });
  globalThis.IS_REACT_ACT_ENVIRONMENT = false;
});

function makeJob(
  id: string,
  state: UploadJobState,
  progress = 0,
): UploadJob {
  return {
    id,
    state,
    attempts: 0,
    progress,
    createdAt: 0,
    updatedAt: 0,
    input: {
      kind: "project-image",
      sourceUri: "file://x",
      filename: `${id}.jpg`,
      mimeType: "image/jpeg",
      sizeBytes: 100,
      uploadedBy: "user-1",
      category: "image",
      isImage: true,
    },
  };
}

describe("deriveSnapshot", () => {
  it("returns zeroes for an empty queue", () => {
    const snap = deriveSnapshot([]);
    expect(snap).toEqual({
      jobs: [],
      activeCount: 0,
      failedCount: 0,
      hasActive: false,
      aggregateProgress: 0,
    });
  });

  it("counts pending / preprocessing / uploading as active", () => {
    const snap = deriveSnapshot([
      makeJob("a", "pending"),
      makeJob("b", "preprocessing"),
      makeJob("c", "uploading", 0.5),
    ]);
    expect(snap.activeCount).toBe(3);
    expect(snap.hasActive).toBe(true);
    expect(snap.failedCount).toBe(0);
  });

  it("counts failed jobs separately and excludes them from active", () => {
    const snap = deriveSnapshot([
      makeJob("a", "uploading", 0.4),
      makeJob("b", "failed"),
      makeJob("c", "failed"),
    ]);
    expect(snap.activeCount).toBe(1);
    expect(snap.failedCount).toBe(2);
    expect(snap.hasActive).toBe(true);
  });

  it("ignores terminal uploaded / cancelled jobs", () => {
    const snap = deriveSnapshot([
      makeJob("a", "uploaded", 1),
      makeJob("b", "cancelled"),
    ]);
    expect(snap.activeCount).toBe(0);
    expect(snap.failedCount).toBe(0);
    expect(snap.hasActive).toBe(false);
    expect(snap.aggregateProgress).toBe(0);
  });

  it("averages progress across active jobs only", () => {
    const snap = deriveSnapshot([
      makeJob("a", "uploading", 0.2),
      makeJob("b", "uploading", 0.8),
      makeJob("c", "uploaded", 1), // excluded
      makeJob("d", "failed"), // excluded
    ]);
    expect(snap.activeCount).toBe(2);
    expect(snap.aggregateProgress).toBeCloseTo(0.5, 5);
  });

  it("treats a pending job's missing progress as 0", () => {
    const snap = deriveSnapshot([
      makeJob("a", "pending"),
      makeJob("b", "uploading", 1),
    ]);
    expect(snap.aggregateProgress).toBeCloseTo(0.5, 5);
  });
});

// ---------------------------------------------------------------
// Hook integration via injected fake queue
// ---------------------------------------------------------------

function createFakeQueue(initial: UploadJob[]): {
  queue: UploadQueue;
  setJobs: (next: UploadJob[]) => void;
} {
  let jobs = initial;
  const listeners = new Set<() => void>();
  const queue = {
    enqueueUpload: () => {
      throw new Error("not used");
    },
    cancelUpload: () => {},
    retryUpload: () => {},
    subscribe: (l: () => void) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    getJobs: () => jobs.slice(), // fresh array each call (mirrors real queue)
    getJob: (id: string) => jobs.find((j) => j.id === id),
    hydrate: async () => {},
    whenIdle: async () => {},
  } as unknown as UploadQueue;
  return {
    queue,
    setJobs: (next) => {
      jobs = next;
      for (const l of listeners) l();
    },
  };
}

function Probe({
  queue,
  capture,
}: {
  queue: UploadQueue;
  capture: (s: UploadQueueSnapshot) => void;
}) {
  const snap = useUploadQueue({ queue });
  capture(snap);
  return null;
}

describe("useUploadQueue", () => {
  it("renders an initial snapshot derived from the queue", () => {
    const { queue } = createFakeQueue([
      makeJob("a", "uploading", 0.3),
      makeJob("b", "failed"),
    ]);
    const captured: UploadQueueSnapshot[] = [];
    let tree: TestRenderer.ReactTestRenderer | null = null;
    act(() => {
      tree = TestRenderer.create(
        <Probe queue={queue} capture={(s) => captured.push(s)} />,
      );
    });
    mountedRenderers.push(tree as unknown as TestRenderer.ReactTestRenderer);

    const last = captured[captured.length - 1];
    expect(last.activeCount).toBe(1);
    expect(last.failedCount).toBe(1);
    expect(last.hasActive).toBe(true);
    expect(last.aggregateProgress).toBeCloseTo(0.3, 5);
  });

  it("re-renders when the queue notifies subscribers", () => {
    const { queue, setJobs } = createFakeQueue([makeJob("a", "pending")]);
    const captured: UploadQueueSnapshot[] = [];
    let tree: TestRenderer.ReactTestRenderer | null = null;
    act(() => {
      tree = TestRenderer.create(
        <Probe queue={queue} capture={(s) => captured.push(s)} />,
      );
    });
    mountedRenderers.push(tree as unknown as TestRenderer.ReactTestRenderer);

    expect(captured[captured.length - 1].activeCount).toBe(1);

    act(() => {
      setJobs([makeJob("a", "uploaded", 1)]);
    });

    expect(captured[captured.length - 1].activeCount).toBe(0);
    expect(captured[captured.length - 1].hasActive).toBe(false);
  });
});
