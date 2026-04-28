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
import { getActionErrorDialogCopy } from "@/lib/app-dialog-copy";
import { getGenerateReportTabLabel } from "@/lib/generate-report-ui";
import { getReportCompleteness } from "@/lib/report-helpers";
import { backend } from "@/lib/backend";
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
  const debugCombinedPrompt = debugSystemPrompt && debugUserPrompt
    ? `# System\n\n${debugSystemPrompt}\n\n---\n\n# User\n\n${debugUserPrompt}`
    : "";
  const { copy: copyDebug, isCopied: isDebugCopied } = useCopyToClipboard();

  const handleVoiceNoteSaved = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ["project-files", projectId] });
  }, [projectId, queryClient]);

  // Speech-to-text
  const {
    isRecording,
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
      ? { projectId, uploadedBy: user.id, reportId: reportId ?? null }
      : undefined,
    onVoiceNoteSaved: handleVoiceNoteSaved,
  });

  // Tab state
  const [activeTab, setActiveTab] = useState<"notes" | "report" | "debug">("report");

  // Inline editing state
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editingContent, setEditingContent] = useState("");
  const [imagePreview, setImagePreview] = useState<{ uri: string; title: string } | null>(null);

  // ── Auto-save ──
  const [draftDeleteErrorMessage, setDraftDeleteErrorMessage] = useState<string | null>(null);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const lastSavedRef = useRef("");
  const notesRef = useRef(notesList);
  const reportRef = useRef(report);
  notesRef.current = notesList;
  reportRef.current = report;

  const { update: localUpdate, remove: localRemove } = useLocalReportMutations();

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

  // Load existing draft on mount
  useEffect(() => {
    if (!reportId) return;
    let cancelled = false;
    (async () => {
      const { data, error: loadErr } = await backend
        .from("reports")
        .select("notes, report_data")
        .eq("id", reportId)
        .single();
      if (cancelled || loadErr || !data) return;
      if (data.notes?.length) {
        setNotesList(fromTextArray(data.notes));
      }
      const rd = data.report_data as Record<string, unknown> | null;
      if (rd && typeof rd === "object" && Object.keys(rd).length > 0) {
        const parsed = normalizeGeneratedReportPayload(rd);
        if (parsed) {
          setReport(parsed);
          setLastProcessedCount(data.notes?.length ?? 0);
          lastSavedRef.current = JSON.stringify({ notes: toTextArray(fromTextArray(data.notes)), report: parsed });
        }
      } else if (data.notes?.length) {
        bumpNotesVersion();
      }
    })();
    return () => { cancelled = true; };
  }, [reportId]);

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
    reportId: reportId ?? null,
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
      router.replace(`/projects/${projectId}/reports/${reportId}`);
    },
  });

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

        {/* ── Notes Tab ── */}
        {activeTab === "notes" && (
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
                      reportId={reportId ?? null}
                      category="document"
                      label="Add document"
                    />
                  </View>
                  <View className="flex-1">
                    <FilePickerButton
                      projectId={projectId}
                      reportId={reportId ?? null}
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
        )}

        {/* ── Report Tab ── */}
        {activeTab === "report" && (
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
                    onPress={() => finalizeReport()}
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
        )}

        {/* ── Debug Tab ── */}
        {activeTab === "debug" && (
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
                <Text className="mb-1 text-lg font-bold text-foreground">Request Body</Text>
                <View className="border border-border bg-card p-3">
                  <Text
                    className="text-xs text-foreground"
                    style={{ fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace" }}
                   
                  >
                    {rawRequest ? JSON.stringify(rawRequest, null, 2) : "No request yet — add a note and wait ~2s"}
                  </Text>
                </View>
              </View>
              <View>
                <View className="mb-1 flex-row items-center justify-between">
                  <Text className="text-lg font-bold text-foreground">Prompt</Text>
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
                <View className="border border-border bg-card p-3">
                  {debugSystemPrompt || debugUserPrompt ? (
                    <Text
                      className="text-xs text-foreground"
                      style={{ fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace" }}
                     
                    >
                      {debugCombinedPrompt}
                    </Text>
                  ) : (
                    <Text className="text-xs text-muted-foreground">
                      No prompt yet — generate a report to capture it.
                    </Text>
                  )}
                </View>
              </View>
              <View>
                <Text className="mb-1 text-lg font-bold text-foreground">LLM Response</Text>
                <View className="border border-border bg-card p-3">
                  <Text
                    className="text-xs text-foreground"
                    style={{ fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace" }}
                   
                  >
                    {rawResponse ? JSON.stringify(rawResponse, null, 2) : mutationStatus === "pending" ? "Waiting for response…" : mutationStatus === "error" ? "No response received from edge function" : "No request sent yet"}
                  </Text>
                </View>
              </View>
              {error && (
                <View>
                  <Text className="mb-1 text-lg font-bold text-destructive">Error</Text>
                  <View className="border border-destructive bg-card p-3">
                    <Text
                      className="text-xs text-destructive"
                      style={{ fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace" }}
                     
                    >
                      {error}
                    </Text>
                  </View>
                </View>
              )}
            </View>
          </ScrollView>
        )}

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
                className="relative"
                testID={isRecording ? "btn-record-stop" : "btn-record-start"}
                accessibilityRole="button"
                accessibilityLabel={
                  isRecording ? "Stop recording" : "Start voice recording"
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
                    isRecording ? "bg-primary" : "bg-foreground"
                  }`}
                >
                  <View className="items-center gap-1">
                    {isRecording ? (
                      <MicOff size={24} color="#ffffff" />
                    ) : (
                      <Mic size={24} color="#ffffff" />
                    )}
                    <Text className="text-xs font-semibold text-primary-foreground">
                      {isRecording ? "Stop" : "Voice"}
                    </Text>
                  </View>
                </View>
              </Pressable>
            )}
          </View>
        </View>

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
