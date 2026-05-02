import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import TestRenderer, { act } from "react-test-renderer";

const useLocalProjectMock = vi.fn();
const useLocalReportMock = vi.fn();
const useLocalReportNotesMock = vi.fn();
const useLocalReportMutationsMock = vi.fn();
const useRefreshMock = vi.fn();
const useLocalSearchParamsMock = vi.fn();
const useRouterMock = vi.fn();
const useQueryClientMock = vi.fn();

const removeMutateMock = vi.fn();
const updateMutateAsyncMock = vi.fn(
  async (_args: unknown) => undefined,
);
const refetchMock = vi.fn(async () => undefined);
const onRefreshMock = vi.fn();
const routerMock = {
  back: vi.fn(),
  replace: vi.fn(),
  dismissTo: vi.fn(),
  canDismiss: vi.fn(() => false),
};
const queryClientMock = {
  removeQueries: vi.fn(),
  invalidateQueries: vi.fn(),
};

let appStateListener: ((state: string) => void) | null = null;

function makeStub(name: string) {
  return function Stub(
    props: Record<string, unknown> & { children?: React.ReactNode },
  ) {
    return React.createElement(name, props as object, props.children ?? null);
  };
}

function findFirstByTestId(
  root: TestRenderer.ReactTestInstance,
  testID: string,
): TestRenderer.ReactTestInstance | null {
  try {
    return root.findByProps({ testID });
  } catch {
    return null;
  }
}

vi.mock("react-native", () => ({
  View: makeStub("View"),
  Text: makeStub("Text"),
  ScrollView: makeStub("ScrollView"),
  ActivityIndicator: makeStub("ActivityIndicator"),
  Modal: makeStub("Modal"),
  Pressable: makeStub("Pressable"),
  RefreshControl: makeStub("RefreshControl"),
  AppState: {
    addEventListener: (_event: string, cb: (state: string) => void) => {
      appStateListener = cb;
      return { remove: () => undefined };
    },
  },
}));

vi.mock("expo-router", () => ({
  useRouter: () => useRouterMock(),
  useLocalSearchParams: () => useLocalSearchParamsMock(),
}));

vi.mock("lucide-react-native", () => ({
  Calendar: () => null,
  ChevronDown: () => null,
  ChevronRight: () => null,
  Eye: () => null,
  MessageSquare: () => null,
  Trash2: () => null,
  FileDown: () => null,
  FileText: () => null,
  FolderOpen: () => null,
  Share2: () => null,
  MoreHorizontal: () => null,
  Pencil: () => null,
  Check: () => null,
  X: () => null,
}));

vi.mock("react-native-safe-area-context", () => ({
  SafeAreaView: makeStub("SafeAreaView"),
  SafeAreaProvider: makeStub("SafeAreaProvider"),
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));

vi.mock("react-native-reanimated", () => ({
  __esModule: true,
  default: {
    View: makeStub("AnimatedView"),
  },
  FadeIn: {
    duration: () => ({ type: "fade-in" }),
  },
}));

vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => useQueryClientMock(),
}));

vi.mock("@/components/ui/AppDialogSheet", () => ({
  AppDialogSheet: makeStub("AppDialogSheet"),
}));

vi.mock("@/components/ui/Button", () => ({
  Button: makeStub("Button"),
}));

vi.mock("@/components/ui/Card", () => ({
  Card: makeStub("Card"),
}));

vi.mock("@/components/ui/InlineNotice", () => ({
  InlineNotice: makeStub("InlineNotice"),
}));

vi.mock("@/components/reports/ReportView", () => ({
  ReportView: makeStub("ReportView"),
}));

vi.mock("@/components/ui/ScreenHeader", () => ({
  ScreenHeader: makeStub("ScreenHeader"),
}));

vi.mock("@/components/files/ReportLinkedFiles", () => ({
  ReportLinkedFiles: makeStub("ReportLinkedFiles"),
}));

vi.mock("@/components/reports/PdfPreviewModal", () => ({
  PdfPreviewModal: makeStub("PdfPreviewModal"),
}));

vi.mock("@/components/files/ImagePreviewModal", () => ({
  ImagePreviewModal: makeStub("ImagePreviewModal"),
}));

vi.mock("@/components/sync/ConnectionBanner", () => ({
  ConnectionBanner: makeStub("ConnectionBanner"),
}));

vi.mock("@/components/sync/ConflictBanner", () => ({
  ConflictBanner: makeStub("ConflictBanner"),
}));

vi.mock("@/lib/report-helpers", () => ({
  toTitleCase: (value: string) => value,
}));

