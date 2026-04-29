import { useState, useEffect, useRef, useCallback } from "react";
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
  MessageSquare,
  Code,
  Copy,
  Check,
  ChevronDown,
  ChevronRight,
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
import { useMutation, useQueryClient } from "@tanstack/react-query";
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
import { FilePickerButton } from "@/components/files/FilePickerButton";
import { ImagePreviewModal } from "@/components/files/ImagePreviewModal";
import { NoteTimeline } from "@/components/notes/NoteTimeline";
import { useNoteTimeline } from "@/hooks/useNoteTimeline";
import { type NoteEntry, toTextArray, fromTextArray } from "@/lib/note-entry";
import { type FileMetadataRow } from "@/lib/file-upload";
import { getActionErrorDialogCopy, getFinalizeReportDialogCopy } from "@/lib/app-dialog-copy";
import { getGenerateReportTabLabel } from "@/lib/generate-report-ui";
import { getReportCompleteness } from "@/lib/report-helpers";
import {
  useLocalReport,
  useLocalReportMutations,
  reportKey,
  reportsKey,
} from "@/hooks/useLocalReports";
import {
  normalizeGeneratedReportPayload,
  type GeneratedSiteReport,
} from "@/lib/generated-report";

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

export default function GenerateReportScreen() {
  const router = useRouter();
  const { projectId, reportId } = useLocalSearchParams<{ projectId: string; reportId?: string }>();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const notesScrollRef = useRef<ScrollView>(null);
  const reportScrollRef = useRef<ScrollView>(null);
  const pagerRef = useRef<ScrollView>(null);
  const { width: windowWidth } = useWindowDimensions();

  // Notes state
  const [notesList, setNotesList] = useState<NoteEntry[]>([]);
  const [currentInput, setCurrentInput] = useState("");

  // Plain text array for the AI pipeline + DB persistence
  const notesTextArray = toTextArray(notesList);

  // Report generation — declared first so bumpNotesVersion is available to the STT callback
  const {
    report,
    isUpdating,
    error,
    bumpNotesVersion,
    setReport,
    handleFullRegenerate,
    rawRequest,
    rawResponse,
    mutationStatus,
    setLastProcessedCount,
  } = useReportGeneration(notesTextArray, projectId);

  // Debug-tab prompt extraction (system + user prompts come back from the
  // edge function on every successful generation; absent on errors).
  const debugSystemPrompt =
    rawResponse && typeof rawResponse === "object" && "systemPrompt" in rawResponse
      ? String((rawResponse as { systemPrompt?: unknown }).systemPrompt ?? "")
      : "";
  const debugUserPrompt =
    rawResponse && typeof rawResponse === "object" && "userPrompt" in rawResponse
      ? String((rawResponse as { userPrompt?: unknown }).userPrompt ?? "")
      : "";
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

  const handleVoiceNoteSaved = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ["project-files", projectId] });
  }, [projectId, queryClient]);

  // Speech-to-text
  const {
    isRecording,
    isTranscribing,
    amplitude,
    interimTranscript,
    error: speechError,
    start: startListening,
    stop: stopListening,
  } = useSpeechToText({
    onResult: (transcript) => {
      setNotesList((prev) => [...prev, { text: transcript, addedAt: Date.now(), source: "voice" }]);
      bumpNotesVersion();
      setTimeout(() => notesScrollRef.current?.scrollTo({ y: 0, animated: true }), 100);
    },
    saveVoiceNote: user && projectId
      ? { projectId, uploadedBy: user.id }
      : undefined,
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
  const [imagePreview, setImagePreview] = useState<{ uri: string; title: string } | null>(null);

  // ── Auto-save ──
  const [draftDeleteErrorMessage, setDraftDeleteErrorMessage] = useState<string | null>(null);
  const [isFinalizeConfirmVisible, setIsFinalizeConfirmVisible] = useState(false);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const lastSavedRef = useRef("");
  const notesRef = useRef(notesList);
  const reportRef = useRef(report);
  notesRef.current = notesList;
  reportRef.current = report;

  const { update: localUpdate, remove: localRemove } = useLocalReportMutations();
  const { data: draftData } = useLocalReport(reportId ?? null);
  const draftSeededRef = useRef(false);

  const doSave = useCallback(async () => {
    if (!reportId) return;
    const currentNotes = notesRef.current;
    const currentReport = reportRef.current;
    const key = JSON.stringify({ notes: currentNotes, report: currentReport });
    if (key === lastSavedRef.current) return;

    const fields: Record<string, unknown> = {
      notes: toTextArray(currentNotes),
      report_data: currentReport ?? {},
      confidence: currentReport ? getReportCompleteness(currentReport) : 0,
    };
    if (currentReport) {
      fields.title = currentReport.report.meta.title;
      fields.report_type = currentReport.report.meta.reportType;
      fields.visit_date = currentReport.report.meta.visitDate ?? null;
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
  }, [reportId, projectId, localUpdate]);

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
          notes: [],
          report: parsed,
        });
      }
    }
  }, [reportId, draftData, setReport, setLastProcessedCount, bumpNotesVersion]);

  // Auto-save with debounce
  useEffect(() => {
    if (!reportId) return;
    clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(doSave, 2000);
    return () => clearTimeout(saveTimeoutRef.current);
  }, [notesList, report, reportId, doSave]);

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

  // Unified timeline: text notes + files merged chronologically
  const { timeline, isLoading: timelineLoading } = useNoteTimeline({
    notes: notesList,
    projectId,
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
    setNotesList((prev) => [...prev, { text: trimmed, addedAt: Date.now() }]);
    setCurrentInput("");
    bumpNotesVersion();
    setTimeout(() => notesScrollRef.current?.scrollTo({ y: 0, animated: true }), 100);
  };

  const toggleRecording = () => {
    if (isTranscribing) return;
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
          notes: notesTextArray,
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
              color={activeTab === "notes" ? "#f8f6f1" : "#5c5c6e"}
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
              color={activeTab === "report" ? "#f8f6f1" : "#5c5c6e"}
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
              <ActivityIndicator size="small" color={activeTab === "report" ? "#f8f6f1" : "#1a1a2e"} />
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
              color={activeTab === "debug" ? "#f8f6f1" : "#5c5c6e"}
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
          <ScrollView
            ref={notesScrollRef}
            className="flex-1 px-5"
            contentContainerStyle={{ paddingBottom: 100 }}
            keyboardShouldPersistTaps="handled"
          >
            {projectId ? (
              <View className="mb-3 gap-3">
                <View className="flex-row gap-2">
                  <View className="flex-1">
                    <FilePickerButton
                      projectId={projectId}
                      category="document"
                      label="Add document"
                    />
                  </View>
                  <View className="flex-1">
                    <FilePickerButton
                      projectId={projectId}
                      category="image"
                      label="Add photo"
                    />
                  </View>
                </View>
              </View>
            ) : null}

            {/* Unified chronological timeline: text notes + voice notes + files */}
            <NoteTimeline
              timeline={timeline}
              isLoading={timelineLoading}
              onRemoveNote={(i) => setNotesList((prev) => prev.filter((_, idx) => idx !== i))}
              onOpenFile={(url, file) => {
                if (file.mime_type.startsWith("image/")) {
                  setImagePreview({ uri: url, title: file.filename });
                }
              }}
            />

            {timeline.length === 0 && !timelineLoading && (
              <EmptyState
                icon={<Mic size={28} color="#5c5c6e" />}
                title="Start capturing site notes"
                description="Record short voice updates or type notes below. The report will build itself as you go."
              />
            )}

            {/* Hint to check report */}
            {report && timeline.length > 0 && (
              <Animated.View entering={FadeIn}>
                <Pressable
                  onPress={() => setActiveTab("report")}
                  className="mt-2 flex-row items-center justify-center gap-2 rounded-lg border border-primary bg-surface-emphasis p-3"
                >
                  <Sparkles size={16} color="#1a1a2e" />
                  <Text className="text-base font-medium text-foreground">
                    Report updated — tap to review ({completeness}% complete)
                  </Text>
                </Pressable>
              </Animated.View>
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
                    onPress={handleFullRegenerate}
                  >
                    <View className="flex-row items-center gap-1.5">
                      <RotateCcw size={14} color="#1a1a2e" />
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
                    onPress={handleFullRegenerate}
                    disabled={isFinalizing}
                  >
                    <View className="flex-row items-center gap-1.5">
                      <RotateCcw size={14} color="#1a1a2e" />
                      <Text className="text-base font-semibold text-foreground">
                        Rebuild from Notes
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
                    <ChevronRight size={16} color="#1a1a2e" />
                  ) : (
                    <ChevronDown size={16} color="#1a1a2e" />
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
                        {rawRequest ? JSON.stringify(rawRequest, null, 2) : "No request yet — add a note and wait ~2s"}
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
                      <ChevronRight size={16} color="#1a1a2e" />
                    ) : (
                      <ChevronDown size={16} color="#1a1a2e" />
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
                          <Check size={12} color="#16a34a" />
                        ) : (
                          <Copy size={12} color="#64748b" />
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
                          <Check size={12} color="#16a34a" />
                        ) : (
                          <Copy size={12} color="#64748b" />
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
                          <Check size={12} color="#16a34a" />
                        ) : (
                          <Copy size={12} color="#64748b" />
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
                    <ChevronRight size={16} color="#1a1a2e" />
                  ) : (
                    <ChevronDown size={16} color="#1a1a2e" />
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
                        {rawResponse ? JSON.stringify(rawResponse, null, 2) : ""}
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
                      <ChevronRight size={16} color="#dc2626" />
                    ) : (
                      <ChevronDown size={16} color="#dc2626" />
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
              testID={
                isRecording
                  ? "input-note-recording"
                  : isTranscribing
                    ? "input-note-transcribing"
                    : "input-note-container"
              }
              accessible={isRecording || isTranscribing}
              accessibilityRole={isRecording || isTranscribing ? "text" : undefined}
              accessibilityLabel={isRecording
                ? interimTranscript
                  ? `Recording voice note. ${interimTranscript}`
                  : "Recording voice note. Listening."
                : isTranscribing
                  ? "Transcribing voice note. Please wait."
                  : undefined}
              accessibilityHint={isRecording ? "Tap the stop button to finish recording." : undefined}
              className={`min-h-[68px] flex-1 rounded-xl border px-4 py-3 ${
                isRecording
                  ? "border-warning-border bg-warning-soft"
                  : isTranscribing
                    ? "border-border bg-muted"
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

              {!isRecording && isTranscribing && (
                <View testID="voice-note-transcribing" className="flex-row items-center gap-3">
                  <ActivityIndicator size="small" color="#1a1a2e" />
                  <Text className="text-sm font-medium text-muted-foreground">
                    {interimTranscript || "Transcribing…"}
                  </Text>
                </View>
              )}

              {!isRecording && !isTranscribing && (
              <TextInput
                testID="input-note"
                value={currentInput}
                onChangeText={setCurrentInput}
                placeholder="Type a quick site note..."
                placeholderTextColor="#5c5c6e"
                className="min-h-[62px] text-base text-foreground"
                multiline
                textAlignVertical="top"
                returnKeyType="default"
                blurOnSubmit={false}
              />
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
                  <Plus size={18} color="#ffffff" />
                  <Text className="text-xs font-semibold text-primary-foreground">
                    Add
                  </Text>
                </View>
              </Button>
            ) : (
              <Pressable
                onPress={toggleRecording}
                disabled={isTranscribing}
                className="relative"
                testID={
                  isTranscribing
                    ? "btn-record-transcribing"
                    : isRecording
                      ? "btn-record-stop"
                      : "btn-record-start"
                }
                accessibilityRole="button"
                accessibilityState={{ disabled: isTranscribing, busy: isTranscribing }}
                accessibilityLabel={
                  isTranscribing
                    ? "Transcribing voice note"
                    : isRecording
                      ? "Stop recording"
                      : "Start voice recording"
                }
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
                        backgroundColor: "rgba(244, 115, 22, 0.3)",
                      },
                      pulseStyle,
                    ]}
                  />
                )}
                <View
                  className={`min-h-[68px] min-w-[92px] items-center justify-center rounded-xl px-4 ${
                    isRecording
                      ? "bg-primary"
                      : isTranscribing
                        ? "bg-muted-foreground"
                        : "bg-foreground"
                  }`}
                >
                  <View className="items-center gap-1">
                    {isTranscribing ? (
                      <ActivityIndicator size="small" color="#ffffff" />
                    ) : isRecording ? (
                      <MicOff size={24} color="#ffffff" />
                    ) : (
                      <Mic size={24} color="#ffffff" />
                    )}
                    <Text className="text-xs font-semibold text-primary-foreground">
                      {isTranscribing ? "Saving" : isRecording ? "Stop" : "Voice"}
                    </Text>
                  </View>
                </View>
              </Pressable>
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
          uri={imagePreview?.uri ?? null}
          title={imagePreview?.title}
          onClose={() => setImagePreview(null)}
        />
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
