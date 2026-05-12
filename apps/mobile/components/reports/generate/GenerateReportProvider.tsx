import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";
import {
  Keyboard,
  ScrollView,
  useWindowDimensions,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from "react-native";
import { useQuery } from "@tanstack/react-query";
import { FileText, Image as ImageIcon, RotateCcw, Sparkles } from "lucide-react-native";
import { useImagePreviewProps } from "@/hooks/useImagePreviewProps";
import { useNoteTimeline } from "@/hooks/useNoteTimeline";
import { useVoiceNotePipeline } from "@/hooks/useVoiceNotePipeline";
import { usePhotoUploadPipeline } from "@/hooks/usePhotoUploadPipeline";
import { useReportDraftPersistence } from "@/hooks/useReportDraftPersistence";
import {
  useLocalReportNotes,
  useOtherReportFileIds,
  useReportNotesMutations,
} from "@/hooks/useLocalReportNotes";
import {
  useReportGeneration,
  type LastGeneration,
} from "@/hooks/useReportGeneration";
import { useAuth } from "@/lib/auth";
import { fetchProjectTeam } from "@/lib/project-members";
import { type FileCategory } from "@/lib/file-validation";
import { type NoteEntry, noteRowToPromptLine } from "@/lib/note-entry";
import { type FileMetadataRow } from "@/lib/file-upload";
import { type GeneratedSiteReport } from "@/lib/generated-report";
import { createEmptyReport } from "@/lib/report-edit-helpers";
import { colors } from "@/lib/design-tokens/colors";
import { TAB_ORDER, type TabKey } from "@/components/reports/generate/tabs";

/**
 * Single source of truth for the Generate Report screen. Owns every
 * orchestration hook the screen used to call inline (notes, generation,
 * draft persistence, voice/photo pipelines, dialog visibility, image
 * preview, tab/pager state, etc.) and exposes the bundle via
 * `useGenerateReport()`. Lets the panes consume what they need without
 * the screen drilling 50+ props through 3 layers.
 *
 * Truly child-local state (e.g. inline section editing in `ReportTabPane`)
 * stays in the child — only state shared across panes lives here.
 */

interface DraftMenuAction {
  key: string;
  label: string;
  icon: ReactNode;
  onPress: () => void;
  disabled?: boolean;
  testID?: string;
}

/**
 * State hook that runs all orchestration logic for the Generate Report
 * screen. Returns a grouped object instead of 70 flat fields; adding a
 * field to any pipeline hook requires no provider edit.
 */
function useGenerateReportState(projectId: string, reportId: string | undefined) {
  const { user } = useAuth();
  const notesScrollRef = useRef<ScrollView>(null);
  const reportScrollRef = useRef<ScrollView>(null);
  const pagerRef = useRef<ScrollView>(null);
  const { width: windowWidth } = useWindowDimensions();

  // ── Team members (for author names on voice/photo cards) ──
  const { data: team } = useQuery({
    queryKey: ["project-team", projectId],
    queryFn: () => fetchProjectTeam(projectId),
    enabled: !!projectId,
  });
  const memberNames = useMemo(() => {
    const map = new Map<string, string>();
    if (team) {
      for (const m of team) {
        if (m.full_name) map.set(m.user_id, m.full_name);
      }
    }
    return map;
  }, [team]);

  // ── Notes (hydrated from `report_notes`) ──
  const { data: noteRows } = useLocalReportNotes(reportId ?? null);
  const { create: createNoteMutation, remove: removeNoteMutation } =
    useReportNotesMutations();
  const [currentInput, setCurrentInput] = useState("");

  const notesWithBody = useMemo(
    () =>
      (noteRows ?? []).filter(
        (n) => typeof n.body === "string" && n.body.length > 0,
      ),
    [noteRows],
  );
  const notesList: NoteEntry[] = useMemo(
    () =>
      notesWithBody.map((n) => ({
        id: n.id,
        authorId: n.author_id,
        isPending: n.isOptimistic === true,
        text: n.body!,
        addedAt: Date.parse(n.created_at) || Date.now(),
        source: n.kind === "voice" ? "voice" : "text",
      })),
    [notesWithBody],
  );

  // Build the prompt-facing notes array from ALL noteRows (sorted by
  // position), not just text-bearing ones. Image/video/document notes
  // contribute placeholder strings so the LLM is aware of them and can
  // cite them inline as `[note N]`. Index matches `report_notes.position`.
  const notesPromptArray = useMemo(
    () =>
      [...(noteRows ?? [])]
        .sort((a, b) => a.position - b.position)
        .map((r) => noteRowToPromptLine(r)),
    [noteRows],
  );

  // ── Report generation ──
  const generation = useReportGeneration(notesPromptArray, projectId);

  // ── Tab state + horizontal pager ──
  const [activeTab, setActiveTab] = useState<TabKey>("report");
  // Tracks whether the most recent scroll was started by a user drag.
  // Programmatic scrollTo() animations also fire onMomentumScrollEnd; if
  // we acted on those, two quick tab taps would create a feedback loop
  // (tap → scrollTo → momentumEnd lands mid-flight → setActiveTab to a
  // tab the user didn't pick → scrollTo again → flicker indefinitely).
  const userDraggingRef = useRef(false);

  useEffect(() => {
    if (windowWidth <= 0) return;
    const idx = TAB_ORDER.indexOf(activeTab);
    pagerRef.current?.scrollTo({ x: idx * windowWidth, animated: true });
  }, [activeTab, windowWidth]);

  const handlePagerScrollBeginDrag = useCallback(() => {
    userDraggingRef.current = true;
  }, []);

  const handlePagerMomentumEnd = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const wasUserDrag = userDraggingRef.current;
      userDraggingRef.current = false;
      if (!wasUserDrag) return;
      if (windowWidth <= 0) return;
      const idx = Math.round(e.nativeEvent.contentOffset.x / windowWidth);
      const next = TAB_ORDER[idx];
      if (next && next !== activeTab) {
        Keyboard.dismiss();
        setActiveTab(next);
      }
    },
    [activeTab, windowWidth],
  );

  const handleRegenerate = useCallback(() => {
    setActiveTab("report");
    generation.regenerate();
  }, [generation]);

  // Lazy-init a blank report when the user opens the Edit tab without one.
  // Manual-entry path: report stays null until the user actively wants to
  // edit, then we seed an empty-but-zod-valid report so autosave + edit
  // form behave the same whether the report came from AI or manual entry.
  const handleOpenEditTab = useCallback(() => {
    Keyboard.dismiss();
    if (!generation.report) {
      generation.setReport(createEmptyReport());
    }
    setActiveTab("edit");
  }, [generation]);

  const handleEditManually = useCallback(() => {
    if (!generation.report) {
      generation.setReport(createEmptyReport());
    }
    setActiveTab("edit");
  }, [generation]);

  // ── Image preview ──
  const [imagePreview, setImagePreview] = useState<{
    file: FileMetadataRow;
  } | null>(null);
  const imagePreviewExtras = useImagePreviewProps(imagePreview?.file ?? null);

  // ── Dialog/UI state ──
  const [fileUploadErrorMessage, setFileUploadErrorMessage] = useState<
    string | null
  >(null);
  const [isAttachmentSheetVisible, setIsAttachmentSheetVisible] =
    useState(false);
  const [noteDeleteIndex, setNoteDeleteIndex] = useState<number | null>(null);

  // ── Draft persistence (autosave + finalize + delete) ──
  const draft = useReportDraftPersistence({
    projectId,
    reportId,
    report: generation.report,
    setReport: generation.setReport,
    lastGeneration: generation.lastGeneration,
    setLastGeneration: generation.setLastGeneration,
  });

  // ── Voice note pipeline ──
  const onVoiceNoteCreate = useCallback(
    ({ body, fileId }: { body: string | null; fileId: string }) => {
      if (!reportId || !projectId) return;
      createNoteMutation.mutate({
        reportId,
        projectId,
        kind: "voice",
        body,
        fileId,
      });
    },
    [createNoteMutation, projectId, reportId],
  );

  const voice = useVoiceNotePipeline({
    projectId,
    reportId,
    userId: user?.id,
    noteRows,
    notesScrollRef,
    onVoiceNoteCreate,
  });

  // ── Photo / file upload pipeline ──
  const photo = usePhotoUploadPipeline({
    projectId,
    reportId,
    userId: user?.id,
    notesScrollRef,
    onUploadError: setFileUploadErrorMessage,
  });

  // ── Timeline derived data ──
  const linkedFileIds = useMemo(() => {
    const ids = new Set<string>();
    for (const n of noteRows ?? []) {
      if (n.file_id) ids.add(n.file_id);
    }
    return ids;
  }, [noteRows]);

  const noteCreatedAtByFileId = useMemo(() => {
    const m = new Map<string, string>();
    for (const n of noteRows ?? []) {
      if (n.file_id && n.created_at) m.set(n.file_id, n.created_at);
    }
    return m;
  }, [noteRows]);

  const noteAuthorByFileId = useMemo(() => {
    const m = new Map<string, string>();
    for (const n of noteRows ?? []) {
      if (n.file_id && n.author_id) m.set(n.file_id, n.author_id);
    }
    return m;
  }, [noteRows]);

  const { data: excludedFileIds } = useOtherReportFileIds(projectId, reportId);

  const { timeline, isLoading: timelineLoading } = useNoteTimeline({
    notes: notesList,
    projectId,
    reportCreatedAt: draft.draftData?.created_at ?? null,
    linkedFileIds,
    excludedFileIds,
    noteCreatedAtByFileId,
    pendingPhotos: photo.queuePendingPhotos,
    pendingVoiceNotes: voice.pendingVoiceNotes,
  });

  // ── Note add/delete actions ──
  const addNote = useCallback(() => {
    const trimmed = currentInput.trim();
    if (!trimmed) return;
    if (!reportId || !projectId) return;
    createNoteMutation.mutate({
      reportId,
      projectId,
      kind: "text",
      body: trimmed,
    });
    setCurrentInput("");
    setTimeout(
      () => notesScrollRef.current?.scrollTo({ y: 0, animated: true }),
      100,
    );
  }, [currentInput, reportId, projectId, createNoteMutation]);

  const handleConfirmDeleteNote = useCallback(() => {
    if (noteDeleteIndex !== null) {
      const target = notesWithBody[noteDeleteIndex];
      if (target && !target.isOptimistic && reportId) {
        removeNoteMutation.mutate({ id: target.id, reportId });
      }
    }
    setNoteDeleteIndex(null);
  }, [noteDeleteIndex, notesWithBody, reportId, removeNoteMutation]);

  // ── Image open from timeline ──
  const handleOpenFile = useCallback((file: FileMetadataRow) => {
    if (file.mime_type.startsWith("image/")) {
      setImagePreview({ file });
    }
  }, []);

  const handlePickAttachment = useCallback(
    (category: Exclude<FileCategory, "avatar" | "voice-note">) => {
      void photo.handleMenuPick(category);
    },
    [photo],
  );

  // ── Header menu ──
  const draftMenuActions: DraftMenuAction[] | undefined = reportId
    ? [
        {
          key: "add-document",
          label: "Add document",
          icon: <FileText size={16} color={colors.foreground} />,
          onPress: () => void photo.handleMenuPick("document"),
          testID: "btn-menu-add-document",
        },
        {
          key: "add-photo",
          label: "Add photo",
          icon: <ImageIcon size={16} color={colors.foreground} />,
          onPress: () => void photo.handleMenuPick("image"),
          testID: "btn-menu-add-photo",
        },
        {
          key: "finalize",
          label: draft.isFinalizing ? "Finalizing..." : "Finalize Report",
          icon: <Sparkles size={16} color={colors.foreground} />,
          onPress: () => draft.setIsFinalizeConfirmVisible(true),
          disabled: !generation.report || draft.isFinalizing,
          testID: "btn-menu-finalize",
        },
        {
          key: "rebuild",
          label: "Regenerate",
          icon: <RotateCcw size={16} color={colors.foreground} />,
          onPress: handleRegenerate,
          disabled: draft.isFinalizing || generation.isUpdating,
          testID: "btn-menu-rebuild",
        },
      ]
    : undefined;

  return {
    // Cross-cutting primitives used everywhere
    projectId,
    reportId,
    handleRegenerate,

    // Grouped by concern
    refs: { pager: pagerRef, notesScroll: notesScrollRef, reportScroll: reportScrollRef },
    tabs: {
      active: activeTab,
      set: setActiveTab,
      windowWidth,
      onPagerMomentumEnd: handlePagerMomentumEnd,
      onPagerScrollBeginDrag: handlePagerScrollBeginDrag,
      openEdit: handleOpenEditTab,
      editManually: handleEditManually,
    },
    notes: {
      list: notesList,
      /**
       * Total source-note count including image/document notes (which
       * have `body: null` and are filtered out of `list`). Used by the
       * tab-bar badge so the count matches what the user actually
       * captured. `list` remains text-only because that's what feeds
       * the LLM.
       */
      totalCount: (noteRows ?? []).length,
      input: currentInput,
      setInput: setCurrentInput,
      add: addNote,
      deleteIndex: noteDeleteIndex,
      setDeleteIndex: setNoteDeleteIndex,
      confirmDelete: handleConfirmDeleteNote,
    },
    members: memberNames,
    generation,
    draft,
    voice,
    photo,
    timeline: {
      items: timeline,
      isLoading: timelineLoading,
      noteCreatedAtByFileId,
      noteAuthorByFileId,
    },
    preview: {
      file: imagePreview?.file ?? null,
      extras: imagePreviewExtras,
      set: setImagePreview,
      openFile: handleOpenFile,
    },
    ui: {
      attachmentSheetVisible: isAttachmentSheetVisible,
      setAttachmentSheetVisible: setIsAttachmentSheetVisible,
      fileUploadError: fileUploadErrorMessage,
      setFileUploadError: setFileUploadErrorMessage,
    },
    menuActions: draftMenuActions,
    handlePickAttachment,
  };
}

type GenerateReportContextValue = ReturnType<typeof useGenerateReportState>;

const GenerateReportContext = createContext<GenerateReportContextValue | null>(
  null,
);

export function useGenerateReport(): GenerateReportContextValue {
  const v = useContext(GenerateReportContext);
  if (!v) {
    throw new Error(
      "useGenerateReport must be used inside <GenerateReportProvider>",
    );
  }
  return v;
}

interface ProviderProps {
  projectId: string;
  reportId: string | undefined;
  children: ReactNode;
}

/**
 * Wraps the Generate Report screen body and runs every orchestration
 * hook in one place. Children read what they need via `useGenerateReport`.
 */
export function GenerateReportProvider({
  projectId,
  reportId,
  children,
}: ProviderProps) {
  const value = useGenerateReportState(projectId, reportId);
  return (
    <GenerateReportContext.Provider value={value}>
      {children}
    </GenerateReportContext.Provider>
  );
}
