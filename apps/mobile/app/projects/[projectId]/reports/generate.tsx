import { useState, useEffect, useRef } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import {
  ArrowLeft,
  Mic,
  MicOff,
  Plus,
  Cloud,
  Users,
  TrendingUp,
  AlertTriangle,
  ClipboardList,
  Eye,
  HardHat,
  Sparkles,
  X,
  Pencil,
  Check,
  RotateCcw,
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
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { supabase } from "@/lib/supabase";

const SECTION_ICONS: Record<
  string,
  React.ComponentType<{ size: number; color: string }>
> = {
  Weather: Cloud,
  Manpower: Users,
  "Work Progress": TrendingUp,
  Progress: TrendingUp,
  "Site Conditions": HardHat,
  Observations: Eye,
  Issues: AlertTriangle,
};

type ReportSection = { section: string; content: string };

export default function GenerateReportScreen() {
  const router = useRouter();
  const { projectId } = useLocalSearchParams<{ projectId: string }>();
  const scrollRef = useRef<ScrollView>(null);

  // Notes collection state
  const [notesList, setNotesList] = useState<string[]>([]);
  const [currentInput, setCurrentInput] = useState("");
  const [isRecording, setIsRecording] = useState(false);

  // Generation state
  const [isGenerating, setIsGenerating] = useState(false);
  const [report, setReport] = useState<ReportSection[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Inline editing state
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editingContent, setEditingContent] = useState("");

  // Pulse animation for recording indicator
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
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
  };

  const removeNote = (index: number) => {
    setNotesList((prev) => prev.filter((_, i) => i !== index));
  };

  const toggleRecording = () => {
    setIsRecording(!isRecording);
    if (isRecording) {
      // Simulated transcription — replace with real speech-to-text later
      const transcribed =
        "Poured concrete on third floor section B today. 12 people on site. Crane two needs maintenance.";
      setNotesList((prev) => [...prev, transcribed]);
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
    }
  };

  const handleGenerate = async () => {
    if (notesList.length === 0) return;
    setError(null);
    setIsGenerating(true);

    try {
      const { data, error: fnError } = await supabase.functions.invoke(
        "generate-report",
        { body: { notes: notesList } }
      );

      if (fnError) throw fnError;

      if (data?.report && Array.isArray(data.report)) {
        setReport(data.report);
      } else {
        throw new Error("Unexpected response format");
      }
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Report generation failed";
      setError(message);
    } finally {
      setIsGenerating(false);
    }
  };

  const startEditing = (index: number) => {
    setEditingIndex(index);
    setEditingContent(report![index].content);
  };

  const saveEdit = () => {
    if (editingIndex === null || !report) return;
    setReport((prev) =>
      prev!.map((block, i) =>
        i === editingIndex ? { ...block, content: editingContent } : block
      )
    );
    setEditingIndex(null);
    setEditingContent("");
  };

  const resetReport = () => {
    setReport(null);
    setError(null);
  };

  const mode = report
    ? "review"
    : isGenerating
      ? "generating"
      : "collecting";

  return (
    <SafeAreaView className="flex-1 bg-background">
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        className="flex-1"
        keyboardVerticalOffset={0}
      >
        {/* Header */}
        <View className="px-5 pt-4 pb-4">
          <Pressable
            onPress={() => router.back()}
            className="mb-4 flex-row items-center gap-1"
          >
            <ArrowLeft size={16} color="#6e6e77" />
            <Text className="text-sm text-muted-foreground">Reports</Text>
          </Pressable>
          <Text className="text-2xl font-bold tracking-tight text-foreground">
            {mode === "review" ? "Review Report" : "New Report"}
          </Text>
          <Text className="mt-1 text-sm text-muted-foreground">
            {mode === "collecting" && "Add your site notes, then generate."}
            {mode === "generating" && "Generating your report..."}
            {mode === "review" && "Tap any section to edit."}
          </Text>
        </View>

        {/* Content area */}
        <ScrollView
          ref={scrollRef}
          className="flex-1 px-5"
          contentContainerStyle={{ paddingBottom: 100 }}
          keyboardShouldPersistTaps="handled"
        >
          {/* ── Collecting mode ── */}
          {mode === "collecting" && notesList.length === 0 && (
            <View className="items-center justify-center py-20">
              <View className="h-16 w-16 items-center justify-center rounded-2xl bg-secondary">
                <Mic size={28} color="#6e6e77" />
              </View>
              <Text className="mt-4 text-center text-sm text-muted-foreground">
                {"Record voice notes or type below,\nthen generate your AI report."}
              </Text>
            </View>
          )}

          {mode === "collecting" && notesList.length > 0 && (
            <View className="gap-2">
              {notesList.map((note, i) => (
                <Animated.View
                  key={`note-${i}`}
                  entering={FadeInDown.duration(200)}
                >
                  <View className="flex-row items-start gap-2 rounded-lg bg-secondary p-3">
                    <View className="mt-0.5 h-5 w-5 items-center justify-center rounded-full bg-primary/10">
                      <Text className="text-xs font-semibold text-primary">
                        {i + 1}
                      </Text>
                    </View>
                    <Text className="flex-1 text-sm text-foreground">
                      {note}
                    </Text>
                    <Pressable onPress={() => removeNote(i)} hitSlop={8}>
                      <X size={14} color="#6e6e77" />
                    </Pressable>
                  </View>
                </Animated.View>
              ))}

              {/* Generate button */}
              <Animated.View entering={FadeIn.delay(100)}>
                <Button
                  variant="hero"
                  size="xl"
                  className="mt-4 w-full"
                  onPress={handleGenerate}
                >
                  <View className="flex-row items-center gap-2">
                    <Sparkles size={18} color="#ffffff" />
                    <Text className="text-base font-semibold text-primary-foreground">
                      Generate Report
                    </Text>
                  </View>
                </Button>
              </Animated.View>
            </View>
          )}

          {/* ── Generating mode ── */}
          {mode === "generating" && (
            <View className="gap-3">
              {[1, 2, 3, 4].map((i) => (
                <Animated.View
                  key={i}
                  entering={FadeIn.delay(i * 100)}
                  className="h-20 rounded-lg bg-secondary"
                />
              ))}
            </View>
          )}

          {/* ── Error banner ── */}
          {error && (
            <Animated.View entering={FadeIn}>
              <View className="mb-3 rounded-lg bg-destructive/10 p-4">
                <Text className="mb-2 text-sm font-medium text-destructive">
                  {error}
                </Text>
                <Button
                  variant="outline"
                  size="sm"
                  onPress={handleGenerate}
                >
                  <View className="flex-row items-center gap-1.5">
                    <RotateCcw size={14} color="#6e6e77" />
                    <Text className="text-sm font-semibold text-foreground">
                      Retry
                    </Text>
                  </View>
                </Button>
              </View>
            </Animated.View>
          )}

          {/* ── Review mode ── */}
          {mode === "review" && (
            <View className="gap-3">
              {report!.map((block, i) => {
                const Icon = SECTION_ICONS[block.section] || ClipboardList;
                const isEditing = editingIndex === i;
                return (
                  <Animated.View
                    key={block.section}
                    entering={FadeInDown.delay(i * 100).duration(300)}
                  >
                    <Card>
                      <View className="mb-2 flex-row items-center gap-2">
                        <View className="h-8 w-8 items-center justify-center rounded-md bg-primary/10">
                          <Icon size={16} color="#f47316" />
                        </View>
                        <Text className="flex-1 text-sm font-semibold text-foreground">
                          {block.section}
                        </Text>
                        {isEditing ? (
                          <Pressable onPress={saveEdit} hitSlop={8}>
                            <Check size={16} color="#f47316" />
                          </Pressable>
                        ) : (
                          <Pressable
                            onPress={() => startEditing(i)}
                            hitSlop={8}
                          >
                            <Pencil size={14} color="#6e6e77" />
                          </Pressable>
                        )}
                      </View>
                      {isEditing ? (
                        <TextInput
                          value={editingContent}
                          onChangeText={setEditingContent}
                          multiline
                          autoFocus
                          className="min-h-[60px] rounded-md bg-secondary p-2 text-sm leading-relaxed text-foreground"
                          onBlur={saveEdit}
                        />
                      ) : (
                        <Pressable onPress={() => startEditing(i)}>
                          <Text className="text-sm leading-relaxed text-muted-foreground">
                            {block.content}
                          </Text>
                        </Pressable>
                      )}
                    </Card>
                  </Animated.View>
                );
              })}

              <Animated.View entering={FadeIn.delay(500)} className="gap-2">
                <Button
                  variant="hero"
                  size="xl"
                  className="mt-4 w-full"
                  onPress={() => router.back()}
                >
                  Save Report
                </Button>
                <Button
                  variant="ghost"
                  size="default"
                  className="w-full"
                  onPress={resetReport}
                >
                  <View className="flex-row items-center gap-1.5">
                    <RotateCcw size={14} color="#6e6e77" />
                    <Text className="text-sm font-semibold text-foreground">
                      Back to Notes
                    </Text>
                  </View>
                </Button>
              </Animated.View>
            </View>
          )}
        </ScrollView>

        {/* Fixed bottom input bar — only in collecting mode */}
        {mode === "collecting" && (
          <View className="border-t border-border bg-background px-5 py-3">
            <View className="flex-row items-end gap-2">
              <TextInput
                value={currentInput}
                onChangeText={setCurrentInput}
                placeholder="Type a site note..."
                placeholderTextColor="#6e6e77"
                className="min-h-11 flex-1 rounded-lg bg-secondary px-4 py-2 text-sm text-foreground"
                multiline
                onSubmitEditing={addNote}
                blurOnSubmit={false}
              />

              {currentInput.trim() ? (
                <Button size="icon" onPress={addNote}>
                  <Plus size={18} color="#ffffff" />
                </Button>
              ) : (
                <Pressable onPress={toggleRecording} className="relative">
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
                    className={`h-11 w-11 items-center justify-center rounded-lg ${
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
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