vi.mock("@/lib/generated-report", () => ({
  normalizeGeneratedReportPayload: (value: unknown) => value,
}));

vi.mock("@/hooks/useLocalProjects", () => ({
  useLocalProject: (...args: unknown[]) => useLocalProjectMock(...args),
}));

vi.mock("@/hooks/useLocalReports", () => ({
  useLocalReport: (...args: unknown[]) => useLocalReportMock(...args),
  useLocalReportMutations: (...args: unknown[]) =>
    useLocalReportMutationsMock(...args),
  reportKey: (reportId: string) => ["report", reportId],
  reportsKey: (projectId: string) => ["reports", projectId],
}));

vi.mock("@/hooks/useLocalReportNotes", () => ({
  useLocalReportNotes: (...args: unknown[]) => useLocalReportNotesMock(...args),
}));

vi.mock("@/hooks/useRefresh", () => ({
  useRefresh: (...args: unknown[]) => useRefreshMock(...args),
}));

vi.mock("@/hooks/useImagePreviewProps", () => ({
  useImagePreviewProps: () => ({
    uri: null,
    cacheKey: undefined,
    intrinsicWidth: undefined,
    intrinsicHeight: undefined,
    placeholderUri: null,
    blurhash: null,
    prefetchUris: [],
  }),
}));

vi.mock("@/lib/app-dialog-copy", () => ({
  getActionErrorDialogCopy: () => ({
    title: "Error",
    message: "Error",
    confirmLabel: "OK",
  }),
  getDeleteReportDialogCopy: () => ({
    title: "Delete report?",
    message: "Delete report?",
    confirmLabel: "Delete",
    cancelLabel: "Cancel",
  }),
}));

vi.mock("@/lib/export-report-pdf", () => ({
  exportReportPdf: vi.fn(),
  getSavedReportDetails: vi.fn(() => null),
  openSavedReportPdf: vi.fn(),
  saveReportPdf: vi.fn(),
  shareSavedReportPdf: vi.fn(),
}));

declare global {
  // eslint-disable-next-line no-var
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}

function makeBaseReport() {
  return {
    meta: {
      title: "Daily Report",
      reportType: "daily" as const,
      visitDate: "2026-04-30",
    },
    issues: [],
    workers: [],
    materials: [],
    nextSteps: [],
    sections: [],
  };
}

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  vi.clearAllMocks();
  appStateListener = null;

  useRouterMock.mockReturnValue(routerMock);
  useQueryClientMock.mockReturnValue(queryClientMock);
  useLocalSearchParamsMock.mockReturnValue({
    projectId: "project-1",
    reportId: "report-1",
  });
  useLocalProjectMock.mockReturnValue({
    data: { id: "project-1", name: "Project Alpha" },
  });
  useLocalReportMock.mockReturnValue({
    data: {
      id: "report-1",
      report_data: { report: makeBaseReport() },
      sync_state: "synced",
    },
    isLoading: false,
    error: null,
    refetch: refetchMock,
  });
  useLocalReportMutationsMock.mockReturnValue({
    remove: { isPending: false, mutate: removeMutateMock },
    update: { isPending: false, mutateAsync: updateMutateAsyncMock },
  });
  useLocalReportNotesMock.mockReturnValue({ data: [] });
  useRefreshMock.mockReturnValue({
    refreshing: false,
    onRefresh: onRefreshMock,
  });
});

afterEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = false;
});

