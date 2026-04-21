import { useState, useEffect, useRef, useCallback } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  ScrollView,
  KeyboardAvoidingView,
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
  X,
  RotateCcw,
  FileText,
  MessageSquare,
  Code,
} from "lucide-react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Animated, {
  FadeInDown,
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
import { ReportView } from "@/components/reports/ReportView";
import { CompletenessCard } from "@/components/reports/CompletenessCard";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { DeleteDraftButton } from "@/components/reports/DeleteDraftButton";
import { ImageCaptureButton } from "@/components/reports/ImageCaptureButton";
import { useReportGeneration } from "@/hooks/useReportGeneration";
import { useReportImages } from "@/hooks/useReportImages";
import { useSpeechToText } from "@/hooks/useSpeechToText";
import { getActionErrorDialogCopy } from "@/lib/app-dialog-copy";
import { deleteDraftReport } from "@/lib/draft-report-actions";
import { getGenerateReportTabLabel } from "@/lib/generate-report-ui";
import { getReportCompleteness } from "@/lib/report-helpers";
import { backend } from "@/lib/backend";
import {
  normalizeGeneratedReportPayload,
  type GeneratedSiteReport,
} from "@/lib/generated-report";

const EMPTY_REPORT_SKELETON: GeneratedSiteReport = {
  report: {
    meta: { title: "", reportType: "daily", summary: "", visitDate: null },
    weather: null,
    manpower: null,
    activities: [],
    siteConditions: [],
    issues: [],
    nextSteps: [],
    sections: [],
    photoPlacements: [],
  },
};

