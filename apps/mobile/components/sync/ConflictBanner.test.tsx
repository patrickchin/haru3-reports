import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const { mockResolve, mockMutateTracker, mockMutationState } = vi.hoisted(() => ({
  mockResolve: { fn: async (..._args: unknown[]) => {} },
  mockMutateTracker: { calls: [] as string[] },
  mockMutationState: { isPending: false, isError: false, error: null as Error | null },
}));

vi.mock("@/lib/sync/SyncProvider", () => ({
  useSyncDb: () => ({
    db: {},
    isReady: true,
    isOnline: true,
    clock: () => "2026-04-27T00:00:00Z",
    newId: () => "new-id",
    onPushComplete: () => () => {},
    onPullComplete: () => () => {},
    triggerPush: () => {},
    triggerPull: async () => {},
  }),
}));

vi.mock("@/lib/sync/conflict-resolver", () => ({
  getReportConflictDiff: () =>
    Promise.resolve({
      local: { title: "Local title" },
      server: { title: "Server title" },
      diff: [
        {
          kind: "changed",
          path: "title",
          local: "Local title",
          server: "Server title",
        },
      ],
    }),
  resolveReportConflict: (...args: unknown[]) => mockResolve.fn(...args),
}));

vi.mock("@/hooks/useLocalReports", () => ({
  reportKey: (id: string) => ["report", id],
  reportsKey: (id: string) => ["reports", id],
}));

vi.mock("react-native", () => {
  const React = require("react");
  const mk = (name: string) =>
    function Stub(props: Record<string, unknown> & { children?: React.ReactNode }) {
      return React.createElement(name, props as object, props.children ?? null);
    };
  return {
    View: mk("View"),
    Text: mk("Text"),
    Pressable: mk("Pressable"),
    ScrollView: mk("ScrollView"),
  };
});

vi.mock("lucide-react-native", () => ({
  AlertTriangle: () => null,
  ChevronDown: () => null,
  ChevronUp: () => null,
}));

vi.mock("react-native-reanimated", () => {
  const React = require("react");
  return {
    __esModule: true,
    default: {
      View: function AnimatedView(
        props: Record<string, unknown> & { children?: React.ReactNode },
      ) {
        return React.createElement("AnimatedView", props as object, props.children ?? null);
      },
    },
  };
});

// Mock TanStack Query
vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({ invalidateQueries: () => {} }),
  useMutation: (opts: {
    mutationFn: (choice: string) => Promise<void>;
    onSuccess: () => void;
  }) => ({
    mutate: (choice: string) => {
      mockMutateTracker.calls.push(choice);
      opts
        .mutationFn(choice)
        .then(() => opts.onSuccess())
        .catch(() => {});
    },
    ...mockMutationState,
  }),
}));

import { create, act } from "react-test-renderer";
import { ConflictBanner } from "./ConflictBanner";

const mountedRenderers: ReturnType<typeof create>[] = [];

/**
 * Helper: create + flush async effects in one shot.
 * Uses synchronous act() for initial render, then a separate
 * await to flush fire-and-forget promises (like the diff fetch).
 */
async function renderConflictBanner(props: {
  reportId: string;
  projectId: string;
  hasConflict: boolean;
}) {
  let tree: ReturnType<typeof create>;
  act(() => {
    tree = create(<ConflictBanner {...props} />);
  });
  mountedRenderers.push(tree!);
  // Flush the Promise.resolve chain from getReportConflictDiff → setDiffData.
  await Promise.resolve();
  await Promise.resolve();
  act(() => {
    tree!.update(<ConflictBanner {...props} />);
  });
  return tree!;
}

describe("ConflictBanner", () => {
  beforeEach(() => {
    mockResolve.fn = async () => {};
    mockMutateTracker.calls = [];
    mockMutationState.isPending = false;
    mockMutationState.isError = false;
    mockMutationState.error = null;
  });

  afterEach(() => {
    act(() => {
      for (const renderer of mountedRenderers) {
        renderer.unmount();
      }
      mountedRenderers.length = 0;
    });
  });

  const baseProps = { reportId: "r1", projectId: "p1" };

  it("renders nothing when hasConflict is false", () => {
    let tree: ReturnType<typeof create>;
    act(() => {
      tree = create(
        <ConflictBanner {...baseProps} hasConflict={false} />,
      );
    });
    mountedRenderers.push(tree!);
    expect(tree!.toJSON()).toBeNull();
  });

  it("renders conflict banner when hasConflict is true", async () => {
    const tree = await renderConflictBanner({ ...baseProps, hasConflict: true });
    const json = JSON.stringify(tree.toJSON());
    expect(json).toContain("modified on the server");
    expect(json).toContain("Keep mine");
    expect(json).toContain("Use server");
  });

  it("calls resolveReportConflict with keep_mine on button press", async () => {
    const tree = await renderConflictBanner({ ...baseProps, hasConflict: true });
    const keepBtn = tree.root.findByProps({ testID: "conflict-keep-mine" });
    act(() => {
      keepBtn.props.onPress();
    });
    await Promise.resolve();
    expect(mockMutateTracker.calls).toContain("keep_mine");
  });

  it("calls resolveReportConflict with use_server on button press", async () => {
    const tree = await renderConflictBanner({ ...baseProps, hasConflict: true });
    const serverBtn = tree.root.findByProps({ testID: "conflict-use-server" });
    act(() => {
      serverBtn.props.onPress();
    });
    await Promise.resolve();
    expect(mockMutateTracker.calls).toContain("use_server");
  });

  it("shows diff toggle and expands on press", async () => {
    const tree = await renderConflictBanner({ ...baseProps, hasConflict: true });
    const toggle = tree.root.findByProps({ testID: "conflict-diff-toggle" });
    expect(JSON.stringify(tree.toJSON())).toContain("Show");

    act(() => {
      toggle.props.onPress();
    });
    const expanded = JSON.stringify(tree.toJSON());
    expect(expanded).toContain("Hide");
    expect(expanded).toContain("title");
  });
});
