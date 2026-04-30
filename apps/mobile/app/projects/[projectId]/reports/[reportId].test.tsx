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

function makeStub(name: string) {
  return function Stub(
    props: Record<string, unknown> & { children?: React.ReactNode },
  ) {
    return React.createElement(name, props as object, props.children ?? null);
  };
}

function collectText(
  node: TestRenderer.ReactTestRendererNode | TestRenderer.ReactTestRendererNode[] | null,
): string[] {
  if (node == null) return [];
  if (typeof node === "string") return [node];
  if (Array.isArray(node)) {
    return node.flatMap((child) => collectText(child));
  }
  const children = Array.isArray(node.children) ? node.children : [];
  return children.flatMap((child) => collectText(child));
}

vi.mock("react-native", () => ({
  View: makeStub("View"),
  Text: makeStub("Text"),
  ScrollView: makeStub("ScrollView"),
  ActivityIndicator: makeStub("ActivityIndicator"),
  Modal: makeStub("Modal"),
  Pressable: makeStub("Pressable"),
  RefreshControl: makeStub("RefreshControl"),
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
  X: () => null,
}));

vi.mock("react-native-safe-area-context", () => ({
  SafeAreaView: makeStub("SafeAreaView"),
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

vi.mock("@/components/voice-notes/VoiceNoteList", () => ({
  VoiceNoteList: makeStub("VoiceNoteList"),
}));

vi.mock("@/components/files/FileList", () => ({
  FileList: makeStub("FileList"),
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
  useLocalReportMutations: (...args: unknown[]) => useLocalReportMutationsMock(...args),
  reportKey: (reportId: string) => ["report", reportId],
  reportsKey: (projectId: string) => ["reports", projectId],
}));

vi.mock("@/hooks/useLocalReportNotes", () => ({
  useLocalReportNotes: (...args: unknown[]) => useLocalReportNotesMock(...args),
}));

vi.mock("@/hooks/useRefresh", () => ({
  useRefresh: (...args: unknown[]) => useRefreshMock(...args),
}));

vi.mock("@/lib/app-dialog-copy", () => ({
  getActionErrorDialogCopy: () => ({ title: "Error", message: "Error", confirmLabel: "OK" }),
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
      report_data: {
        report: {
          meta: {
            title: "Daily Report",
            reportType: "daily",
            visitDate: "2026-04-30",
          },
          issues: [],
          workers: [],
          materials: [],
          nextSteps: [],
          sections: [],
        },
      },
      sync_state: "synced",
    },
    isLoading: false,
    error: null,
    refetch: refetchMock,
  });
  useLocalReportMutationsMock.mockReturnValue({
    remove: {
      isPending: false,
      mutate: removeMutateMock,
    },
  });
  useLocalReportNotesMock.mockReturnValue({
    data: [
      {
        id: "note-1",
        position: 1,
        kind: "text",
        body: "Crew completed the foundation pour in Zone A.",
      },
      {
        id: "note-2",
        position: 2,
        kind: "image",
        body: null,
      },
      {
        id: "note-3",
        position: 3,
        kind: "voice",
        body: "Inspector requested additional curing checks tomorrow morning.",
      },
      {
        id: "note-4",
        position: 4,
        kind: "text",
        body: "   ",
      },
    ],
  });
  useRefreshMock.mockReturnValue({
    refreshing: false,
    onRefresh: onRefreshMock,
  });
});

afterEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = false;
});

describe("ReportDetailScreen source notes", () => {
  it("keeps full source note bodies inside the collapsible section fed by report notes", async () => {
    const { default: ReportDetailScreen } = await import("./[reportId]");

    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(React.createElement(ReportDetailScreen));
    });

    const collapsedText = collectText(renderer.toJSON()).join(" ");
    expect(collapsedText).toContain("Source Notes");
    expect(collapsedText).toMatch(/\(\s*2\s*\)/);
    expect(collapsedText).not.toContain("Crew completed the foundation pour in Zone A.");
    expect(collapsedText).not.toContain(
      "Inspector requested additional curing checks tomorrow morning.",
    );

    const toggle = renderer.root.findByProps({
      accessibilityLabel: "Show source notes",
    });

    act(() => {
      (toggle.props as { onPress: () => void }).onPress();
    });

    const expandedText = collectText(renderer.toJSON()).join(" ");
    expect(expandedText).toContain("The original notes this report was generated from.");
    expect(expandedText).toContain("Crew completed the foundation pour in Zone A.");
    expect(expandedText).toContain(
      "Inspector requested additional curing checks tomorrow morning.",
    );
    expect(expandedText).not.toContain('"   "');
  });
});