describe("ReportDetailScreen manual edit mode", () => {
  it("toggles edit mode, makes ReportView editable, and disables Actions while editing", async () => {
    const { default: ReportDetailScreen } = await import(
      "@/app/projects/[projectId]/reports/[reportId]"
    );

    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(React.createElement(ReportDetailScreen));
    });

    // Initially: not editing.
    let reportView = renderer.root.findByType(
      // The mocked ReportView renders as host element "ReportView".
      "ReportView" as unknown as React.ComponentType,
    );
    expect((reportView.props as { editable?: boolean }).editable).toBe(false);
    expect(findFirstByTestId(renderer.root, "report-edit-status")).toBeNull();

    const editToggle = renderer.root.findByProps({
      testID: "btn-report-edit-toggle",
    });
    expect((editToggle.props as { disabled?: boolean }).disabled).toBe(false);
    expect(
      (editToggle.props as { accessibilityLabel?: string }).accessibilityLabel,
    ).toBe("Edit report");

    const actionsBtn = renderer.root.findByProps({
      testID: "btn-report-actions",
    });
    expect((actionsBtn.props as { disabled?: boolean }).disabled).toBe(false);

    // Enter edit mode.
    await act(async () => {
      await (editToggle.props as { onPress: () => unknown }).onPress();
    });

    reportView = renderer.root.findByType(
      "ReportView" as unknown as React.ComponentType,
    );
    expect((reportView.props as { editable?: boolean }).editable).toBe(true);

    const status = renderer.root.findByProps({ testID: "report-edit-status" });
    // No autosave activity yet, no lastSavedAt.
    expect(
      (status.props as { children?: unknown }).children,
    ).toBe("Editing");

    // Actions button is disabled while editing.
    const actionsBtn2 = renderer.root.findByProps({
      testID: "btn-report-actions",
    });
    expect((actionsBtn2.props as { disabled?: boolean }).disabled).toBe(true);

    // The edit toggle should now read "Done".
    const editToggle2 = renderer.root.findByProps({
      testID: "btn-report-edit-toggle",
    });
    expect(
      (editToggle2.props as { accessibilityLabel?: string }).accessibilityLabel,
    ).toBe("Finish editing report");
  });

  it("flushes pending edits and invalidates report queries when Done is pressed", async () => {
    const { default: ReportDetailScreen } = await import(
      "@/app/projects/[projectId]/reports/[reportId]"
    );

    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(React.createElement(ReportDetailScreen));
    });

    const editToggle = renderer.root.findByProps({
      testID: "btn-report-edit-toggle",
    });

    // Enter edit mode.
    await act(async () => {
      await (editToggle.props as { onPress: () => unknown }).onPress();
    });

    // Mutate the local report via ReportView's onReportChange to simulate an edit.
    const reportView = renderer.root.findByType(
      "ReportView" as unknown as React.ComponentType,
    );
    const onReportChange = (
      reportView.props as {
        onReportChange?: (next: ReturnType<typeof makeBaseReport>) => void;
      }
    ).onReportChange;
    expect(onReportChange).toBeTypeOf("function");

    const edited = {
      ...makeBaseReport(),
      meta: {
        ...makeBaseReport().meta,
        title: "Daily Report — edited",
      },
    };

    await act(async () => {
      onReportChange?.(edited);
    });

    // Press Done — should flush autosave and invalidate queries.
    queryClientMock.invalidateQueries.mockClear();
    const doneToggle = renderer.root.findByProps({
      testID: "btn-report-edit-toggle",
    });
    await act(async () => {
      await (doneToggle.props as { onPress: () => unknown }).onPress();
    });

    // useReportAutoSave debounces 1500ms; flush() forces the write immediately.
    expect(updateMutateAsyncMock).toHaveBeenCalledTimes(1);
    const callArgs = updateMutateAsyncMock.mock.calls[0]?.[0] as
      | {
          id: string;
          projectId: string;
          fields: { report_data: { meta: { title: string } } };
        }
      | undefined;
    expect(callArgs).toBeDefined();
    expect(callArgs!.id).toBe("report-1");
    expect(callArgs!.projectId).toBe("project-1");
    expect(callArgs!.fields.report_data.meta.title).toBe(
      "Daily Report — edited",
    );

    // Both keys are invalidated on exit.
    const invalidatedKeys = queryClientMock.invalidateQueries.mock.calls.map(
      (call) => (call[0] as { queryKey: unknown[] }).queryKey,
    );
    expect(invalidatedKeys).toEqual(
      expect.arrayContaining([
        ["report", "report-1"],
        ["reports", "project-1"],
      ]),
    );

    // Edit status pill is gone after exiting edit mode.
    expect(findFirstByTestId(renderer.root, "report-edit-status")).toBeNull();

    // ReportView is no longer editable.
    const reportViewAfter = renderer.root.findByType(
      "ReportView" as unknown as React.ComponentType,
    );
    expect((reportViewAfter.props as { editable?: boolean }).editable).toBe(
      false,
    );
  });

  it("disables the Edit toggle while autosave is in flight", async () => {
    useLocalReportMutationsMock.mockReturnValue({
      remove: { isPending: false, mutate: removeMutateMock },
      update: { isPending: true, mutateAsync: updateMutateAsyncMock },
    });

    const { default: ReportDetailScreen } = await import(
      "@/app/projects/[projectId]/reports/[reportId]"
    );

    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(React.createElement(ReportDetailScreen));
    });

    const editToggle = renderer.root.findByProps({
      testID: "btn-report-edit-toggle",
    });
    expect((editToggle.props as { disabled?: boolean }).disabled).toBe(true);
  });
});
