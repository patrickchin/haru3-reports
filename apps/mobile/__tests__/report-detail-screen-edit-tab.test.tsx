import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import TestRenderer, { act } from "react-test-renderer";

const useLocalProjectMock = vi.fn();
const useLocalReportMock = vi.fn();
const useLocalReportNotesMock = vi.fn();
const useLocalReportMutationsMock = vi.fn();
const useReportAutoSaveMock = vi.fn();
const useRefreshMock = vi.fn();
const useLocalSearchParamsMock = vi.fn();
const useRouterMock = vi.fn();
const useQueryClientMock = vi.fn();

const ReportEditFormMock = vi.fn();
const ReportViewMock = vi.fn();

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

function makeStub(name: string) {
  return function Stub(
    props: Record<string, unknown> & { children?: React.ReactNode },
  ) {
    return React.createElement(name, props as object, props.children ?? null);
  };
}

function findByTestID(
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
  AppState: { addEventListener: vi.fn(() => ({ remove: vi.fn() })) },
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
  FileText: () => null,
  FileDown: () => null,
  FolderOpen: () => null,
  MessageSquare: () => null,
  MoreHorizontal: () => null,
  Pencil: () => null,
  Share2: () => null,
  Trash2: () => null,
  X: () => null,
}));

vi.mock("@/components/ui/SafeAreaView", () => ({
  SafeAreaView: makeStub("SafeAreaView"),
}));

vi.mock("react-native-reanimated", () => ({
  __esModule: true,
  default: { View: makeStub("AnimatedView") },
  FadeIn: { duration: () => ({ type: "fade-in" }) },
}));

vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => useQueryClientMock(),
}));

