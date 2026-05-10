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
const useAuthMock = vi.fn();
const useQueryMock = vi.fn();
const useMutationMock = vi.fn();
const useUploadQueueMock = vi.fn();
const ReportEditFormMock = vi.fn();
const ReportViewMock = vi.fn();

const pickProjectFileMock = vi.fn();
const requestCameraPermissionsAsyncMock = vi.fn();
const launchCameraAsyncMock = vi.fn();
const preprocessImageForUploadMock = vi.fn();
const getInfoAsyncMock = vi.fn();
const enqueueUploadMock = vi.fn<(input: unknown) => string>(() => "job-1");
const retryUploadMock = vi.fn<(jobId: string) => void>();
const cancelUploadMock = vi.fn<(jobId: string) => void>();

const routerMock = {
  back: vi.fn(),
  replace: vi.fn(),
  push: vi.fn(),
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

/**
 * Module-scope helper: the screen renders an upload-error AppDialogSheet
 * whose dismiss action is identifiable by `accessibilityLabel: "Dismiss
 * file upload error"`. Used by camera-capture and attachment-sheet tests.
 */
function isUploadErrorDialogVisible(
  renderer: TestRenderer.ReactTestRenderer,
): boolean {
  const dialogs = renderer.root.findAllByType("AppDialogSheet" as never);
  return dialogs.some((node) => {
    const actions = (node.props as { actions?: Array<{ accessibilityLabel?: string }> })
      .actions;
    const hasDismissAction = Array.isArray(actions)
      && actions.some((a) => a?.accessibilityLabel === "Dismiss file upload error");
    return hasDismissAction && (node.props as { visible?: boolean }).visible === true;
  });
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
  // No-op focus effect — generate.tsx uses this to drain camera-session
  // results on focus return; tests exercise the camera path directly.
  useFocusEffect: () => undefined,
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
  X: () => null,
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
  useFileUpload: () => ({ mutate: vi.fn() }),
}));
vi.mock("@/hooks/useUploadQueue", () => ({
  useUploadQueue: (...args: unknown[]) => useUploadQueueMock(...args),
}));
vi.mock("@/lib/uploads", () => ({
  getUploadQueue: () => ({
    enqueueUpload: enqueueUploadMock,
    retryUpload: retryUploadMock,
    cancelUpload: cancelUploadMock,
    subscribe: () => () => {},
    getJobs: () => [],
    getJob: () => undefined,
    hydrate: async () => {},
    whenIdle: async () => {},
  }),
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
  reportNotesKey: (id: string) => ["report-notes", id],
}));
vi.mock("@/lib/auth", () => ({ useAuth: () => useAuthMock() }));
vi.mock("@/lib/pick-project-file", () => ({
  pickProjectFile: (...args: unknown[]) => pickProjectFileMock(...args),
}));
vi.mock("expo-image-picker", () => ({
  requestCameraPermissionsAsync: (...a: unknown[]) =>
    requestCameraPermissionsAsyncMock(...a),
  launchCameraAsync: (...a: unknown[]) => launchCameraAsyncMock(...a),
  MediaTypeOptions: { Images: "Images" },
}));
vi.mock("expo-file-system/legacy", () => ({
  getInfoAsync: (...a: unknown[]) => getInfoAsyncMock(...a),
}));
vi.mock("@/lib/preprocess-image", () => ({
  preprocessImageForUpload: (...a: unknown[]) =>
    preprocessImageForUploadMock(...a),
}));
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
}));
vi.mock("@/lib/generated-report", () => ({
  normalizeGeneratedReportPayload: (v: unknown) => v,
}));
vi.mock("@/lib/design-tokens/colors", () => ({
  colors: {
    foreground: "#000",
    primary: { foreground: "#fff" },
    muted: { foreground: "#888" },
    destructive: { foreground: "#f00" },
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
  useUploadQueueMock.mockReturnValue({
    jobs: [],
    activeCount: 0,
    failedCount: 0,
    hasActive: false,
    aggregateProgress: 0,
  });
  enqueueUploadMock.mockClear().mockReturnValue("job-1");
  retryUploadMock.mockClear();
  cancelUploadMock.mockClear();
  useAuthMock.mockReturnValue({ user: { id: "user-1" } });
  useQueryMock.mockReturnValue({ data: [] });
  useMutationMock.mockReturnValue({
    mutate: vi.fn(),
    isPending: false,
    error: null,
  });
  // Camera-capture pipeline defaults: cancelled picker + no-op file probes.
  pickProjectFileMock.mockResolvedValue({ kind: "canceled" });
  requestCameraPermissionsAsyncMock.mockResolvedValue({ granted: true });
  launchCameraAsyncMock.mockResolvedValue({ canceled: true, assets: [] });
  preprocessImageForUploadMock.mockResolvedValue({
    originalUri: "file:///tmp/processed.jpg",
    thumbnailUri: "file:///tmp/processed.thumb.jpg",
    width: 1024,
    height: 768,
    mimeType: "image/jpeg",
    blurhash: "L0000",
  });
  getInfoAsyncMock.mockResolvedValue({ exists: true, size: 12345 });});

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

  it("Edit tab is always selectable (not disabled when no report)", async () => {
    useReportGenerationMock.mockImplementation(() => {
      const [report, setReport] = React.useState<typeof FIXTURE_REPORT | null>(
        null,
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

    const { default: GenerateReportScreen } = await import(
      "@/app/projects/[projectId]/reports/generate"
    );

    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(
        React.createElement(GenerateReportScreen),
      );
    });

    const editTab = findByTestID(renderer.root, "btn-tab-edit");
    expect(editTab).not.toBeNull();
    expect((editTab!.props as { disabled?: boolean }).disabled).toBeFalsy();
  });

  it("tapping the Edit tab with no report initializes a blank report and renders the editor", async () => {
    useReportGenerationMock.mockImplementation(() => {
      const [report, setReport] = React.useState<typeof FIXTURE_REPORT | null>(
        null,
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

    const { default: GenerateReportScreen } = await import(
      "@/app/projects/[projectId]/reports/generate"
    );

    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(
        React.createElement(GenerateReportScreen),
      );
    });

    // No edit form yet (no report).
    expect(ReportEditFormMock).not.toHaveBeenCalled();

    const editTab = findByTestID(renderer.root, "btn-tab-edit");
    act(() => {
      (editTab!.props as { onPress: () => void }).onPress();
    });

    // ReportEditForm now rendered with a freshly seeded empty report.
    expect(ReportEditFormMock).toHaveBeenCalled();
    const seeded = ReportEditFormMock.mock.calls.at(-1)?.[0];
    expect(seeded.report.report.meta.title).toBe("");
    expect(seeded.report.report.meta.reportType).toBe("site_visit");
    expect(seeded.report.report.materials).toEqual([]);
  });

  it("'Edit manually' empty-state CTA initializes a report and switches to the Edit tab", async () => {
    useReportGenerationMock.mockImplementation(() => {
      const [report, setReport] = React.useState<typeof FIXTURE_REPORT | null>(
        null,
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

    const { default: GenerateReportScreen } = await import(
      "@/app/projects/[projectId]/reports/generate"
    );

    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(
        React.createElement(GenerateReportScreen),
      );
    });

    const editManually = findByTestID(renderer.root, "btn-edit-manually");
    expect(editManually).not.toBeNull();
    act(() => {
      (editManually!.props as { onPress: () => void }).onPress();
    });

    // The form now renders the seeded empty report.
    expect(ReportEditFormMock).toHaveBeenCalled();
    const seeded = ReportEditFormMock.mock.calls.at(-1)?.[0];
    expect(seeded.report.report.meta.title).toBe("");
    expect(seeded.report.report.meta.summary).toBe("");
  });
});

// ---------------------------------------------------------------------------
// Camera capture button — PR-4 replaced the in-handler ImagePicker chain
// with a router-handoff to the in-app camera modal. The previous tests
// (preprocess, permission denial, upload onError) now live one layer
// down in the camera screen + the focus-effect drain; we keep a single
// regression here to lock down that the button DOES navigate to the
// camera route with a non-empty sessionId. The picker/preprocess/upload
// surfaces are covered by their own units (lib/preprocess-image.test.ts,
// lib/file-upload.test.ts, lib/uploads/*.test.ts).
// ---------------------------------------------------------------------------
describe("Generate screen — camera capture", () => {
  it("pressing btn-camera-capture pushes the in-app camera route with a sessionId", async () => {
    const { default: GenerateReportScreen } = await import(
      "@/app/projects/[projectId]/reports/generate"
    );
    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(
        React.createElement(GenerateReportScreen),
      );
    });
    const btn = findByTestID(renderer.root, "btn-camera-capture");
    expect(btn).not.toBeNull();
    act(() => {
      (btn!.props as { onPress: () => void }).onPress();
    });

    expect(routerMock.push).toHaveBeenCalledOnce();
    const arg = routerMock.push.mock.calls[0]![0] as {
      pathname: string;
      params: { sessionId?: string };
    };
    expect(arg.pathname).toBe("/(camera)/capture");
    expect(typeof arg.params?.sessionId).toBe("string");
    expect(arg.params!.sessionId!.length).toBeGreaterThan(0);
    // No direct upload from the button anymore — that's the receiver's job.
    expect(enqueueUploadMock).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Voice recording toggle — locks down that pressing `btn-record-start`
// actually invokes `useSpeechToText().start` (and `btn-record-stop` →
// `stop`). Same class of regression as the camera bug: a broken native
// hook would render the button but never start the recording, and unit
// tests that only assert the button is *visible* would still pass.
// ---------------------------------------------------------------------------
describe("Generate screen — voice recording toggle", () => {
  async function renderScreen() {
    const { default: GenerateReportScreen } = await import(
      "@/app/projects/[projectId]/reports/generate"
    );
    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(
        React.createElement(GenerateReportScreen),
      );
    });
    return renderer;
  }

  it("pressing btn-record-start invokes useSpeechToText().start", async () => {
    const startMock = vi.fn();
    const stopMock = vi.fn();
    useSpeechToTextMock.mockReturnValue({
      isRecording: false,
      amplitude: 0,
      interimTranscript: "",
      error: null,
      start: startMock,
      stop: stopMock,
    });

    const renderer = await renderScreen();
    const btn = findByTestID(renderer.root, "btn-record-start");
    expect(btn).not.toBeNull();
    act(() => {
      (btn!.props as { onPress: () => void }).onPress();
    });

    expect(startMock).toHaveBeenCalledOnce();
    expect(stopMock).not.toHaveBeenCalled();
  });

  it("pressing btn-record-stop invokes useSpeechToText().stop", async () => {
    const startMock = vi.fn();
    const stopMock = vi.fn();
    useSpeechToTextMock.mockReturnValue({
      isRecording: true,
      amplitude: 0,
      interimTranscript: "",
      error: null,
      start: startMock,
      stop: stopMock,
    });

    const renderer = await renderScreen();
    const btn = findByTestID(renderer.root, "btn-record-stop");
    expect(btn).not.toBeNull();
    act(() => {
      (btn!.props as { onPress: () => void }).onPress();
    });

    expect(stopMock).toHaveBeenCalledOnce();
    expect(startMock).not.toHaveBeenCalled();
  });
});

describe("Generate screen — upload queue completion", () => {
  it("refreshes report notes and project files when an upload completes", async () => {
    useUploadQueueMock.mockReturnValue({
      jobs: [
        {
          id: "job-uploaded-1",
          state: "uploaded",
          input: {
            projectId: "project-1",
            reportId: "report-1",
            category: "image",
          },
        },
      ],
      activeCount: 0,
      failedCount: 0,
      hasActive: false,
      aggregateProgress: 0,
    });

    const { default: GenerateReportScreen } = await import(
      "@/app/projects/[projectId]/reports/generate"
    );
    act(() => {
      TestRenderer.create(React.createElement(GenerateReportScreen));
    });

    expect(queryClientMock.invalidateQueries).toHaveBeenCalledWith({
      queryKey: ["report-notes", "report-1"],
    });
    expect(queryClientMock.invalidateQueries).toHaveBeenCalledWith({
      queryKey: ["project-files", "project-1"],
    });
  });
});

// ---------------------------------------------------------------------------
// Attachment sheet — the "Add attachment" picker has its own Document /
// Photo Library / Camera actions, separate from `btn-camera-capture`.
// These actions live inside an AppDialogSheet and were never tested.
// They share the `handleMenuPick` / `handleCameraCapture` handlers, so
// the same silent-failure modes apply (denied permission, picker error,
// upload throw).
// ---------------------------------------------------------------------------
describe("Generate screen — attachment sheet", () => {
  async function renderAndOpenSheet() {
    const { default: GenerateReportScreen } = await import(
      "@/app/projects/[projectId]/reports/generate"
    );
    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(
        React.createElement(GenerateReportScreen),
      );
    });

    const attachBtn = findByTestID(renderer.root, "btn-attachment");
    expect(attachBtn).not.toBeNull();
    act(() => {
      (attachBtn!.props as { onPress: () => void }).onPress();
    });
    return renderer;
  }

  /** Locate a specific attachment-sheet action by its accessibilityLabel. */
  function findSheetAction(
    renderer: TestRenderer.ReactTestRenderer,
    label: string,
  ): { onPress: () => void } | null {
    const sheets = renderer.root.findAllByType("AppDialogSheet" as never);
    for (const node of sheets) {
      const actions =
        (node.props as {
          actions?: Array<{
            accessibilityLabel?: string;
            onPress?: () => void;
          }>;
        }).actions ?? [];
      const match = actions.find(
        (a) => a?.accessibilityLabel === label,
      );
      if (match?.onPress) return { onPress: match.onPress };
    }
    return null;
  }

  async function flushMicrotasks() {
    for (let i = 0; i < 5; i++) {
      await act(async () => {
        await Promise.resolve();
      });
    }
  }

  it("'Photo Library' action calls pickProjectFile and forwards the result to the upload queue", async () => {
    pickProjectFileMock.mockResolvedValue({
      kind: "ok",
      file: {
        fileUri: "file:///tmp/lib-photo.jpg",
        filename: "lib-photo.jpg",
        mimeType: "image/jpeg",
        sizeBytes: 8888,
      },
    });

    const renderer = await renderAndOpenSheet();
    const action = findSheetAction(renderer, "Pick a photo from library");
    expect(action).not.toBeNull();
    await act(async () => {
      action!.onPress();
    });
    await flushMicrotasks();

    expect(pickProjectFileMock).toHaveBeenCalledWith("image");
    expect(enqueueUploadMock).toHaveBeenCalledOnce();
    const [payload] = enqueueUploadMock.mock.calls[0]!;
    expect(payload).toMatchObject({
      kind: "project-image",
      projectId: "project-1",
      reportId: "report-1",
      category: "image",
      sourceUri: "file:///tmp/lib-photo.jpg",
      filename: "lib-photo.jpg",
      isImage: true,
      uploadedBy: "user-1",
    });
  });

  it("'Document' action calls pickProjectFile('document') and uploads", async () => {
    pickProjectFileMock.mockResolvedValue({
      kind: "ok",
      file: {
        fileUri: "file:///tmp/spec.pdf",
        filename: "spec.pdf",
        mimeType: "application/pdf",
        sizeBytes: 12345,
      },
    });

    const renderer = await renderAndOpenSheet();
    const action = findSheetAction(renderer, "Pick a document");
    expect(action).not.toBeNull();
    await act(async () => {
      action!.onPress();
    });
    await flushMicrotasks();

    expect(pickProjectFileMock).toHaveBeenCalledWith("document");
    expect(enqueueUploadMock).toHaveBeenCalledOnce();
    const payload = enqueueUploadMock.mock.calls[0]![0] as Record<
      string,
      unknown
    >;
    expect(payload.category).toBe("document");
    expect(payload.kind).toBe("document");
    expect(payload.filename).toBe("spec.pdf");
    expect(payload.isImage).toBe(false);
  });

  it("does not upload and surfaces a dialog when pickProjectFile returns kind=error (e.g. permission denied)", async () => {
    pickProjectFileMock.mockResolvedValue({
      kind: "error",
      message: "Photo library permission denied",
    });

    const renderer = await renderAndOpenSheet();
    const action = findSheetAction(renderer, "Pick a photo from library");
    await act(async () => {
      action!.onPress();
    });
    await flushMicrotasks();

    expect(enqueueUploadMock).not.toHaveBeenCalled();
    expect(isUploadErrorDialogVisible(renderer)).toBe(true);
  });

  it("does nothing when the user cancels the picker (no upload, no error dialog)", async () => {
    pickProjectFileMock.mockResolvedValue({ kind: "canceled" });

    const renderer = await renderAndOpenSheet();
    const action = findSheetAction(renderer, "Pick a photo from library");
    await act(async () => {
      action!.onPress();
    });
    await flushMicrotasks();

    expect(enqueueUploadMock).not.toHaveBeenCalled();
    expect(isUploadErrorDialogVisible(renderer)).toBe(false);
  });

  it("per-row upload failures surface as a failed chip in the timeline, not the dialog (queue-driven UX)", async () => {
    // After PR-7, mutation-level errors are no longer routed to the
    // global upload-error dialog — they appear as a failed chip on the
    // queue-projected timeline row, with retry/discard handled by
    // queue.retryUpload / cancelUpload. The picker-level dialog is
    // reserved for picker errors (no row to attach a chip to).
    pickProjectFileMock.mockResolvedValue({
      kind: "ok",
      file: {
        fileUri: "file:///tmp/lib-photo.jpg",
        filename: "lib-photo.jpg",
        mimeType: "image/jpeg",
        sizeBytes: 8888,
      },
    });

    const renderer = await renderAndOpenSheet();
    const action = findSheetAction(renderer, "Pick a photo from library");
    await act(async () => {
      action!.onPress();
    });
    await flushMicrotasks();

    expect(enqueueUploadMock).toHaveBeenCalledOnce();
    expect(isUploadErrorDialogVisible(renderer)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Finalize report — multi-step flow:
//   1. Press btn-finalize-report → opens AppDialogSheet (isFinalizeConfirmVisible)
//   2. Press the dialog's "Confirm" action → invokes the finalize mutation
// The tests below exercise both steps and the cancel branch.
// ---------------------------------------------------------------------------
describe("Generate screen — finalize report", () => {
  async function renderScreen() {
    const { default: GenerateReportScreen } = await import(
      "@/app/projects/[projectId]/reports/generate"
    );
    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(
        React.createElement(GenerateReportScreen),
      );
    });
    return renderer;
  }

  /** Find the finalize-confirmation dialog by its action's a11y label. */
  function findFinalizeDialog(
    renderer: TestRenderer.ReactTestRenderer,
  ): {
    visible: boolean;
    confirm?: () => void;
    cancel?: () => void;
  } {
    const dialogs = renderer.root.findAllByType("AppDialogSheet" as never);
    for (const node of dialogs) {
      const props = node.props as {
        visible?: boolean;
        actions?: Array<{
          accessibilityLabel?: string;
          onPress?: () => void;
        }>;
      };
      const actions = props.actions ?? [];
      const confirm = actions.find(
        (a) => a?.accessibilityLabel === "Confirm finalize report",
      );
      const cancel = actions.find(
        (a) => a?.accessibilityLabel === "Cancel finalize report",
      );
      if (confirm) {
        return {
          visible: props.visible === true,
          confirm: confirm.onPress,
          cancel: cancel?.onPress,
        };
      }
    }
    return { visible: false };
  }

  it("pressing btn-finalize-report opens the confirmation dialog (does not directly fire the mutation)", async () => {
    const finalizeMutate = vi.fn();
    // First useMutation call inside the screen is for finalize. Make the
    // shared mock return our spy so we can assert against it.
    useMutationMock.mockReturnValue({
      mutate: finalizeMutate,
      isPending: false,
      error: null,
    });

    const renderer = await renderScreen();
    expect(findFinalizeDialog(renderer).visible).toBe(false);

    const btn = findByTestID(renderer.root, "btn-finalize-report");
    expect(btn).not.toBeNull();
    act(() => {
      (btn!.props as { onPress: () => void }).onPress();
    });

    // Dialog opened; mutation NOT called yet (this is the safety the
    // confirmation step gives us — pressing the button should never be
    // destructive without an extra confirmation tap).
    expect(findFinalizeDialog(renderer).visible).toBe(true);
    expect(finalizeMutate).not.toHaveBeenCalled();
  });

  it("pressing the dialog Confirm action invokes the finalize mutation", async () => {
    const finalizeMutate = vi.fn();
    useMutationMock.mockReturnValue({
      mutate: finalizeMutate,
      isPending: false,
      error: null,
    });

    const renderer = await renderScreen();
    act(() => {
      (
        findByTestID(renderer.root, "btn-finalize-report")!.props as {
          onPress: () => void;
        }
      ).onPress();
    });

    const dialog = findFinalizeDialog(renderer);
    expect(dialog.visible).toBe(true);
    expect(typeof dialog.confirm).toBe("function");

    act(() => {
      dialog.confirm!();
    });

    expect(finalizeMutate).toHaveBeenCalledOnce();
  });

  it("pressing the dialog Cancel action closes the dialog without firing the mutation", async () => {
    const finalizeMutate = vi.fn();
    useMutationMock.mockReturnValue({
      mutate: finalizeMutate,
      isPending: false,
      error: null,
    });

    const renderer = await renderScreen();
    act(() => {
      (
        findByTestID(renderer.root, "btn-finalize-report")!.props as {
          onPress: () => void;
        }
      ).onPress();
    });
    expect(findFinalizeDialog(renderer).visible).toBe(true);

    const dialog = findFinalizeDialog(renderer);
    act(() => {
      dialog.cancel!();
    });

    expect(findFinalizeDialog(renderer).visible).toBe(false);
    expect(finalizeMutate).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Generate / Update Report button — calls handleRegenerate(), which in turn
// invokes the `regenerate` function returned by `useReportGeneration` and
// switches the active tab to "report".
// ---------------------------------------------------------------------------
describe("Generate screen — generate/update report", () => {
  async function renderScreenWithRegenerateSpy(spy: ReturnType<typeof vi.fn>) {
    useReportGenerationMock.mockImplementation(() => {
      const [report, setReport] = React.useState<typeof FIXTURE_REPORT | null>(
        FIXTURE_REPORT,
      );
      return {
        report,
        isUpdating: false,
        error: null,
        regenerate: spy,
        notesSinceLastGeneration: 1, // > 0 so the button is enabled
        setReport,
        rawRequest: null,
        rawResponse: null,
        mutationStatus: "idle",
        lastGeneration: null,
        setLastGeneration: vi.fn(),
      };
    });
    // The button only renders when `timeline.length > 0`.
    useNoteTimelineMock.mockReturnValue({
      timeline: [{ kind: "text", sourceIndex: 0, text: "first note" }],
      isLoading: false,
    });
    const { default: GenerateReportScreen } = await import(
      "@/app/projects/[projectId]/reports/generate"
    );
    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(
        React.createElement(GenerateReportScreen),
      );
    });
    return renderer;
  }

  it("pressing btn-generate-update-report invokes useReportGeneration().regenerate", async () => {
    const regenerateSpy = vi.fn();
    const renderer = await renderScreenWithRegenerateSpy(regenerateSpy);

    const btn = findByTestID(renderer.root, "btn-generate-update-report");
    expect(btn).not.toBeNull();
    expect((btn!.props as { disabled?: boolean }).disabled).toBe(false);

    act(() => {
      (btn!.props as { onPress: () => void }).onPress();
    });

    expect(regenerateSpy).toHaveBeenCalledOnce();
  });

  it("button is disabled while a regeneration is already in flight", async () => {
    useReportGenerationMock.mockImplementation(() => {
      const [report, setReport] = React.useState<typeof FIXTURE_REPORT | null>(
        FIXTURE_REPORT,
      );
      return {
        report,
        isUpdating: true, // mid-flight
        error: null,
        regenerate: vi.fn(),
        notesSinceLastGeneration: 1,
        setReport,
        rawRequest: null,
        rawResponse: null,
        mutationStatus: "idle",
        lastGeneration: null,
        setLastGeneration: vi.fn(),
      };
    });
    useNoteTimelineMock.mockReturnValue({
      timeline: [{ kind: "text", sourceIndex: 0, text: "first note" }],
      isLoading: false,
    });

    const { default: GenerateReportScreen } = await import(
      "@/app/projects/[projectId]/reports/generate"
    );
    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(
        React.createElement(GenerateReportScreen),
      );
    });

    const btn = findByTestID(renderer.root, "btn-generate-update-report");
    expect((btn!.props as { disabled?: boolean }).disabled).toBe(true);
  });
});
