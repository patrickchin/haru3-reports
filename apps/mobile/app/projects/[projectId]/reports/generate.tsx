import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  ScrollView,
  KeyboardAvoidingView,
  Keyboard,
  Platform,
  ActivityIndicator,
  AppState,
  useWindowDimensions,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import {
  Mic,
  MicOff,
  Plus,
  Sparkles,
  RotateCcw,
  FileText,
  Image as ImageIcon,
  MessageSquare,
  Code,
  Copy,
  Check,
  ChevronDown,
  ChevronRight,
  Camera,
  Paperclip,
} from "lucide-react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Animated, {
  FadeIn,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
  Easing,
} from "react-native-reanimated";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AppDialogSheet } from "@/components/ui/AppDialogSheet";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { InlineNotice } from "@/components/ui/InlineNotice";
import { LiveWaveform } from "@/components/ui/LiveWaveform";
import { ReportView } from "@/components/reports/ReportView";
import { CompletenessCard } from "@/components/reports/CompletenessCard";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { DeleteDraftButton } from "@/components/reports/DeleteDraftButton";
import { useReportGeneration } from "@/hooks/useReportGeneration";
import { useCopyToClipboard } from "@/hooks/useCopyToClipboard";
import { useSpeechToText } from "@/hooks/useSpeechToText";
import { useAuth } from "@/lib/auth";
import { ImagePreviewModal } from "@/components/files/ImagePreviewModal";
import { NoteTimeline } from "@/components/notes/NoteTimeline";
import { useNoteTimeline } from "@/hooks/useNoteTimeline";
import { useFileUpload } from "@/hooks/useProjectFiles";
import { useImagePreviewProps } from "@/hooks/useImagePreviewProps";
import { pickProjectFile } from "@/lib/pick-project-file";
import * as ImagePicker from "expo-image-picker";
import * as FileSystem from "expo-file-system/legacy";
import { preprocessImageForUpload } from "@/lib/preprocess-image";
import { fetchProjectTeam } from "@/lib/project-members";
import { type FileCategory } from "@/lib/file-validation";
import { type NoteEntry, toTextArray } from "@/lib/note-entry";
import { type FileMetadataRow } from "@/lib/file-upload";
import { getActionErrorDialogCopy, getDeleteNoteDialogCopy, getFinalizeReportDialogCopy } from "@/lib/app-dialog-copy";
import { getGenerateReportTabLabel } from "@/lib/generate-report-ui";
import { getReportCompleteness } from "@/lib/report-helpers";
import {
  useLocalReport,
  useLocalReportMutations,
  reportKey,
  reportsKey,
} from "@/hooks/useLocalReports";
import {
  useLocalReportNotes,
  useOtherReportFileIds,
  useReportNotesMutations,
} from "@/hooks/useLocalReportNotes";
import {
  normalizeGeneratedReportPayload,
  type GeneratedSiteReport,
} from "@/lib/generated-report";
import { colors } from "@/lib/design-tokens/colors";

const EMPTY_REPORT_SKELETON: GeneratedSiteReport = {
  report: {
    meta: { title: "", reportType: "daily", summary: "", visitDate: null },
    weather: null,
    workers: null,
    materials: [],
    issues: [],
    nextSteps: [],
    sections: [],
  },
};

async function getFileSize(uri: string, fallback: number | undefined): Promise<number> {
  try {
    const info = await FileSystem.getInfoAsync(uri);
    if (info.exists && "size" in info && typeof info.size === "number") {
      return info.size;
    }
  } catch {
    // ignore — fall through to fallback
  }
  return fallback ?? 0;
}

