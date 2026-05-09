import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  KeyboardAvoidingView,
  Keyboard,
  ScrollView,
  View,
  useWindowDimensions,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  FileText,
  Image as ImageIcon,
  RotateCcw,
  Sparkles,
} from "lucide-react-native";
import { SafeAreaView } from "@/components/ui/SafeAreaView";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { DeleteDraftButton } from "@/components/reports/DeleteDraftButton";
import {
  GenerateReportTabBar,
  TAB_ORDER,
  type TabKey,
} from "@/components/reports/generate/GenerateReportTabBar";
import { NotesTabPane } from "@/components/reports/generate/NotesTabPane";
import { ReportTabPane } from "@/components/reports/generate/ReportTabPane";
import { EditTabPane } from "@/components/reports/generate/EditTabPane";
import { DebugTabPane } from "@/components/reports/generate/DebugTabPane";
import { GenerateReportInputBar } from "@/components/reports/generate/GenerateReportInputBar";
import { GenerateReportDialogs } from "@/components/reports/generate/GenerateReportDialogs";
import { useReportGeneration } from "@/hooks/useReportGeneration";
import { useAuth } from "@/lib/auth";
import { useImagePreviewProps } from "@/hooks/useImagePreviewProps";
import { useNoteTimeline } from "@/hooks/useNoteTimeline";
import { useVoiceNotePipeline } from "@/hooks/useVoiceNotePipeline";
import { usePhotoUploadPipeline } from "@/hooks/usePhotoUploadPipeline";
import { useReportDraftPersistence } from "@/hooks/useReportDraftPersistence";
import { fetchProjectTeam } from "@/lib/project-members";
import { type FileCategory } from "@/lib/file-validation";
import { type NoteEntry, toTextArray } from "@/lib/note-entry";
import { type FileMetadataRow } from "@/lib/file-upload";
import {
  useLocalReportNotes,
  useOtherReportFileIds,
  useReportNotesMutations,
} from "@/hooks/useLocalReportNotes";
import { createEmptyReport } from "@/lib/report-edit-helpers";
import { colors } from "@/lib/design-tokens/colors";

