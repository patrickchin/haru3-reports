import { useState, useEffect, useRef } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import {
  ArrowLeft,
  Mic,
  MicOff,
  Plus,
  Sparkles,
  X,
  RotateCcw,
  FileText,
  MessageSquare,
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
import { Button } from "@/components/ui/Button";
import { ReportView } from "@/components/reports/ReportView";
import { CompletenessCard } from "@/components/reports/CompletenessCard";
import { useReportGeneration } from "@/hooks/useReportGeneration";
import { useSpeechToText } from "@/hooks/useSpeechToText";
import { getReportCompleteness } from "@/lib/report-helpers";
import { backend } from "@/lib/backend";
import { useAuth } from "@/lib/auth";

export default function GenerateReportScreen() {
  const router = useRouter();
  const { projectId } = useLocalSearchParams<{ projectId: string }>();
  const { user } = useAuth();
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
  } = useReportGeneration(notesList);

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
      setTimeout(() => notesScrollRef.current?.scrollToEnd({ animated: true }), 100);
    },
  });

  // Tab state
  const [activeTab, setActiveTab] = useState<"notes" | "report">("notes");

  // Inline editing state
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editingContent, setEditingContent] = useState("");

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
    setTimeout(() => notesScrollRef.current?.scrollToEnd({ animated: true }), 100);
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

  const { mutate: saveReport, isPending: isSaving, error: saveError } = useMutation({
    mutationFn: async () => {
      if (!report) throw new Error("No report to save.");
      const { data, error } = await backend
        .from("reports")
        .insert({
          project_id: projectId,
          owner_id: user!.id,
          title: report.report.meta.title,
          report_type: report.report.meta.reportType,
          visit_date: report.report.meta.visitDate ?? null,
          notes: notesList,
          report_data: report,
          confidence: completeness,
        })
        .select("id")
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["reports", projectId] });
      router.replace(`/projects/${projectId}/reports/${data.id}`);
    },
  });

  return (
    <SafeAreaView className="flex-1 bg-background">
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        className="flex-1"
        keyboardVerticalOffset={0}
      >
        {/* Header */}
        <View className="px-5 pt-4 pb-2">
          <Pressable
            onPress={() => router.back()}
            className="mb-4 flex-row items-center gap-2 self-start border border-foreground px-4 py-2 active:opacity-75"
          >
            <ArrowLeft size={16} color="#1a1a2e" />
            <Text className="text-sm font-semibold uppercase tracking-wider text-foreground">Reports</Text>
          </Pressable>
          <Text className="text-3xl font-bold tracking-tight text-foreground">
            New Report
          </Text>
          <Text className="mt-1 text-base text-muted-foreground">
            Add notes to build your report in real-time.
          </Text>
        </View>

        {/* Tab bar */}
        <View className="mx-5 mt-3 mb-2 flex-row border border-border bg-card p-1">
          <Pressable
            onPress={() => setActiveTab("notes")}
            className={`flex-1 flex-row items-center justify-center gap-2 py-3 ${
              activeTab === "notes" ? "bg-foreground" : ""
            }`}
          >
            <MessageSquare
              size={16}
              color={activeTab === "notes" ? "#f8f6f1" : "#5c5c6e"}
              style={{ marginTop: 1 }}
            />
            <Text
              className={`text-sm font-semibold uppercase tracking-wider ${
                activeTab === "notes" ? "text-primary-foreground" : "text-muted-foreground"
              }`}
            >
              Notes ({notesList.length})
            </Text>
          </Pressable>
          <Pressable
            onPress={() => setActiveTab("report")}
            className={`flex-1 flex-row items-center justify-center gap-2 py-3 ${
              activeTab === "report" ? "bg-foreground" : ""
            }`}
          >
            <FileText
              size={16}
              color={activeTab === "report" ? "#f8f6f1" : "#5c5c6e"}
              style={{ marginTop: 1 }}
            />
            <Text
              className={`text-sm font-semibold uppercase tracking-wider ${
                activeTab === "report" ? "text-primary-foreground" : "text-muted-foreground"
              }`}
            >
              Report
            </Text>
            {isUpdating && (
              <ActivityIndicator size="small" color={activeTab === "report" ? "#f8f6f1" : "#1a1a2e"} />
            )}
            {report && !isUpdating && (
              <View className="border border-current px-2 py-0.5">
                <Text className={`text-sm font-semibold ${
                  activeTab === "report" ? "text-primary-foreground" : "text-foreground"
                }`}>
                  {completeness}%
                </Text>
              </View>
            )}
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
            {notesList.length === 0 && (
              <View className="items-center justify-center py-20">
                <View className="h-16 w-16 items-center justify-center border border-border bg-card">
                  <Mic size={28} color="#5c5c6e" />
                </View>
                <Text className="mt-4 text-center text-lg text-muted-foreground">
                  {"Record voice notes or type below.\nYour report builds automatically."}
                </Text>
              </View>
            )}

            {notesList.length > 0 && (
              <View className="gap-2">
                {notesList.map((note, i) => (
                  <Animated.View
                    key={`note-${i}`}
                    entering={FadeInDown.duration(100)}
                  >
                    <View className="flex-row items-start gap-2 border border-border bg-card p-3">
                      <Text className="text-base text-foreground">
                        {i + 1}
                      </Text>
                      <Text className="flex-1 text-base text-foreground">
                        {note}
                      </Text>
                      <Pressable onPress={() => removeNote(i)} hitSlop={8} className="self-center">
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
                      className="mt-2 flex-row items-center justify-center gap-2 border border-foreground bg-card p-3"
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
            {/* No report yet */}
            {!report && !isUpdating && notesList.length === 0 && (
              <View className="items-center justify-center py-20">
                <View className="h-16 w-16 items-center justify-center border border-border bg-card">
                  <FileText size={28} color="#5c5c6e" />
                </View>
                <Text className="mt-4 text-center text-lg text-muted-foreground">
                  {"Add your first note to start\nbuilding the report."}
                </Text>
              </View>
            )}

            {/* Generating shimmer */}
            {isUpdating && !report && (
              <View className="gap-3">
                <View className="flex-row items-center gap-2 py-2">
                  <ActivityIndicator size="small" color="#1a1a2e" />
                  <Text className="text-base font-medium text-muted-foreground">
                    Generating report...
                  </Text>
                </View>
                {[1, 2, 3, 4].map((i) => (
                  <Animated.View
                    key={i}
                    entering={FadeIn}
                    className="h-20 bg-secondary"
                  />
                ))}
              </View>
            )}

            {/* Error banner */}
            {error && (
              <Animated.View entering={FadeIn}>
                <View className="mb-3 border border-destructive bg-card p-4">
                  <Text className="mb-2 text-lg font-medium text-destructive">
                    {error}
                  </Text>
                  <Button
                    variant="outline"
                    size="sm"
                    onPress={handleFullRegenerate}
                  >
                    <View className="flex-row items-center gap-1.5">
                      <RotateCcw size={14} color="#5c5c6e" />
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
                    <View className="flex-row items-center gap-2 border border-foreground bg-card px-3 py-2">
                      <ActivityIndicator size="small" color="#1a1a2e" />
                      <Text className="text-base font-medium text-foreground">
                        Updating with new notes...
                      </Text>
                    </View>
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
                  {saveError && (
                    <Text className="text-base text-destructive">
                      {saveError instanceof Error ? saveError.message : "Failed to save report."}
                    </Text>
                  )}
                  <Button
                    variant="hero"
                    size="xl"
                    className="mt-4 w-full"
                    onPress={() => saveReport()}
                    disabled={isSaving || !report}
                  >
                    {isSaving ? "Saving..." : "Save Report"}
                  </Button>
                  <Button
                    variant="ghost"
                    size="default"
                    className="w-full"
                    onPress={handleFullRegenerate}
                    disabled={isSaving}
                  >
                    <View className="flex-row items-center gap-1.5">
                      <RotateCcw size={14} color="#5c5c6e" />
                      <Text className="text-base font-semibold text-foreground">
                        Regenerate from Scratch
                      </Text>
                    </View>
                  </Button>
                </Animated.View>
              </View>
            )}
          </ScrollView>
        )}

        {/* Fixed bottom input bar — always visible */}
        <View className="border-t border-border bg-background px-5 py-3">
          {speechError && (
            <Text className="mb-2 text-sm text-destructive">{speechError}</Text>
          )}
          <View className="flex-row items-end gap-2">
            <TextInput
              value={isRecording ? interimTranscript : currentInput}
              onChangeText={isRecording ? undefined : setCurrentInput}
              placeholder={isRecording ? "Listening..." : "Type a site note..."}
              placeholderTextColor="#5c5c6e"
              editable={!isRecording}
              className={`min-h-11 flex-1 border px-4 py-2 text-base ${
                isRecording
                  ? "border-primary bg-orange-50 text-foreground"
                  : "border-border bg-white text-foreground"
              }`}
              multiline
              onSubmitEditing={addNote}
              blurOnSubmit={false}
            />

            {currentInput.trim() ? (
              <Button size="icon" onPress={addNote}>
                <Plus size={18} color="#ffffff" />
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
                        borderRadius: 8,
                        backgroundColor: "rgba(244, 115, 22, 0.3)",
                      },
                      pulseStyle,
                    ]}
                  />
                )}
                <View
                  className={`h-11 w-11 items-center justify-center ${
                    isRecording ? "bg-primary" : "bg-foreground"
                  }`}
                >
                  {isRecording ? (
                    <MicOff size={20} color="#ffffff" />
                  ) : (
                    <Mic size={20} color="#ffffff" />
                  )}
                </View>
              </Pressable>
            )}
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
