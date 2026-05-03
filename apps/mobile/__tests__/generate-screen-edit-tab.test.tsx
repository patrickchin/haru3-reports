import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import TestRenderer, { act } from "react-test-renderer";

const useLocalSearchParamsMock = vi.fn();
const useRouterMock = vi.fn();
const useQueryClientMock = vi.fn();
const useReportGenerationMock = vi.fn();
const useReportAutoSaveMock = vi.fn();
const useLocalReportMock = vi.fn();
const useLocalReportNotesMock = vi.fn();
const useLocalReportMutationsMock = vi.fn();
const useReportNotesMutationsMock = vi.fn();
const useOtherReportFileIdsMock = vi.fn();
const useNoteTimelineMock = vi.fn();
const useSpeechToTextMock = vi.fn();
const useFileUploadMock = vi.fn();
const useAuthMock = vi.fn();
const useQueryMock = vi.fn();
const useMutationMock = vi.fn();
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
  setQueryData: vi.fn(),
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
  TextInput: makeStub("TextInput"),
  Pressable: makeStub("Pressable"),
  ScrollView: makeStub("ScrollView"),
  KeyboardAvoidingView: makeStub("KeyboardAvoidingView"),
  Keyboard: { dismiss: vi.fn() },
  Platform: { OS: "ios" },
  ActivityIndicator: makeStub("ActivityIndicator"),
  AppState: { addEventListener: vi.fn(() => ({ remove: vi.fn() })) },
  useWindowDimensions: () => ({ width: 375, height: 667 }),
}));

vi.mock("expo-router", () => ({
  useRouter: () => useRouterMock(),
  useLocalSearchParams: () => useLocalSearchParamsMock(),
}));

vi.mock("lucide-react-native", () => ({
  Mic: () => null,
  MicOff: () => null,
  Plus: () => null,
  Sparkles: () => null,
  RotateCcw: () => null,
  FileText: () => null,
  Image: () => null,
  MessageSquare: () => null,
  Code: () => null,
  Copy: () => null,
  Check: () => null,
  ChevronDown: () => null,
  ChevronRight: () => null,
  Camera: () => null,
  Paperclip: () => null,
  Pencil: () => null,
  Trash2: () => null,
}));

vi.mock("@/components/ui/SafeAreaView", () => ({
  SafeAreaView: makeStub("SafeAreaView"),
}));

vi.mock("react-native-reanimated", () => ({
  __esModule: true,
  default: { View: makeStub("AnimatedView") },
  FadeIn: { duration: () => ({ type: "fade-in" }) },
  useAnimatedStyle: () => ({}),
  useSharedValue: (v: unknown) => ({ value: v }),
  withRepeat: (v: unknown) => v,
  withTiming: (v: unknown) => v,
  Easing: { out: () => () => 0, ease: 0 },
}));

vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => useQueryClientMock(),
  useQuery: (...args: unknown[]) => useQueryMock(...args),
  useMutation: (...args: unknown[]) => useMutationMock(...args),
}));