export default function GenerateReportScreen() {
  const router = useRouter();
  const { projectId, reportId } = useLocalSearchParams<{
    projectId: string;
    reportId?: string;
  }>();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const notesScrollRef = useRef<ScrollView>(null);
  const reportScrollRef = useRef<ScrollView>(null);
  const pagerRef = useRef<ScrollView>(null);
  const { width: windowWidth } = useWindowDimensions();

  // ── Team members (for author names on voice/photo cards) ──
  const { data: team } = useQuery({
    queryKey: ["project-team", projectId],
    queryFn: () => fetchProjectTeam(projectId!),
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

  const notesWithBody = (noteRows ?? []).filter(
    (n) => typeof n.body === "string" && n.body.length > 0,
  );
  const notesList: NoteEntry[] = notesWithBody.map((n) => ({
    id: n.id,
    authorId: n.author_id,
    isPending: n.isOptimistic === true,
    text: n.body!,
    addedAt: Date.parse(n.created_at) || Date.now(),
    source: n.kind === "voice" ? "voice" : "text",
  }));
  const notesTextArray = toTextArray(notesList);

  // ── Report generation ──
  const {
    report,
    isUpdating,
    error,
    regenerate,
    notesSinceLastGeneration,
    setReport,
    rawRequest,
    rawResponse,
    mutationStatus,
    lastGeneration,
    setLastGeneration,
  } = useReportGeneration(notesTextArray, projectId);

  // ── Tab state + horizontal pager ──
  const [activeTab, setActiveTab] = useState<TabKey>("report");

  useEffect(() => {
    if (windowWidth <= 0) return;
    const idx = TAB_ORDER.indexOf(activeTab);
    pagerRef.current?.scrollTo({ x: idx * windowWidth, animated: true });
  }, [activeTab, windowWidth]);

  const handlePagerMomentumEnd = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
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
    regenerate();
  }, [regenerate]);

  // Lazy-init a blank report when the user opens the Edit tab without one.
  // Manual-entry path: report stays null until the user actively wants to
  // edit, then we seed an empty-but-zod-valid report so autosave + edit
  // form behave the same whether the report came from AI or manual entry.
  const handleOpenEditTab = useCallback(() => {
    Keyboard.dismiss();
    if (!report) {
      setReport(createEmptyReport());
    }
    setActiveTab("edit");
  }, [report, setReport]);

  const handleEditManually = useCallback(() => {
    if (!report) {
      setReport(createEmptyReport());
    }
    setActiveTab("edit");
  }, [report, setReport]);

  // ── Inline editing state ──
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editingContent, setEditingContent] = useState("");
  const [imagePreview, setImagePreview] = useState<{ file: FileMetadataRow } | null>(null);
  const imagePreviewExtras = useImagePreviewProps(imagePreview?.file ?? null);

  const startEditing = useCallback(
    (index: number) => {
      setEditingIndex(index);
      setEditingContent(report!.report.sections[index].content);
    },
    [report],
  );

  const saveEdit = useCallback(() => {
    if (editingIndex === null || !report) return;
    setReport((prev) =>
      prev
        ? {
            ...prev,
            report: {
              ...prev.report,
              sections: prev.report.sections.map((block, i) =>
                i === editingIndex ? { ...block, content: editingContent } : block,
              ),
            },
          }
        : prev,
    );
    setEditingIndex(null);
    setEditingContent("");
  }, [editingIndex, editingContent, report, setReport]);

  // ── Dialog/UI state ──
  const [fileUploadErrorMessage, setFileUploadErrorMessage] = useState<string | null>(null);
  const [isAttachmentSheetVisible, setIsAttachmentSheetVisible] = useState(false);
  const [noteDeleteIndex, setNoteDeleteIndex] = useState<number | null>(null);

  // ── Draft persistence (autosave + finalize + delete) ──
  const {
    draftData,
    handleBack,
    isAutoSaving,
    lastSavedAt,
    finalizeReport,
    isFinalizing,
    finalizeError,
    isFinalizeConfirmVisible,
    setIsFinalizeConfirmVisible,
    deleteDraft,
    isDeletingDraft,
    draftDeleteErrorMessage,
    setDraftDeleteErrorMessage,
  } = useReportDraftPersistence({
    projectId,
    reportId,
    report,
    setReport,
    lastGeneration,
    setLastGeneration,
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

  const {
    pendingVoiceNotes,
    pendingVoiceTranscriptionIds,
    voiceTranscriptionsByFileId,
    isRecording,
    amplitude,
    interimTranscript,
    speechError,
    toggleRecording,
    handleRetryPendingVoice,
    handleDiscardPendingVoice,
  } = useVoiceNotePipeline({
    projectId,
    reportId,
    userId: user?.id,
    noteRows,
    notesScrollRef,
    onVoiceNoteCreate,
  });

  // ── Photo / file upload pipeline ──
  const {
    queuePendingPhotos,
    handleMenuPick,
    handleCameraCapture,
    handleRetryPendingPhoto,
    handleDiscardPendingPhoto,
  } = usePhotoUploadPipeline({
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
    reportCreatedAt: draftData?.created_at ?? null,
    linkedFileIds,
    excludedFileIds,
    noteCreatedAtByFileId,
    pendingPhotos: queuePendingPhotos,
    pendingVoiceNotes,
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

  // ── Header menu ──
  const draftMenuActions = reportId
    ? [
        {
          key: "add-document",
          label: "Add document",
          icon: <FileText size={16} color={colors.foreground} />,
          onPress: () => void handleMenuPick("document"),
          testID: "btn-menu-add-document",
        },
        {
          key: "add-photo",
          label: "Add photo",
          icon: <ImageIcon size={16} color={colors.foreground} />,
          onPress: () => void handleMenuPick("image"),
          testID: "btn-menu-add-photo",
        },
        {
          key: "finalize",
          label: isFinalizing ? "Finalizing..." : "Finalize Report",
          icon: <Sparkles size={16} color={colors.foreground} />,
          onPress: () => setIsFinalizeConfirmVisible(true),
          disabled: !report || isFinalizing,
          testID: "btn-menu-finalize",
        },
        {
          key: "rebuild",
          label: "Regenerate",
          icon: <RotateCcw size={16} color={colors.foreground} />,
          onPress: () => handleRegenerate(),
          disabled: isFinalizing || isUpdating,
          testID: "btn-menu-rebuild",
        },
      ]
    : undefined;

  const handleOpenFile = useCallback((file: FileMetadataRow) => {
    if (file.mime_type.startsWith("image/")) {
      setImagePreview({ file });
    }
  }, []);

  const handlePickAttachment = useCallback(
    (category: Exclude<FileCategory, "avatar" | "voice-note">) => {
      void handleMenuPick(category);
    },
    [handleMenuPick],
  );

  return (
    <SafeAreaView className="flex-1 bg-background">
      <KeyboardAvoidingView
        behavior="padding"
        className="flex-1"
        keyboardVerticalOffset={0}
      >
        <View className="px-5 pt-4 pb-2">
          <ScreenHeader
            title="New Report"
            onBack={handleBack}
            backLabel="Reports"
            trailing={
              reportId ? (
                <DeleteDraftButton
                  isDeleting={isDeletingDraft}
                  onConfirmDelete={() => deleteDraft()}
                  extraActions={draftMenuActions}
                />
              ) : null
            }
          />
        </View>

        <GenerateReportTabBar
          activeTab={activeTab}
          notesCount={notesList.length}
          isUpdating={isUpdating}
          onSelectTab={setActiveTab}
          onOpenEditTab={handleOpenEditTab}
        />

        <ScrollView
          ref={pagerRef}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          onMomentumScrollEnd={handlePagerMomentumEnd}
          contentOffset={{ x: windowWidth, y: 0 }}
          className="flex-1"
          // Disable parent's horizontal pan from intercepting taps inside
          // children (e.g. note rows, buttons) on Android.
          nestedScrollEnabled
        >
          <NotesTabPane
            ref={notesScrollRef}
            width={windowWidth}
            timeline={timeline}
            timelineLoading={timelineLoading}
            voiceTranscriptionsByFileId={voiceTranscriptionsByFileId}
            pendingVoiceTranscriptionIds={pendingVoiceTranscriptionIds}
            memberNames={memberNames}
            noteCreatedAtByFileId={noteCreatedAtByFileId}
            noteAuthorByFileId={noteAuthorByFileId}
            onRemoveNote={(i) => setNoteDeleteIndex(i)}
            onOpenFile={handleOpenFile}
            onRetryPendingPhoto={handleRetryPendingPhoto}
            onDiscardPendingPhoto={handleDiscardPendingPhoto}
            onRetryPendingVoice={handleRetryPendingVoice}
            onDiscardPendingVoice={handleDiscardPendingVoice}
            report={report}
            isUpdating={isUpdating}
            notesSinceLastGeneration={notesSinceLastGeneration}
            onRegenerate={handleRegenerate}
          />

          <ReportTabPane
            ref={reportScrollRef}
            width={windowWidth}
            report={report}
            isUpdating={isUpdating}
            isFinalizing={isFinalizing}
            error={error}
            finalizeError={finalizeError}
            editingIndex={editingIndex}
            editingContent={editingContent}
            onEditStart={startEditing}
            onEditChange={setEditingContent}
            onEditSave={saveEdit}
            onRegenerate={handleRegenerate}
            onRequestFinalize={() => setIsFinalizeConfirmVisible(true)}
            onEditManually={handleEditManually}
          />

          <EditTabPane
            width={windowWidth}
            report={report}
            onChange={setReport}
            isAutoSaving={isAutoSaving}
            lastSavedAt={lastSavedAt}
          />

          <DebugTabPane
            width={windowWidth}
            notesCount={notesList.length}
            mutationStatus={mutationStatus}
            rawRequest={rawRequest}
            rawResponse={rawResponse}
            lastGeneration={lastGeneration}
            error={error}
          />
        </ScrollView>

        <GenerateReportInputBar
          currentInput={currentInput}
          onChangeInput={setCurrentInput}
          onSubmit={addNote}
          isRecording={isRecording}
          amplitude={amplitude}
          interimTranscript={interimTranscript}
          speechError={speechError}
          onToggleRecording={toggleRecording}
          onCameraCapture={() => void handleCameraCapture()}
          onOpenAttachmentSheet={() => setIsAttachmentSheetVisible(true)}
        />

        <GenerateReportDialogs
          isFinalizeConfirmVisible={isFinalizeConfirmVisible}
          isFinalizing={isFinalizing}
          hasReport={report !== null}
          onConfirmFinalize={() => finalizeReport()}
          onCancelFinalize={() => setIsFinalizeConfirmVisible(false)}
          noteDeleteIndex={noteDeleteIndex}
          onConfirmDeleteNote={handleConfirmDeleteNote}
          onCancelDeleteNote={() => setNoteDeleteIndex(null)}
          draftDeleteErrorMessage={draftDeleteErrorMessage}
          onDismissDraftDeleteError={() => setDraftDeleteErrorMessage(null)}
          fileUploadErrorMessage={fileUploadErrorMessage}
          onDismissFileUploadError={() => setFileUploadErrorMessage(null)}
          imagePreviewFile={imagePreview?.file ?? null}
          imagePreviewExtras={imagePreviewExtras}
          onCloseImagePreview={() => setImagePreview(null)}
          isAttachmentSheetVisible={isAttachmentSheetVisible}
          onCloseAttachmentSheet={() => setIsAttachmentSheetVisible(false)}
          onPickAttachment={handlePickAttachment}
          onCameraCapture={() => void handleCameraCapture()}
        />
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