export default function GenerateReportScreen() {
  const router = useRouter();
  const { projectId, reportId } = useLocalSearchParams<{ projectId: string; reportId?: string }>();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const notesScrollRef = useRef<ScrollView>(null);
  const reportScrollRef = useRef<ScrollView>(null);
  const pagerRef = useRef<ScrollView>(null);
  const { width: windowWidth } = useWindowDimensions();

  // Team members — used to show author names on voice notes.
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

  // Notes state — hydrated from the `report_notes` table for this draft.
  // `notesList` is the in-memory mirror used for rendering / sending to the
  // LLM; writes go through `useReportNotesMutations` so they persist and
  // sync. Voice transcripts are inserted in `onVoiceNoteSaved` (with the
  // file_id link), text notes via `addNote()`.
  const { data: noteRows } = useLocalReportNotes(reportId ?? null);
  const { create: createNoteMutation, remove: removeNoteMutation } =
    useReportNotesMutations();
  const [currentInput, setCurrentInput] = useState("");
  const [pendingVoiceTranscriptionIds, setPendingVoiceTranscriptionIds] =
    useState<ReadonlySet<string>>(() => new Set());
  const [optimisticVoiceTranscriptionsByFileId, setOptimisticVoiceTranscriptionsByFileId] =
    useState<ReadonlyMap<string, string>>(() => new Map());

  const notesWithBody = (noteRows ?? []).filter(
    (n) => typeof n.body === "string" && n.body.length > 0,
  );
  const notesList: NoteEntry[] = notesWithBody.map((n) => ({
    text: n.body!,
    addedAt: Date.parse(n.created_at) || Date.now(),
    source: n.kind === "voice" ? "voice" : "text",
  }));

  // Plain text array for the AI pipeline.
  const notesTextArray = toTextArray(notesList);

  // Map voice-note `file_id` → transcript body so `NoteTimeline` can show
  // the transcript beneath each voice-note card. Voice transcripts live in
  // `report_notes.body` (linked via `file_id`); the card itself just receives
  // the looked-up text.
  const voiceTranscriptionsByFileId = useMemo(() => {
    const transcriptions = new Map<string, string>(
      optimisticVoiceTranscriptionsByFileId,
    );
    for (const n of noteRows ?? []) {
      if (n.kind === "voice" && n.file_id && typeof n.body === "string") {
        transcriptions.set(n.file_id, n.body);
      }
    }
    return transcriptions;
  }, [noteRows, optimisticVoiceTranscriptionsByFileId]);

  // GC: drop optimistic entries once the real noteRows data contains them.
  useEffect(() => {
    if (!noteRows || optimisticVoiceTranscriptionsByFileId.size === 0) return;
    const dbFileIds = new Set(
      noteRows.filter((n) => n.kind === "voice" && n.file_id).map((n) => n.file_id!),
    );
    const stale = [...optimisticVoiceTranscriptionsByFileId.keys()].filter(
      (fid) => dbFileIds.has(fid),
    );
    if (stale.length > 0) {
      setOptimisticVoiceTranscriptionsByFileId((prev) => {
        const next = new Map(prev);
        for (const id of stale) next.delete(id);
        return next;
      });
    }
  }, [noteRows, optimisticVoiceTranscriptionsByFileId]);

  // Report generation — manual; user triggers via "Generate / Update report"
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

  const handleRegenerate = useCallback(() => {
    setActiveTab("report");
    regenerate();
  }, [regenerate]);

  // Debug-tab prompt extraction (system + user prompts come back from the
  // edge function on every successful generation; absent on errors).
  // Debug-tab prompt extraction. Prefer in-memory rawResponse from the
  // current session; fall back to the persisted lastGeneration when the
  // user just opened a draft and hasn't regenerated yet.
  const debugRawRequest = rawRequest ?? (lastGeneration?.request ?? null);
  const debugRawResponse = rawResponse ?? (lastGeneration?.response ?? null);
  const debugSystemPrompt =
    debugRawResponse && typeof debugRawResponse === "object" && "systemPrompt" in debugRawResponse
      ? String((debugRawResponse as { systemPrompt?: unknown }).systemPrompt ?? "")
      : (lastGeneration?.systemPrompt ?? "");
  const debugUserPrompt =
    debugRawResponse && typeof debugRawResponse === "object" && "userPrompt" in debugRawResponse
      ? String((debugRawResponse as { userPrompt?: unknown }).userPrompt ?? "")
      : (lastGeneration?.userPrompt ?? "");
  const debugCombinedPrompt = debugSystemPrompt || debugUserPrompt
    ? [
        debugSystemPrompt ? `# System\n\n${debugSystemPrompt}` : "",
        debugUserPrompt ? `# User\n\n${debugUserPrompt}` : "",
      ]
        .filter(Boolean)
        .join("\n\n---\n\n")
    : "";
  const { copy: copyDebug, isCopied: isDebugCopied } = useCopyToClipboard();

  // Collapsible state for debug sections
  const [debugCollapsed, setDebugCollapsed] = useState<Record<string, boolean>>({
    request: true,
    prompt: true,
    response: true,
    error: false,
  });
  const toggleDebug = (key: string) =>
    setDebugCollapsed((prev) => ({ ...prev, [key]: !prev[key] }));

  const handleVoiceNoteUploaded = useCallback(
    ({ metadata }: { metadata: FileMetadataRow }) => {
      setPendingVoiceTranscriptionIds((previous) => {
        const next = new Set(previous);
        next.add(metadata.id);
        return next;
      });
      setOptimisticVoiceTranscriptionsByFileId((previous) => {
        const next = new Map(previous);
        next.delete(metadata.id);
        return next;
      });
      queryClient.setQueryData<FileMetadataRow[]>(
        ["project-files", metadata.project_id, { category: null, excludeCategory: null }],
        (previous) => {
          const current = previous ?? [];
          const withoutDuplicate = current.filter((file) => file.id !== metadata.id);
          return [metadata, ...withoutDuplicate].sort(
            (a, b) => Date.parse(b.created_at) - Date.parse(a.created_at),
          );
        },
      );
      queryClient.invalidateQueries({ queryKey: ["project-files", metadata.project_id] });
      setTimeout(() => notesScrollRef.current?.scrollTo({ y: 0, animated: true }), 100);
    },
    [queryClient],
  );

  const handleVoiceNoteSaved = useCallback(
    ({ metadata, transcript }: { metadata: FileMetadataRow; transcript: string }) => {
      const trimmedTranscript = transcript.trim();
      setPendingVoiceTranscriptionIds((previous) => {
        const next = new Set(previous);
        next.delete(metadata.id);
        return next;
      });
      setOptimisticVoiceTranscriptionsByFileId((previous) => {
        const next = new Map(previous);
        if (trimmedTranscript.length > 0) {
          next.set(metadata.id, trimmedTranscript);
        } else {
          next.delete(metadata.id);
        }
        return next;
      });
      // Persist a `report_notes` row linking the voice file to this draft.
      // The transcript is the note body so the LLM sees it just like a typed
      // note. Skipped if transcription failed (empty transcript).
      if (reportId && projectId && trimmedTranscript.length > 0) {
        createNoteMutation.mutate({
          reportId,
          projectId,
          kind: "voice",
          body: trimmedTranscript,
          fileId: metadata.id,
        });
      }
      queryClient.invalidateQueries({ queryKey: ["project-files", metadata.project_id] });
    },
    [createNoteMutation, projectId, queryClient, reportId],
  );

  // Speech-to-text
  const {
    isRecording,
    amplitude,
    interimTranscript,
    error: speechError,
    start: startListening,
    stop: stopListening,
  } = useSpeechToText({
    onResult: () => {
      // Voice transcripts are persisted via `onVoiceNoteSaved` (with the
      // file_id link). This callback only scrolls so the new note is in view.
      setTimeout(() => notesScrollRef.current?.scrollTo({ y: 0, animated: true }), 100);
    },
    saveVoiceNote: user && projectId
      ? { projectId, uploadedBy: user.id }
      : undefined,
    onVoiceNoteUploaded: handleVoiceNoteUploaded,
    onVoiceNoteSaved: handleVoiceNoteSaved,
  });

  // Tab state
  const TAB_ORDER = ["notes", "report", "debug"] as const;
  type TabKey = (typeof TAB_ORDER)[number];
  const [activeTab, setActiveTab] = useState<TabKey>("report");

  // Sync the horizontal pager with `activeTab` whenever it changes (e.g. via
  // tab-bar tap or programmatic navigation). Swipe gestures update the state
  // through `onMomentumScrollEnd` below, which then re-runs this effect as a
  // no-op since the offset already matches.
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

  // Inline editing state
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editingContent, setEditingContent] = useState("");
  const [imagePreview, setImagePreview] = useState<{
    file: FileMetadataRow;
  } | null>(null);
  const imagePreviewExtras = useImagePreviewProps(imagePreview?.file ?? null);

  // ── Auto-save ──
  const [draftDeleteErrorMessage, setDraftDeleteErrorMessage] = useState<string | null>(null);
  const [isFinalizeConfirmVisible, setIsFinalizeConfirmVisible] = useState(false);
  const [isAttachmentSheetVisible, setIsAttachmentSheetVisible] = useState(false);
  const [noteDeleteIndex, setNoteDeleteIndex] = useState<number | null>(null);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const lastSavedRef = useRef("");
  const reportRef = useRef(report);
  reportRef.current = report;

  const { update: localUpdate, remove: localRemove } = useLocalReportMutations();
  const { data: draftData } = useLocalReport(reportId ?? null);
  const draftSeededRef = useRef(false);

  const doSave = useCallback(async () => {
    if (!reportId) return;
    const currentReport = reportRef.current;
    const key = JSON.stringify({ report: currentReport });
    if (key === lastSavedRef.current) return;

    // Notes are persisted directly to `report_notes` via
    // `useReportNotesMutations`; this save path only writes the generated
    // report payload + meta + last_generation snapshot back to the
    // `reports` row.
    const fields: Record<string, unknown> = {
      report_data: currentReport ?? {},
      confidence: currentReport ? getReportCompleteness(currentReport) : 0,
    };
    if (currentReport) {
      fields.title = currentReport.report.meta.title;
      fields.report_type = currentReport.report.meta.reportType;
      fields.visit_date = currentReport.report.meta.visitDate ?? null;
    }
    if (lastGeneration) {
      fields.last_generation = lastGeneration as unknown as Record<string, unknown>;
    }
    try {
      await localUpdate.mutateAsync({
        id: reportId,
        projectId,
        fields: fields as Parameters<typeof localUpdate.mutateAsync>[0]["fields"],
      });
      lastSavedRef.current = key;
    } catch {
      // swallow — debounced save retries on next change
    }
  }, [reportId, projectId, localUpdate, lastGeneration]);

  // Hydrate local state from the persisted draft once it loads. Subsequent
  // refetches (e.g. after a sync pull) are ignored so we never clobber the
  // user's in-progress edits — `doSave` is the single writer from here on.
  useEffect(() => {
    if (!reportId || draftSeededRef.current || !draftData) return;
    draftSeededRef.current = true;
    const rd = draftData.report_data;
    if (rd && typeof rd === "object" && Object.keys(rd).length > 0) {
      const parsed = normalizeGeneratedReportPayload(rd);
      if (parsed) {
        setReport(parsed);
        lastSavedRef.current = JSON.stringify({
          report: parsed,
        });
      }
    }
    // Hydrate the Debug tab's lastGeneration from the persisted column.
    const persistedLg = draftData.last_generation;
    if (persistedLg && typeof persistedLg === "object") {
      setLastGeneration(persistedLg as unknown as typeof lastGeneration);
    }
  }, [reportId, draftData, setReport, setLastGeneration]);

  // Auto-save with debounce
  useEffect(() => {
    if (!reportId) return;
    clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(doSave, 2000);
    return () => clearTimeout(saveTimeoutRef.current);
  }, [report, reportId, doSave]);

  // Flush save on app background
  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "background" || state === "inactive") {
        doSave();
      }
    });
    return () => sub.remove();
  }, [doSave]);

  const handleBack = useCallback(async () => {
    clearTimeout(saveTimeoutRef.current);
    await doSave();
    queryClient.invalidateQueries({ queryKey: ["reports", projectId] });
    router.back();
  }, [doSave, projectId, queryClient, router]);

  // File IDs explicitly linked to this report via report_notes.
  const linkedFileIds = useMemo(() => {
    const ids = new Set<string>();
    for (const n of noteRows ?? []) {
      if (n.file_id) ids.add(n.file_id);
    }
    return ids;
  }, [noteRows]);

  // File IDs claimed by *other* reports in this project — must be excluded
  // from this report's timeline to prevent cross-report file leakage.
  const { data: excludedFileIds } = useOtherReportFileIds(projectId, reportId);

  // Unified timeline: text notes + files merged chronologically. Use the
  // report_notes file_id linkage as the primary file filter; fall back to
  // the report's `created_at` for files not yet linked (e.g. fresh uploads).
  const { timeline, isLoading: timelineLoading } = useNoteTimeline({
    notes: notesList,
    projectId,
    reportCreatedAt: draftData?.created_at ?? null,
    linkedFileIds,
    excludedFileIds,
  });

  // Pulse animation for recording
  const pulseScale = useSharedValue(1);
  const pulseOpacity = useSharedValue(0.6);

  useEffect(() => {
    if (isRecording) {
      pulseScale.value = withRepeat(
        withTiming(1.5, { duration: 1000, easing: Easing.out(Easing.ease) }),
        -1,
        false
      );
      pulseOpacity.value = withRepeat(
        withTiming(0, { duration: 1000, easing: Easing.out(Easing.ease) }),
        -1,
        false
      );
    } else {
      pulseScale.value = 1;
      pulseOpacity.value = 0.6;
    }
  }, [isRecording]);

  const pulseStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pulseScale.value }],
    opacity: pulseOpacity.value,
  }));

  const addNote = () => {
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
    setTimeout(() => notesScrollRef.current?.scrollTo({ y: 0, animated: true }), 100);
  };

  const toggleRecording = () => {
    if (isRecording) {
      stopListening();
    } else {
      startListening();
    }
  };

  const startEditing = (index: number) => {
    setEditingIndex(index);
    setEditingContent(report!.report.sections[index].content);
  };

  const saveEdit = () => {
    if (editingIndex === null || !report) return;
    setReport((prev) =>
      prev
        ? {
            ...prev,
            report: {
              ...prev.report,
              sections: prev.report.sections.map((block, i) =>
                i === editingIndex
                  ? { ...block, content: editingContent }
                  : block
              ),
            },
          }
        : prev
    );
    setEditingIndex(null);
    setEditingContent("");
  };

  const completeness = report ? getReportCompleteness(report) : 0;

  const { mutate: finalizeReport, isPending: isFinalizing, error: finalizeError } = useMutation({
    mutationFn: async () => {
      if (!report || !reportId) throw new Error("No report to finalize.");
      clearTimeout(saveTimeoutRef.current);
      await localUpdate.mutateAsync({
        id: reportId,
        projectId,
        fields: {
          title: report.report.meta.title,
          report_type: report.report.meta.reportType,
          visit_date: report.report.meta.visitDate ?? null,
          report_data: report,
          confidence: completeness,
          status: "final",
        } as Parameters<typeof localUpdate.mutateAsync>[0]["fields"],
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: reportsKey(projectId) });
      setIsFinalizeConfirmVisible(false);
      router.replace(`/projects/${projectId}/reports/${reportId}`);
    },
  });

  const finalizeConfirmCopy = getFinalizeReportDialogCopy();

  const { mutate: deleteDraft, isPending: isDeletingDraft } = useMutation({
    mutationFn: async () => {
      if (!reportId) throw new Error("No draft report to delete.");
      clearTimeout(saveTimeoutRef.current);
      await localRemove.mutateAsync({ id: reportId, projectId });
    },
    onSuccess: () => {
      queryClient.removeQueries({ queryKey: reportKey(reportId) });
      queryClient.invalidateQueries({ queryKey: reportsKey(projectId) });
      const reportsHref = `/projects/${projectId}/reports`;

      if (router.canDismiss()) {
        router.dismissTo(reportsHref);
        return;
      }

      router.replace(reportsHref);
    },
    onError: (err) => {
      setDraftDeleteErrorMessage(
        err instanceof Error ? err.message : "Could not delete the draft report.",
      );
    },
  });

  const draftDeleteErrorDialog = draftDeleteErrorMessage
    ? getActionErrorDialogCopy({
        title: "Delete Failed",
        fallbackMessage: "Could not delete the draft report.",
        message: draftDeleteErrorMessage,
      })
    : null;

  // Upload helper used by the draft actions menu (Add document / Add photo).
  const fileUpload = useFileUpload();
  const handleMenuPick = useCallback(
    async (category: Exclude<FileCategory, "avatar" | "voice-note">) => {
      if (!projectId) return;
      const result = await pickProjectFile(category);
      if (result.kind !== "picked") return;
      fileUpload.mutate({ projectId, category, ...result.file });
    },
    [projectId, fileUpload],
  );

  const handleCameraCapture = useCallback(async () => {
    if (!projectId) return;
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) return;
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      // We re-compress in `preprocessImageForUpload`, so capture at full
      // quality and let the helper produce both original + thumbnail.
      quality: 1,
    });
    if (result.canceled || !result.assets[0]) return;
    const asset = result.assets[0];

    const preprocessed = await preprocessImageForUpload(
      asset.uri,
      asset.width ?? 0,
      asset.height ?? 0,
    );
    const sizeBytes = await getFileSize(preprocessed.originalUri, asset.fileSize);

    fileUpload.mutate({
      projectId,
      category: "image" as const,
      fileUri: preprocessed.originalUri,
      filename: asset.fileName ?? `photo-${Date.now()}.jpg`,
      mimeType: preprocessed.mimeType,
      sizeBytes,
      width: preprocessed.width,
      height: preprocessed.height,
      thumbnailUri: preprocessed.thumbnailUri,
      thumbnailMimeType: preprocessed.mimeType,
      blurhash: preprocessed.blurhash,
    });
  }, [projectId, fileUpload]);

  const draftMenuActions = reportId
    ? [
        {
          key: "add-document",
          label: "Add document",
          icon: <FileText size={16} color={colors.foreground} />,
          onPress: () => void handleMenuPick("document"),
          disabled: fileUpload.isPending,
          testID: "btn-menu-add-document",
        },
        {
          key: "add-photo",
          label: "Add photo",
          icon: <ImageIcon size={16} color={colors.foreground} />,
          onPress: () => void handleMenuPick("image"),
          disabled: fileUpload.isPending,
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

  return (
    <SafeAreaView className="flex-1 bg-background">
      <KeyboardAvoidingView
        behavior="padding"
        className="flex-1"
        keyboardVerticalOffset={0}
      >
        {/* Header */}
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

        {/* Tab bar */}
        <View className="mx-5 mt-3 mb-2 flex-row rounded-lg border border-border bg-card p-1">
          <Pressable
            testID="btn-tab-notes"
            onPress={() => { Keyboard.dismiss(); setActiveTab("notes"); }}
            className={`flex-1 flex-row items-center justify-center gap-2 rounded-md py-3 ${
              activeTab === "notes" ? "bg-foreground" : ""
            }`}
          >
            <MessageSquare
              size={16}
              color={activeTab === "notes" ? colors.primary.foreground : colors.muted.foreground}
              style={{ marginTop: 1 }}
            />
            <Text
              className={`text-sm font-semibold ${
                activeTab === "notes" ? "text-primary-foreground" : "text-muted-foreground"
              }`}
            >
              {getGenerateReportTabLabel("notes", notesList.length)}
            </Text>
          </Pressable>
          <Pressable
            testID="btn-tab-report"
            onPress={() => { Keyboard.dismiss(); setActiveTab("report"); }}
            className={`flex-1 flex-row items-center justify-center gap-2 rounded-md py-3 ${
              activeTab === "report" ? "bg-foreground" : ""
            }`}
          >
            <FileText
              size={16}
              color={activeTab === "report" ? colors.primary.foreground : colors.muted.foreground}
              style={{ marginTop: 1 }}
            />
            <Text
              className={`text-sm font-semibold ${
                activeTab === "report" ? "text-primary-foreground" : "text-muted-foreground"
              }`}
            >
              {getGenerateReportTabLabel("report", notesList.length)}
            </Text>
            {isUpdating && (
              <ActivityIndicator size="small" color={activeTab === "report" ? colors.primary.foreground : colors.foreground} />
            )}
          </Pressable>
          <Pressable
            onPress={() => { Keyboard.dismiss(); setActiveTab("debug"); }}
            className={`flex-1 flex-row items-center justify-center gap-2 rounded-md py-3 ${
              activeTab === "debug" ? "bg-foreground" : ""
            }`}
          >
            <Code
              size={16}
              color={activeTab === "debug" ? colors.primary.foreground : colors.muted.foreground}
              style={{ marginTop: 1 }}
            />
            <Text
              className={`text-sm font-semibold ${
                activeTab === "debug" ? "text-primary-foreground" : "text-muted-foreground"
              }`}
            >
              Debug
            </Text>
          </Pressable>
        </View>

        {/* Horizontal pager — swipe between tabs */}
        <ScrollView
          ref={pagerRef}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          onMomentumScrollEnd={handlePagerMomentumEnd}
          contentOffset={{ x: windowWidth, y: 0 }}
          className="flex-1"
          // Disable the parent's horizontal pan from intercepting taps inside
          // children (e.g. note rows, buttons) on Android.
          nestedScrollEnabled
        >
        {/* ── Notes Tab ── */}
        <View style={{ width: windowWidth }} className="flex-1">
          {/* Generate / Update CTA — fixed above the scroll */}
          {timeline.length > 0 && (
            <Animated.View entering={FadeIn} className="px-5 pb-2 pt-1">
              {(() => {
                const hasReport = report !== null;
                const upToDate = hasReport && notesSinceLastGeneration === 0;
                const label = isUpdating
                  ? "Generating…"
                  : !hasReport
                    ? "Generate report"
                    : upToDate
                      ? "Report up to date"
                      : `Update report (${notesSinceLastGeneration} new note${notesSinceLastGeneration === 1 ? "" : "s"})`;
                return (
                  <Button
                    testID="btn-generate-update-report"
                    variant="hero"
                    size="xl"
                    className="w-full"
                    onPress={handleRegenerate}
                    disabled={isUpdating || upToDate}
                  >
                    <View className="flex-row items-center gap-1.5">
                      <Sparkles size={16} color={colors.primary.foreground} />
                      <Text className="text-base font-semibold text-primary-foreground">
                        {label}
                      </Text>
                    </View>
                  </Button>
                );
              })()}
            </Animated.View>
          )}
          <ScrollView
            ref={notesScrollRef}
            className="flex-1 px-5"
            contentContainerStyle={{ paddingBottom: 100 }}
            keyboardShouldPersistTaps="handled"
          >
            {/* Unified chronological timeline: text notes + voice notes + files */}
            <NoteTimeline
              timeline={timeline}
              isLoading={timelineLoading}
              transcriptionsByFileId={voiceTranscriptionsByFileId}
              transcribingFileIds={pendingVoiceTranscriptionIds}
              memberNames={memberNames}
              onRemoveNote={(i) => {
                setNoteDeleteIndex(i);
              }}
              onOpenFile={(file) => {
                if (file.mime_type.startsWith("image/")) {
                  setImagePreview({ file });
                }
              }}
            />

            {timeline.length === 0 && !timelineLoading && (
              <EmptyState
                icon={<Mic size={28} color={colors.muted.foreground} />}
                title="Start capturing site notes"
                description="Record short voice updates or type notes below. The report will build itself as you go."
              />
            )}
          </ScrollView>
        </View>

        {/* ── Report Tab ── */}
        <View style={{ width: windowWidth }} className="flex-1">
          <ScrollView
            ref={reportScrollRef}
            className="flex-1 px-5"
            contentContainerStyle={{ paddingBottom: 100 }}
            keyboardShouldPersistTaps="handled"
          >
            {/* Error banner — render before any skeleton/content so the
                regeneration failure is the first thing the user sees. */}
            {error && (
              <Animated.View entering={FadeIn}>
                <InlineNotice tone="danger" className="mb-3">
                  {error}
                </InlineNotice>
                <View className="mb-3">
                  <Button
                    variant="secondary"
                    size="sm"
                    onPress={handleRegenerate}
                  >
                    <View className="flex-row items-center gap-1.5">
                      <RotateCcw size={14} color={colors.foreground} />
                      <Text className="text-base font-semibold text-foreground">
                        Retry
                      </Text>
                    </View>
                  </Button>
                </View>
              </Animated.View>
            )}

            {/* No report yet — show skeleton of missing fields */}
            {!report && !isUpdating && (
              <View className="gap-3">
                <CompletenessCard report={EMPTY_REPORT_SKELETON} />
              </View>
            )}

            {/* Generating shimmer */}
            {isUpdating && !report && (
              <View className="gap-3">
                <InlineNotice tone="info">Generating your report from the notes collected so far...</InlineNotice>
                {[1, 2, 3, 4].map((i) => (
                  <Animated.View
                    key={i}
                    entering={FadeIn}
                    className="h-20 rounded-lg bg-secondary"
                  />
                ))}
              </View>
            )}

            {/* Live report */}
            {report && (
              <View className="gap-3">
                {/* Updating indicator */}
                {isUpdating && (
                  <Animated.View entering={FadeIn}>
                    <InlineNotice tone="info">
                      Updating the draft with your newest notes...
                    </InlineNotice>
                  </Animated.View>
                )}

                <CompletenessCard report={report} />

                <ReportView
                  report={report}
                  editable
                  editingIndex={editingIndex}
                  editingContent={editingContent}
                  onEditStart={startEditing}
                  onEditChange={setEditingContent}
                  onEditSave={saveEdit}
                />

                {/* Actions */}
                <Animated.View entering={FadeIn} className="gap-2">
                  {finalizeError && (
                    <InlineNotice tone="danger">
                      {finalizeError instanceof Error ? finalizeError.message : "Failed to finalize report."}
                    </InlineNotice>
                  )}
                  <Button
                    testID="btn-finalize-report"
                    variant="hero"
                    size="xl"
                    className="mt-4 w-full"
                    onPress={() => setIsFinalizeConfirmVisible(true)}
                    disabled={isFinalizing || !report}
                  >
                    {isFinalizing ? "Finalizing..." : "Finalize Report"}
                  </Button>
                  <Button
                    variant="secondary"
                    size="default"
                    className="w-full"
                    onPress={handleRegenerate}
                    disabled={isFinalizing || isUpdating}
                  >
                    <View className="flex-row items-center gap-1.5">
                      <RotateCcw size={14} color={colors.foreground} />
                      <Text className="text-base font-semibold text-foreground">
                        Regenerate
                      </Text>
                    </View>
                  </Button>
                </Animated.View>
              </View>
            )}
          </ScrollView>
        </View>

        {/* ── Debug Tab ── */}
        <View style={{ width: windowWidth }} className="flex-1">
          <ScrollView
            className="flex-1 px-5"
            contentContainerStyle={{ paddingBottom: 100 }}
          >
            <View className="gap-4">
              <View className="flex-row items-center gap-2 border border-border bg-card p-3">
                <Text className="text-sm font-bold text-foreground">Status:</Text>
                <Text
                  className="text-sm text-foreground"
                  style={{ fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace" }}
                >
                  {mutationStatus}
                </Text>
                <Text className="text-sm font-bold text-foreground">Notes:</Text>
                <Text
                  className="text-sm text-foreground"
                  style={{ fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace" }}
                >
                  {notesList.length}
                </Text>
              </View>
              <View>
                <Pressable
                  onPress={() => toggleDebug("request")}
                  className="mb-1 flex-row items-center gap-1"
                  accessibilityLabel="Toggle request body"
                >
                  {debugCollapsed.request ? (
                    <ChevronRight size={16} color={colors.foreground} />
                  ) : (
                    <ChevronDown size={16} color={colors.foreground} />
                  )}
                  <Text className="text-lg font-bold text-foreground">Request Body</Text>
                </Pressable>
                {!debugCollapsed.request && (
                  <View className="border border-border bg-card p-3">
                    <ScrollView horizontal showsHorizontalScrollIndicator>
                      <Text
                        className="text-xs text-foreground"
                        style={{ fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace" }}
                      >
                        {debugRawRequest ? JSON.stringify(debugRawRequest, null, 2) : "No request yet — tap Generate / Update report on the Notes tab."}
                      </Text>
                    </ScrollView>
                  </View>
                )}
              </View>
              <View>
                <View className="mb-1 flex-row items-center justify-between">
                  <Pressable
                    onPress={() => toggleDebug("prompt")}
                    className="flex-row items-center gap-1"
                    accessibilityLabel="Toggle prompt"
                  >
                    {debugCollapsed.prompt ? (
                      <ChevronRight size={16} color={colors.foreground} />
                    ) : (
                      <ChevronDown size={16} color={colors.foreground} />
                    )}
                    <Text className="text-lg font-bold text-foreground">Prompt</Text>
                  </Pressable>
                  {(debugSystemPrompt || debugUserPrompt) && (
                    <View className="flex-row gap-2">
                      <Pressable
                        onPress={() =>
                          copyDebug(debugSystemPrompt, {
                            key: "system",
                            toast: "System prompt copied",
                          })
                        }
                        disabled={!debugSystemPrompt}
                        className="flex-row items-center gap-1 border border-border bg-card px-2 py-1"
                        accessibilityLabel="Copy system prompt"
                      >
                        {isDebugCopied("system") ? (
                          <Check size={12} color={colors.success.DEFAULT} />
                        ) : (
                          <Copy size={12} color={colors.muted.foreground} />
                        )}
                        <Text className="text-xs text-foreground">System</Text>
                      </Pressable>
                      <Pressable
                        onPress={() =>
                          copyDebug(debugUserPrompt, {
                            key: "user",
                            toast: "User prompt copied",
                          })
                        }
                        disabled={!debugUserPrompt}
                        className="flex-row items-center gap-1 border border-border bg-card px-2 py-1"
                        accessibilityLabel="Copy user prompt"
                      >
                        {isDebugCopied("user") ? (
                          <Check size={12} color={colors.success.DEFAULT} />
                        ) : (
                          <Copy size={12} color={colors.muted.foreground} />
                        )}
                        <Text className="text-xs text-foreground">User</Text>
                      </Pressable>
                      <Pressable
                        onPress={() =>
                          copyDebug(debugCombinedPrompt, {
                            key: "combined",
                            toast: "Full prompt copied",
                          })
                        }
                        disabled={!debugCombinedPrompt}
                        className="flex-row items-center gap-1 border border-border bg-card px-2 py-1"
                        accessibilityLabel="Copy full prompt"
                      >
                        {isDebugCopied("combined") ? (
                          <Check size={12} color={colors.success.DEFAULT} />
                        ) : (
                          <Copy size={12} color={colors.muted.foreground} />
                        )}
                        <Text className="text-xs text-foreground">Full</Text>
                      </Pressable>
                    </View>
                  )}
                </View>
                {!debugCollapsed.prompt && (
                  <View className="border border-border bg-card p-3">
                    {debugSystemPrompt || debugUserPrompt ? (
                      <ScrollView horizontal showsHorizontalScrollIndicator>
                        <Text
                          className="text-xs text-foreground"
                          style={{ fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace" }}
                        >
                          {debugCombinedPrompt}
                        </Text>
                      </ScrollView>
                    ) : (
                      <Text className="text-xs text-muted-foreground">
                        No prompt yet — generate a report to capture it.
                      </Text>
                    )}
                  </View>
                )}
              </View>
              <View>
                <Pressable
                  onPress={() => toggleDebug("response")}
                  className="mb-1 flex-row items-center gap-1"
                  accessibilityLabel="Toggle LLM response"
                >
                  {debugCollapsed.response ? (
                    <ChevronRight size={16} color={colors.foreground} />
                  ) : (
                    <ChevronDown size={16} color={colors.foreground} />
                  )}
                  <Text className="text-lg font-bold text-foreground">LLM Response</Text>
                </Pressable>
                {!debugCollapsed.response && (
                  <View className="border border-border bg-card p-3">
                    <ScrollView horizontal showsHorizontalScrollIndicator>
                      <Text
                        className="text-xs text-foreground"
                        style={{ fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace" }}
                      >
                        {debugRawResponse ? JSON.stringify(debugRawResponse, null, 2) : ""}
                      </Text>
                    </ScrollView>
                  </View>
                )}
              </View>
              {error && (
                <View>
                  <Pressable
                    onPress={() => toggleDebug("error")}
                    className="mb-1 flex-row items-center gap-1"
                    accessibilityLabel="Toggle error"
                  >
                    {debugCollapsed.error ? (
                      <ChevronRight size={16} color={colors.danger.DEFAULT} />
                    ) : (
                      <ChevronDown size={16} color={colors.danger.DEFAULT} />
                    )}
                    <Text className="text-lg font-bold text-destructive">Error</Text>
                  </Pressable>
                  {!debugCollapsed.error && (
                    <View className="border border-destructive bg-card p-3">
                      <ScrollView horizontal showsHorizontalScrollIndicator>
                        <Text
                          className="text-xs text-destructive"
                          style={{ fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace" }}
                        >
                          {error}
                        </Text>
                      </ScrollView>
                    </View>
                  )}
                </View>
              )}
            </View>
          </ScrollView>
        </View>
        </ScrollView>

        {/* Fixed bottom input bar — always visible */}
        <View className="border-t border-border bg-background px-5 py-3">
          {speechError && (
            <InlineNotice tone="danger" className="mb-2">{speechError}</InlineNotice>
          )}
          <View className="flex-row items-stretch gap-3">
            <View
              testID={isRecording ? "input-note-recording" : "input-note-container"}
              accessible={isRecording}
              accessibilityRole={isRecording ? "text" : undefined}
              accessibilityLabel={isRecording
                ? interimTranscript
                  ? `Recording voice note. ${interimTranscript}`
                  : "Recording voice note. Listening."
                : undefined}
              accessibilityHint={isRecording ? "Tap the stop button to finish recording." : undefined}
              className={`min-h-[68px] flex-1 rounded-xl border px-4 py-3 ${
                isRecording
                  ? "border-warning-border bg-warning-soft"
                  : "border-border bg-card"
              }`}
            >
              {isRecording && (
                <>
                  <Text className="mb-2 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                    Listening
                  </Text>
                  <LiveWaveform amplitude={amplitude} />
                  {!!interimTranscript && (
                    <Text className="mt-2 text-sm text-muted-foreground">
                      {interimTranscript}
                    </Text>
                  )}
                </>
              )}

              {!isRecording && (
                <View className="flex-row items-start gap-2">
                  <Pressable
                    onPress={() => setIsAttachmentSheetVisible(true)}
                    hitSlop={8}
                    testID="btn-attachment"
                    accessibilityRole="button"
                    accessibilityLabel="Add attachment"
                    className="mt-1"
                  >
                    <Paperclip size={20} color={colors.muted.foreground} />
                  </Pressable>
                  <TextInput
                    testID="input-note"
                    value={currentInput}
                    onChangeText={setCurrentInput}
                    placeholder="Type a quick site note..."
                    placeholderTextColor={colors.muted.foreground}
                    className="min-h-[62px] flex-1 text-base text-foreground"
                    multiline
                    textAlignVertical="top"
                    returnKeyType="default"
                    blurOnSubmit={false}
                  />
                </View>
              )}
            </View>

            {currentInput.trim() ? (
              <Button
                testID="btn-add-note"
                size="lg"
                className="min-h-[68px] min-w-[84px] rounded-xl px-4"
                onPress={addNote}
              >
                <View className="items-center gap-1">
                  <Plus size={18} color={colors.primary.foreground} />
                  <Text className="text-xs font-semibold text-primary-foreground">
                    Add
                  </Text>
                </View>
              </Button>
            ) : (
              <>
                <Pressable
                  onPress={() => void handleCameraCapture()}
                  disabled={isRecording}
                  testID="btn-camera-capture"
                  accessibilityRole="button"
                  accessibilityLabel="Take photo"
                >
                  <View className="min-h-[68px] min-w-[68px] items-center justify-center rounded-xl bg-foreground px-3">
                    <View className="items-center gap-1">
                      <Camera size={24} color={colors.primary.foreground} />
                      <Text className="text-xs font-semibold text-primary-foreground">
                        Photo
                      </Text>
                    </View>
                  </View>
                </Pressable>
                <Pressable
                  onPress={toggleRecording}
                  className="relative"
                  testID={isRecording ? "btn-record-stop" : "btn-record-start"}
                  accessibilityRole="button"
                  accessibilityLabel={isRecording ? "Stop recording" : "Start voice recording"}
                >
                  {isRecording && (
                    <Animated.View
                      style={[
                        {
                          position: "absolute",
                          top: 0,
                          left: 0,
                          right: 0,
                          bottom: 0,
                          borderRadius: 12,
                          backgroundColor: colors.primary.alpha30,
                        },
                        pulseStyle,
                      ]}
                    />
                  )}
                  <View
                    className={`min-h-[68px] min-w-[68px] items-center justify-center rounded-xl px-3 ${
                      isRecording
                        ? "bg-primary"
                        : "bg-foreground"
                    }`}
                  >
                    <View className="items-center gap-1">
                      {isRecording ? (
                        <MicOff size={24} color={colors.primary.foreground} />
                      ) : (
                        <Mic size={24} color={colors.primary.foreground} />
                      )}
                      <Text className="text-xs font-semibold text-primary-foreground">
                        {isRecording ? "Stop" : "Voice"}
                      </Text>
                    </View>
                  </View>
                </Pressable>
              </>
            )}
          </View>
        </View>

        <AppDialogSheet
          visible={isFinalizeConfirmVisible}
          title={finalizeConfirmCopy.title}
          message={finalizeConfirmCopy.message}
          noticeTone={finalizeConfirmCopy.tone}
          noticeTitle={finalizeConfirmCopy.noticeTitle}
          canDismiss={!isFinalizing}
          onClose={() => {
            if (!isFinalizing) setIsFinalizeConfirmVisible(false);
          }}
          actions={[
            {
              label: isFinalizing ? "Finalizing..." : finalizeConfirmCopy.confirmLabel,
              variant: finalizeConfirmCopy.confirmVariant,
              onPress: () => finalizeReport(),
              disabled: isFinalizing || !report,
              accessibilityLabel: "Confirm finalize report",
            },
            {
              label: finalizeConfirmCopy.cancelLabel ?? "Cancel",
              variant: "quiet",
              onPress: () => setIsFinalizeConfirmVisible(false),
              disabled: isFinalizing,
              accessibilityLabel: "Cancel finalize report",
            },
          ]}
        />

        <AppDialogSheet
          visible={noteDeleteIndex !== null}
          title={getDeleteNoteDialogCopy().title}
          message={getDeleteNoteDialogCopy().message}
          noticeTone={getDeleteNoteDialogCopy().tone}
          noticeTitle={getDeleteNoteDialogCopy().noticeTitle}
          onClose={() => setNoteDeleteIndex(null)}
          actions={[
            {
              label: getDeleteNoteDialogCopy().confirmLabel,
              variant: getDeleteNoteDialogCopy().confirmVariant,
              onPress: () => {
                if (noteDeleteIndex !== null) {
                  const target = notesWithBody[noteDeleteIndex];
                  if (target && reportId) {
                    removeNoteMutation.mutate({
                      id: target.id,
                      reportId,
                    });
                  }
                }
                setNoteDeleteIndex(null);
              },
              accessibilityLabel: "Confirm delete note",
              align: "start",
            },
            {
              label: getDeleteNoteDialogCopy().cancelLabel ?? "Cancel",
              variant: "quiet",
              onPress: () => setNoteDeleteIndex(null),
              accessibilityLabel: "Cancel deleting note",
            },
          ]}
        />

        <AppDialogSheet
          visible={draftDeleteErrorDialog !== null}
          title={draftDeleteErrorDialog?.title ?? "Delete Failed"}
          message={draftDeleteErrorDialog?.message ?? ""}
          noticeTone={draftDeleteErrorDialog?.tone ?? "danger"}
          noticeTitle={draftDeleteErrorDialog?.noticeTitle}
          onClose={() => setDraftDeleteErrorMessage(null)}
          actions={
            draftDeleteErrorDialog
              ? [
                  {
                    label: draftDeleteErrorDialog.confirmLabel,
                    variant: draftDeleteErrorDialog.confirmVariant,
                    onPress: () => setDraftDeleteErrorMessage(null),
                    accessibilityLabel: "Dismiss draft delete error",
                  },
                ]
              : []
          }
        />

        <ImagePreviewModal
          visible={imagePreview !== null}
          title={imagePreview?.file.filename}
          onClose={() => setImagePreview(null)}
          {...imagePreviewExtras}
        />

        <AppDialogSheet
          visible={isAttachmentSheetVisible}
          title="Add attachment"
          onClose={() => setIsAttachmentSheetVisible(false)}
          actions={[
            {
              label: "Document",
              variant: "secondary",
              onPress: () => {
                setIsAttachmentSheetVisible(false);
                void handleMenuPick("document");
              },
              accessibilityLabel: "Pick a document",
            },
            {
              label: "Photo Library",
              variant: "secondary",
              onPress: () => {
                setIsAttachmentSheetVisible(false);
                void handleMenuPick("image");
              },
              accessibilityLabel: "Pick a photo from library",
            },
            {
              label: "Camera",
              variant: "secondary",
              onPress: () => {
                setIsAttachmentSheetVisible(false);
                void handleCameraCapture();
              },
              accessibilityLabel: "Take a photo with the camera",
            },
            {
              label: "Cancel",
              variant: "quiet",
              onPress: () => setIsAttachmentSheetVisible(false),
              accessibilityLabel: "Cancel attachment picker",
            },
          ]}
        />
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