vi.mock("@/components/ui/AppDialogSheet", () => ({
  AppDialogSheet: makeStub("AppDialogSheet"),
}));
vi.mock("@/components/ui/Button", () => ({ Button: makeStub("Button") }));
vi.mock("@/components/ui/EmptyState", () => ({
  EmptyState: makeStub("EmptyState"),
}));
vi.mock("@/components/ui/InlineNotice", () => ({
  InlineNotice: makeStub("InlineNotice"),
}));
vi.mock("@/components/ui/LiveWaveform", () => ({
  LiveWaveform: makeStub("LiveWaveform"),
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
vi.mock("@/components/reports/CompletenessCard", () => ({
  CompletenessCard: makeStub("CompletenessCard"),
}));
vi.mock("@/components/ui/ScreenHeader", () => ({
  ScreenHeader: makeStub("ScreenHeader"),
}));
vi.mock("@/components/reports/DeleteDraftButton", () => ({
  DeleteDraftButton: makeStub("DeleteDraftButton"),
}));
vi.mock("@/components/files/ImagePreviewModal", () => ({
  ImagePreviewModal: makeStub("ImagePreviewModal"),
}));
vi.mock("@/components/notes/NoteTimeline", () => ({
  NoteTimeline: makeStub("NoteTimeline"),
}));

vi.mock("@/hooks/useReportGeneration", () => ({
  useReportGeneration: (...args: unknown[]) => useReportGenerationMock(...args),
}));
vi.mock("@/hooks/useReportAutoSave", () => ({
  useReportAutoSave: (...args: unknown[]) => useReportAutoSaveMock(...args),
}));
vi.mock("@/hooks/useCopyToClipboard", () => ({
  useCopyToClipboard: () => ({ copy: vi.fn(), isCopied: false }),
}));
vi.mock("@/hooks/useSpeechToText", () => ({
  useSpeechToText: (...args: unknown[]) => useSpeechToTextMock(...args),
}));
vi.mock("@/hooks/useNoteTimeline", () => ({
  useNoteTimeline: (...args: unknown[]) => useNoteTimelineMock(...args),
}));
vi.mock("@/hooks/useProjectFiles", () => ({
  useFileUpload: (...args: unknown[]) => useFileUploadMock(...args),
}));
vi.mock("@/hooks/useImagePreviewProps", () => ({
  useImagePreviewProps: () => ({}),
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
  useReportNotesMutations: (...args: unknown[]) =>
    useReportNotesMutationsMock(...args),
  useOtherReportFileIds: (...args: unknown[]) =>
    useOtherReportFileIdsMock(...args),
}));
vi.mock("@/lib/auth", () => ({ useAuth: () => useAuthMock() }));
vi.mock("@/lib/pick-project-file", () => ({
  pickProjectFile: vi.fn(async () => ({ kind: "cancelled" })),
}));
vi.mock("expo-image-picker", () => ({
  requestCameraPermissionsAsync: vi.fn(),
  launchCameraAsync: vi.fn(),
  MediaTypeOptions: { Images: "Images" },
}));
vi.mock("expo-file-system/legacy", () => ({
  getInfoAsync: vi.fn(async () => ({ exists: false })),
}));
vi.mock("@/lib/preprocess-image", () => ({ preprocessImageForUpload: vi.fn() }));
vi.mock("@/lib/project-members", () => ({
  fetchProjectTeam: vi.fn(),
}));
vi.mock("@/lib/note-entry", () => ({
  toTextArray: (notes: { text: string }[]) => notes.map((n) => n.text),
}));
vi.mock("@/lib/app-dialog-copy", () => ({
  getActionErrorDialogCopy: () => ({ title: "", message: "", confirmLabel: "" }),
  getDeleteNoteDialogCopy: () => ({
    title: "",
    message: "",
    confirmLabel: "",
    cancelLabel: "",
  }),
  getFinalizeReportDialogCopy: () => ({
    title: "",
    message: "",
    confirmLabel: "",
    cancelLabel: "",
  }),
}));
vi.mock("@/lib/generate-report-ui", () => ({
  getGenerateReportTabLabel: (tab: string, count: number) => {
    if (tab === "notes") return `Notes (${count})`;
    if (tab === "edit") return "Edit";
    return "Report";
  },
}));
vi.mock("@/lib/report-helpers", () => ({
  getReportCompleteness: () => 0,
  formatSourceNotes: () => "",
}));
vi.mock("@/lib/generated-report", () => ({
  normalizeGeneratedReportPayload: (v: unknown) => v,
}));
vi.mock("@/lib/design-tokens/colors", () => ({
  colors: {
    foreground: "#000",
    primary: { foreground: "#fff" },
    muted: { foreground: "#888" },
  },
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
  useReportGenerationMock.mockImplementation(() => {
    const [report, setReport] = React.useState<typeof FIXTURE_REPORT | null>(
      FIXTURE_REPORT,
    );
    return {
      report,
      isUpdating: false,
      error: null,
      regenerate: vi.fn(),
      notesSinceLastGeneration: 0,
      setReport,
      rawRequest: null,
      rawResponse: null,
      mutationStatus: "idle",
      lastGeneration: null,
      setLastGeneration: vi.fn(),
    };
  });
  useReportAutoSaveMock.mockReturnValue({
    flush: vi.fn(),
    markSaved: vi.fn(),
    isSaving: false,
    lastSavedAt: null,
  });
  useLocalReportMock.mockReturnValue({ data: null });
  useLocalReportNotesMock.mockReturnValue({ data: [] });
  useLocalReportMutationsMock.mockReturnValue({
    update: { mutateAsync: vi.fn(async () => {}), isPending: false },
    remove: { mutateAsync: vi.fn(async () => {}) },
  });
  useReportNotesMutationsMock.mockReturnValue({
    create: { mutate: vi.fn() },
    remove: { mutate: vi.fn() },
  });
  useOtherReportFileIdsMock.mockReturnValue({ data: new Set<string>() });
  useNoteTimelineMock.mockReturnValue({ timeline: [], isLoading: false });
  useSpeechToTextMock.mockReturnValue({
    isRecording: false,
    amplitude: 0,
    interimTranscript: "",
    error: null,
    start: vi.fn(),
    stop: vi.fn(),
  });
  useFileUploadMock.mockReturnValue({ mutate: vi.fn() });
  useAuthMock.mockReturnValue({ user: { id: "user-1" } });
  useQueryMock.mockReturnValue({ data: [] });
  useMutationMock.mockReturnValue({
    mutate: vi.fn(),
    isPending: false,
    error: null,
  });
});

afterEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = false;
});

describe("Generate screen — Edit tab", () => {
  it("renders ReportEditForm when the Edit tab is activated, and propagates form changes back to the report tab", async () => {
    const { default: GenerateReportScreen } = await import(
      "@/app/projects/[projectId]/reports/generate"
    );

    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(
        React.createElement(GenerateReportScreen),
      );
    });

    // Initially on the Report tab — ReportView gets the fixture report.
    expect(ReportViewMock).toHaveBeenCalled();
    expect(
      ReportViewMock.mock.calls.at(-1)?.[0].report.report.meta.title,
    ).toBe("Daily Report");

    // Tap the Edit tab.
    const editTab = findByTestID(renderer.root, "btn-tab-edit");
    expect(editTab).not.toBeNull();
    act(() => {
      (editTab!.props as { onPress: () => void }).onPress();
    });

    // ReportEditForm now rendered with the same report.
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

    // Edit form re-rendered with the new title (state propagated).
    const formAfter = ReportEditFormMock.mock.calls.at(-1)?.[0];
    expect(formAfter.report.report.meta.title).toBe("Updated Title");

    // Switch back to the Report tab and confirm the local edit is visible
    // there too (single source of truth).
    const reportTab = findByTestID(renderer.root, "btn-tab-report");
    act(() => {
      (reportTab!.props as { onPress: () => void }).onPress();
    });
    const lastReportView = ReportViewMock.mock.calls.at(-1)?.[0];
    expect(lastReportView.report.report.meta.title).toBe("Updated Title");
  });
});
