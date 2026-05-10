import React from "react";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import TestRenderer, { act } from "react-test-renderer";

vi.mock("lucide-react-native", () => ({
  ArrowUp: () => null,
  AlertCircle: () => null,
}));

vi.mock("react-native", () => {
  const mk = (name: string) =>
    function Stub(props: { children?: React.ReactNode; [key: string]: unknown }) {
      return React.createElement(name, props, props.children ?? null);
    };
  return {
    View: mk("View"),
    Text: mk("Text"),
  };
});

import { UploadTrayBadge } from "./UploadTrayBadge";
import type { UploadJob, UploadJobState, UploadQueue } from "@/lib/uploads";

declare global {
  // eslint-disable-next-line no-var
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
});

const mounted: TestRenderer.ReactTestRenderer[] = [];
afterEach(() => {
  act(() => {
    for (const r of mounted) r.unmount();
    mounted.length = 0;
  });
  globalThis.IS_REACT_ACT_ENVIRONMENT = false;
});

function makeJob(id: string, state: UploadJobState): UploadJob {
  return {
    id,
    state,
    attempts: 0,
    progress: state === "uploading" ? 0.5 : 0,
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

function fakeQueue(jobs: UploadJob[]): UploadQueue {
  return {
    enqueueUpload: () => {
      throw new Error("not used");
    },
    cancelUpload: () => {},
    retryUpload: () => {},
    subscribe: () => () => {},
    getJobs: () => jobs.slice(),
    getJob: (id: string) => jobs.find((j) => j.id === id),
    hydrate: async () => {},
    whenIdle: async () => {},
  } as unknown as UploadQueue;
}

function findByA11yLabel(
  root: TestRenderer.ReactTestInstance,
  label: string,
): TestRenderer.ReactTestInstance | null {
  try {
    return root.findByProps({ accessibilityLabel: label });
  } catch {
    return null;
  }
}

describe("UploadTrayBadge", () => {
  it("renders nothing when no jobs are active or failed", () => {
    let tree: TestRenderer.ReactTestRenderer | null = null;
    act(() => {
      tree = TestRenderer.create(
        <UploadTrayBadge queue={fakeQueue([makeJob("a", "uploaded")])} />,
      );
    });
    const r = tree as unknown as TestRenderer.ReactTestRenderer;
    mounted.push(r);
    expect(r.toJSON()).toBeNull();
  });

  it("renders an active-count pill with an arrow icon", () => {
    let tree: TestRenderer.ReactTestRenderer | null = null;
    act(() => {
      tree = TestRenderer.create(
        <UploadTrayBadge
          queue={fakeQueue([
            makeJob("a", "uploading"),
            makeJob("b", "pending"),
          ])}
        />,
      );
    });
    const r = tree as unknown as TestRenderer.ReactTestRenderer;
    mounted.push(r);

    const pill = findByA11yLabel(r.root, "2 uploads in progress");
    expect(pill).not.toBeNull();
  });

  it("uses singular grammar for one active job", () => {
    let tree: TestRenderer.ReactTestRenderer | null = null;
    act(() => {
      tree = TestRenderer.create(
        <UploadTrayBadge queue={fakeQueue([makeJob("a", "uploading")])} />,
      );
    });
    const r = tree as unknown as TestRenderer.ReactTestRenderer;
    mounted.push(r);

    expect(findByA11yLabel(r.root, "1 upload in progress")).not.toBeNull();
  });

  it("renders a failed-count pill that takes precedence over active jobs", () => {
    let tree: TestRenderer.ReactTestRenderer | null = null;
    act(() => {
      tree = TestRenderer.create(
        <UploadTrayBadge
          queue={fakeQueue([
            makeJob("a", "uploading"),
            makeJob("b", "failed"),
            makeJob("c", "failed"),
          ])}
        />,
      );
    });
    const r = tree as unknown as TestRenderer.ReactTestRenderer;
    mounted.push(r);

    expect(findByA11yLabel(r.root, "2 uploads failed")).not.toBeNull();
    expect(findByA11yLabel(r.root, "1 upload in progress")).toBeNull();
  });
});