export default function GenerateReportScreen() {
  const router = useRouter();
  const { projectId, reportId } = useLocalSearchParams<{ projectId: string; reportId?: string }>();
  const queryClient = useQueryClient();
  const notesScrollRef = useRef<ScrollView>(null);
  const reportScrollRef = useRef<ScrollView>(null);

  // Notes state
  const [notesList, setNotesList] = useState<string[]>([]);
  const [currentInput, setCurrentInput] = useState("");

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
  } = useReportGeneration(notesList, projectId);

  // Speech-to-text
  const {
    isRecording,
    interimTranscript,
    error: speechError,
    start: startListening,
    stop: stopListening,
  } = useSpeechToText({
    onResult: (transcript) => {
      setNotesList((prev) => [...prev, transcript]);
      bumpNotesVersion();
      setTimeout(() => notesScrollRef.current?.scrollTo({ y: 0, animated: true }), 100);
    },
  });

  // Tab state
  const [activeTab, setActiveTab] = useState<"notes" | "report" | "debug">("report");

  // Report images (server + offline queue, merged)
  const { images: reportImages } = useReportImages(reportId);

  // Inline editing state
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editingContent, setEditingContent] = useState("");

  // ── Auto-save ──
  const [draftDeleteErrorMessage, setDraftDeleteErrorMessage] = useState<string | null>(null);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const lastSavedRef = useRef("");
  const notesRef = useRef(notesList);
  const reportRef = useRef(report);
  notesRef.current = notesList;
  reportRef.current = report;

  const doSave = useCallback(async () => {
    if (!reportId) return;
    const currentNotes = notesRef.current;
    const currentReport = reportRef.current;
    const key = JSON.stringify({ notes: currentNotes, report: currentReport });
    if (key === lastSavedRef.current) return;

    const updateData: Record<string, unknown> = {
      notes: currentNotes,
      report_data: currentReport ?? {},
      confidence: currentReport ? getReportCompleteness(currentReport) : 0,
    };
    if (currentReport) {
      updateData.title = currentReport.report.meta.title;
      updateData.report_type = currentReport.report.meta.reportType;
      updateData.visit_date = currentReport.report.meta.visitDate ?? null;
    }
    const { error: saveErr } = await backend
      .from("reports")
      .update(updateData)
      .eq("id", reportId);
    if (!saveErr) {
      lastSavedRef.current = key;
    }
  }, [reportId]);

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
        setNotesList(data.notes);
      }
      const rd = data.report_data as Record<string, unknown> | null;
      if (rd && typeof rd === "object" && Object.keys(rd).length > 0) {
        const parsed = normalizeGeneratedReportPayload(rd);
        if (parsed) {
          setReport(parsed);
          setLastProcessedCount(data.notes?.length ?? 0);
          lastSavedRef.current = JSON.stringify({ notes: data.notes, report: parsed });
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

  const orderedNotes = notesList
    .map((note, sourceIndex) => ({
      note,
      sourceIndex,
      displayIndex: notesList.length - sourceIndex,
    }))
    .reverse();

  // Pulse animation for recording
  const pulseScale = useSharedValue(1);
  const pulseOpacity = useSharedValue(0.6);

  useEffect(() => {
    if (isRecording) {
      pulseScale.value = withRepeat(
        withTiming(1.5, { duration: 1200, easing: Easing.out(Easing.ease) }),
        -1,
        false
      );
      pulseOpacity.value = withRepeat(
        withTiming(0, { duration: 1200, easing: Easing.out(Easing.ease) }),
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
    setNotesList((prev) => [...prev, trimmed]);
    setCurrentInput("");
    bumpNotesVersion();
    setTimeout(() => notesScrollRef.current?.scrollTo({ y: 0, animated: true }), 100);
  };

  const removeNote = (index: number) => {
    setNotesList((prev) => prev.filter((_, i) => i !== index));
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
      const { error: err } = await backend
        .from("reports")
        .update({
          title: report.report.meta.title,
          report_type: report.report.meta.reportType,
          visit_date: report.report.meta.visitDate ?? null,
          notes: notesList,
          report_data: report,
          confidence: completeness,
          status: "final",
        })
        .eq("id", reportId);
      if (err) throw err;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["reports", projectId] });
      router.replace(`/projects/${projectId}/reports/${reportId}`);
    },
  });

  const { mutate: deleteDraft, isPending: isDeletingDraft } = useMutation({
    mutationFn: async () => {
      if (!reportId) throw new Error("No draft report to delete.");

      clearTimeout(saveTimeoutRef.current);

      await deleteDraftReport({
        backend,
        reportId,
        projectId,
      });
    },
    onSuccess: () => {
      queryClient.removeQueries({ queryKey: ["report", projectId, reportId] });
      queryClient.invalidateQueries({ queryKey: ["reports", projectId] });
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
        behavior={Platform.OS === "ios" ? "padding" : "height"}
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
            onPress={() => setActiveTab("notes")}
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
            onPress={() => setActiveTab("report")}
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
          {__DEV__ && (
            <Pressable
              onPress={() => setActiveTab("debug")}
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
          )}
        </View>

        {/* ── Notes Tab ── */}
        {activeTab === "notes" && (
          <ScrollView
            ref={notesScrollRef}
            className="flex-1 px-5"
            contentContainerStyle={{ paddingBottom: 100 }}
            keyboardShouldPersistTaps="handled"
          >
            {notesList.length === 0 && (
              <EmptyState
                icon={<Mic size={28} color="#5c5c6e" />}
                title="Start capturing site notes"
                description="Record short voice updates or type notes below. The report will build itself as you go."
              />
            )}

            {notesList.length > 0 && (
              <View className="gap-2">
                {orderedNotes.map(({ note, sourceIndex, displayIndex }) => (
                  <Animated.View
                    key={`note-${sourceIndex}`}
                    entering={FadeInDown.duration(100)}
                  >
                    <View className="flex-row items-start gap-3 rounded-lg border border-border bg-card p-3">
                      <View className="min-h-8 min-w-8 items-center justify-center rounded-md bg-secondary px-2 py-1">
                        <Text className="text-sm font-semibold text-foreground">
                          {displayIndex}
                        </Text>
                      </View>
                      <Text className="flex-1 text-body text-foreground">
                        {note}
                      </Text>
                      <Pressable
                        onPress={() => removeNote(sourceIndex)}
                        hitSlop={8}
                        className="self-center"
                      >
                        <X size={14} color="#5c5c6e" />
                      </Pressable>
                    </View>
                  </Animated.View>
                ))}

                {/* Hint to check report */}
                {report && (
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
              </View>
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

            {/* Error banner */}
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
                  images={reportImages}
                />

                {/* Actions */}
                <Animated.View entering={FadeIn} className="gap-2">
                  {finalizeError && (
                    <InlineNotice tone="danger">
                      {finalizeError instanceof Error ? finalizeError.message : "Failed to finalize report."}
                    </InlineNotice>
                  )}
                  <Button
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

        {/* ── Debug Tab (dev only) ── */}
        {activeTab === "debug" && __DEV__ && (
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
                    selectable
                  >
                    {rawRequest ? JSON.stringify(rawRequest, null, 2) : "No request yet — add a note and wait ~2s"}
                  </Text>
                </View>
              </View>
              <View>
                <Text className="mb-1 text-lg font-bold text-foreground">LLM Response</Text>
                <View className="border border-border bg-card p-3">
                  <Text
                    className="text-xs text-foreground"
                    style={{ fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace" }}
                    selectable
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
                      selectable
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
          <Text className="mb-2 text-sm text-muted-foreground">
            {isRecording
              ? "Listening now. Tap stop when the note is complete."
              : "Tap the mic for a hands-free voice note or type a quick site update."}
          </Text>
          <View className="flex-row items-stretch gap-3">
            <TextInput
              value={isRecording ? interimTranscript : currentInput}
              onChangeText={isRecording ? undefined : setCurrentInput}
              placeholder={isRecording ? "Listening..." : "Type a quick site note..."}
              placeholderTextColor="#5c5c6e"
              editable={!isRecording}
              className={`min-h-[68px] flex-1 rounded-xl border px-4 py-4 text-base ${
                isRecording
                  ? "border-warning-border bg-warning-soft text-foreground"
                  : "border-border bg-card text-foreground"
              }`}
              returnKeyType="send"
              onSubmitEditing={addNote}
              blurOnSubmit={false}
            />

            {reportId && projectId && !isRecording ? (
              <View className="justify-center">
                <ImageCaptureButton
                  reportId={reportId}
                  projectId={projectId}
                  report={report}
                  precedingNoteIndex={notesList.length > 0 ? notesList.length : null}
                  existingImageCount={reportImages.length}
                />
              </View>
            ) : null}

            {currentInput.trim() ? (
              <Button
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
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