vi.mock("@/components/ui/AppDialogSheet", () => ({
  AppDialogSheet: makeStub("AppDialogSheet"),
}));
vi.mock("@/components/ui/Button", () => ({ Button: makeStub("Button") }));
vi.mock("@/components/ui/Card", () => ({ Card: makeStub("Card") }));
vi.mock("@/components/ui/InlineNotice", () => ({
  InlineNotice: makeStub("InlineNotice"),
}));
vi.mock("@/components/skeletons/ReportDetailSkeleton", () => ({
  ReportDetailSkeleton: makeStub("ReportDetailSkeleton"),
}));
vi.mock("@/components/reports/ReportView", () => ({
  ReportView: (props: { report: { report: { meta: { title: string } } } }) => {
    ReportViewMock(props);
    return React.createElement(
      "ReportView",
      { "data-title": props.report.report.meta.title },
      null,
    );
  },
}));
vi.mock("@/components/reports/ReportEditForm", () => ({
  ReportEditForm: (props: {
    report: { report: { meta: { title: string } } };
    onChange: (next: unknown) => void;
  }) => {
    ReportEditFormMock(props);
    return React.createElement(
      "ReportEditForm",
      { "data-title": props.report.report.meta.title },
      null,
    );
  },
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
vi.mock("@/components/sync/ConflictBanner", () => ({
  ConflictBanner: makeStub("ConflictBanner"),
}));

vi.mock("@/lib/report-helpers", () => ({
  toTitleCase: (value: string) => value,
}));
vi.mock("@/lib/generated-report", () => ({
  normalizeGeneratedReportPayload: (value: unknown) => value,
}));
vi.mock("@/lib/design-tokens/colors", () => ({
  colors: {
    foreground: "#000",
    primary: { foreground: "#fff" },
    muted: { foreground: "#888" },
    danger: { text: "#f00" },
  },
}));

vi.mock("@/hooks/useLocalProjects", () => ({
  useLocalProject: (...args: unknown[]) => useLocalProjectMock(...args),
}));
vi.mock("@/hooks/useLocalReports", () => ({
  useLocalReport: (...args: unknown[]) => useLocalReportMock(...args),
  useLocalReportMutations: (...args: unknown[]) =>
    useLocalReportMutationsMock(...args),
  reportKey: (id: string) => ["report", id],
  reportsKey: (id: string) => ["reports", id],
}));
vi.mock("@/hooks/useLocalReportNotes", () => ({
  useLocalReportNotes: (...args: unknown[]) => useLocalReportNotesMock(...args),
}));
vi.mock("@/hooks/useReportAutoSave", () => ({
  useReportAutoSave: (...args: unknown[]) => useReportAutoSaveMock(...args),
}));
vi.mock("@/hooks/useRefresh", () => ({
  useRefresh: (...args: unknown[]) => useRefreshMock(...args),
}));
vi.mock("@/hooks/useImagePreviewProps", () => ({
  useImagePreviewProps: () => ({}),
}));

vi.mock("@/lib/app-dialog-copy", () => ({
  getActionErrorDialogCopy: () => ({ title: "", message: "", confirmLabel: "" }),
  getDeleteReportDialogCopy: () => ({
    title: "",
    message: "",
    confirmLabel: "",
    cancelLabel: "",
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

const FIXTURE_REPORT = {
  report: {
    meta: {
      title: "Daily Report",
      reportType: "daily",
      summary: "Foundation work on track.",
      visitDate: "2026-05-01",
    },
    weather: null,
    workers: { totalWorkers: 5, workerHours: null, notes: null, roles: [] },
    materials: [],
    issues: [],
    nextSteps: [],
    sections: [],
  },
};

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  vi.clearAllMocks();

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
      report_data: FIXTURE_REPORT,
      sync_state: "synced",
    },
    isLoading: false,
    error: null,
    refetch: vi.fn(async () => undefined),
  });
  useLocalReportNotesMock.mockReturnValue({ data: [] });
  useLocalReportMutationsMock.mockReturnValue({
    remove: { isPending: false, mutate: vi.fn() },
  });
  useReportAutoSaveMock.mockReturnValue({
    flush: vi.fn(),
    markSaved: vi.fn(),
    isSaving: false,
    lastSavedAt: null,
  });
  useRefreshMock.mockReturnValue({
    refreshing: false,
    onRefresh: vi.fn(),
  });
});

afterEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = false;
});

describe("ReportDetailScreen — Edit tab", () => {
  it("defaults to the Report tab and propagates form edits back to it", async () => {
    const { default: ReportDetailScreen } = await import(
      "@/app/projects/[projectId]/reports/[reportId]"
    );

    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(React.createElement(ReportDetailScreen));
    });

    // Default tab is Report — ReportView gets the fixture.
    expect(ReportViewMock).toHaveBeenCalled();
    expect(
      ReportViewMock.mock.calls.at(-1)?.[0].report.report.meta.title,
    ).toBe("Daily Report");
    // ReportEditForm is not yet rendered.
    expect(ReportEditFormMock).not.toHaveBeenCalled();

    // Tap Edit tab.
    const editTab = findByTestID(renderer.root, "btn-tab-edit");
    expect(editTab).not.toBeNull();
    act(() => {
      (editTab!.props as { onPress: () => void }).onPress();
    });

    // Edit form is now rendered with the same report.
    expect(ReportEditFormMock).toHaveBeenCalled();
    const lastFormCall = ReportEditFormMock.mock.calls.at(-1)?.[0];
    expect(lastFormCall.report.report.meta.title).toBe("Daily Report");

    // Simulate the form mutating the title via onChange.
    const next = {
      report: {
        ...FIXTURE_REPORT.report,
        meta: { ...FIXTURE_REPORT.report.meta, title: "Updated Title" },
      },
    };
    act(() => {
      lastFormCall.onChange(next);
    });

    // Form re-renders with the new title.
    const formAfter = ReportEditFormMock.mock.calls.at(-1)?.[0];
    expect(formAfter.report.report.meta.title).toBe("Updated Title");

    // Switch back to Report tab — the local edit is visible there too.
    const reportTab = findByTestID(renderer.root, "btn-tab-report");
    act(() => {
      (reportTab!.props as { onPress: () => void }).onPress();
    });
    const lastReportView = ReportViewMock.mock.calls.at(-1)?.[0];
    expect(lastReportView.report.report.meta.title).toBe("Updated Title");
  });
});
