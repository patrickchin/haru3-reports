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
import { backend } from "@/lib/backend";
import {
  normalizeGeneratedReportPayload,
  type GeneratedReportActivity,
  type GeneratedReportIssue,
  type GeneratedReportManpower,
  type GeneratedReportSection,
  type GeneratedSiteReport,
} from "@/lib/generated-report";

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
  "Next Steps": ClipboardList,
};

function toTitleCase(value: string) {
  return value
    .replace(/[_-]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (match) => match.toUpperCase());
}

function formatSourceNotes(indexes: number[]) {
  return indexes.length > 0 ? `Source notes: ${indexes.join(", ")}` : null;
}

function getManpowerLines(manpower: GeneratedReportManpower | null) {
  if (!manpower) {
    return [];
  }

  const lines: string[] = [];

  if (manpower.totalWorkers !== null) {
    lines.push(`${manpower.totalWorkers} workers recorded on site.`);
  }

  if (manpower.workerHours) {
    lines.push(`Worker hours: ${manpower.workerHours}`);
  }

  if (manpower.notes) {
    lines.push(manpower.notes);
  }

  for (const role of manpower.roles) {
    const count = role.count !== null ? `${role.count} ` : "";
    const notes = role.notes ? ` - ${role.notes}` : "";
    lines.push(`${count}${role.role}${notes}`.trim());
  }

  return lines;
}

function getWeatherLines(report: GeneratedSiteReport) {
  const weather = report.report.weather;
  if (!weather) {
    return [];
  }

  return [
    weather.conditions,
    weather.temperature ? `Temperature: ${weather.temperature}` : null,
    weather.wind ? `Wind: ${weather.wind}` : null,
    weather.impact ? `Impact: ${weather.impact}` : null,
  ].filter(Boolean) as string[];
}

function getIssueMeta(issue: GeneratedReportIssue) {
  return [issue.category, issue.severity, issue.status]
    .filter(Boolean)
    .map(toTitleCase)
    .join(" • ");
}

function getItemMeta(values: Array<string | null>) {
  return values.filter(Boolean).join(" • ");
}

function getActivitySummaryChips(activity: GeneratedReportActivity) {
  const totalWorkers =
    activity.manpower && activity.manpower.totalWorkers !== null
      ? `${activity.manpower.totalWorkers} workers`
      : null;

  return [
    toTitleCase(activity.status),
    activity.location,
    totalWorkers,
  ].filter(Boolean) as string[];
}

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
  const [report, setReport] = useState<GeneratedSiteReport | null>(null);
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
      const { data, error: fnError } = await backend.functions.invoke(
        "generate-report",
        { body: { notes: notesList } }
      );

      if (fnError) throw fnError;

      const normalizedReport = normalizeGeneratedReportPayload(data);

      if (!normalizedReport) {
        throw new Error("Unexpected response format");
      }

      setReport(normalizedReport);
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

  const resetReport = () => {
    setReport(null);
    setError(null);
  };

  const reportSections: GeneratedReportSection[] = report?.report.sections ?? [];
  const weatherLines = report ? getWeatherLines(report) : [];
  const manpowerLines = report ? getManpowerLines(report.report.manpower) : [];

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
            className="mb-5 flex-row items-center gap-2 self-start rounded-full bg-foreground px-4 py-2 active:opacity-75"
          >
            <ArrowLeft size={16} color="#ffffff" />
            <Text className="text-sm font-semibold text-background">Reports</Text>
          </Pressable>
          <Text className="text-2xl font-bold tracking-tight text-foreground">
            {mode === "review" ? "Review Report" : "New Report"}
          </Text>
          <Text className="mt-1 text-base text-muted-foreground">
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
              <Text className="mt-4 text-center text-base text-muted-foreground">
                {"Record voice notes or type below,\nthen generate your AI report."}
              </Text>
            </View>
          )}

          {mode === "collecting" && notesList.length > 0 && (
            <View className="gap-2">
              {notesList.map((note, i) => (
                <Animated.View
                  key={`note-${i}`}
                  entering={FadeInDown.duration(100)}
                >
                  <View className="flex-row items-start gap-2 rounded-lg bg-secondary p-3">
                    <View className="mt-0.5 h-5 w-5 items-center justify-center rounded-full bg-primary/10">
                      <Text className="text-sm font-semibold text-primary">
                        {i + 1}
                      </Text>
                    </View>
                    <Text className="flex-1 text-base text-foreground">
                      {note}
                    </Text>
                    <Pressable onPress={() => removeNote(i)} hitSlop={8}>
                      <X size={14} color="#6e6e77" />
                    </Pressable>
                  </View>
                </Animated.View>
              ))}

              {/* Generate button */}
              <Animated.View entering={FadeIn}>
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
                  entering={FadeIn}
                  className="h-20 rounded-lg bg-secondary"
                />
              ))}
            </View>
          )}

          {/* ── Error banner ── */}
          {error && (
            <Animated.View entering={FadeIn}>
              <View className="mb-3 rounded-lg bg-destructive/10 p-4">
                <Text className="mb-2 text-base font-medium text-destructive">
                  {error}
                </Text>
                <Button
                  variant="outline"
                  size="sm"
                  onPress={handleGenerate}
                >
                  <View className="flex-row items-center gap-1.5">
                    <RotateCcw size={14} color="#6e6e77" />
                    <Text className="text-base font-semibold text-foreground">
                      Retry
                    </Text>
                  </View>
                </Button>
              </View>
            </Animated.View>
          )}

          {/* ── Review mode ── */}
          {mode === "review" && report && (
            <View className="gap-3">
              <Animated.View entering={FadeInDown.duration(150)}>
                <Card>
                  <View className="mb-3 flex-row items-start justify-between gap-3">
                    <View className="flex-1">
                      <Text className="text-lg font-semibold text-foreground">
                        {report.report.meta.title}
                      </Text>
                      <Text className="mt-1 text-sm text-muted-foreground">
                        {toTitleCase(report.report.meta.reportType)}
                      </Text>
                    </View>
                    <View className="rounded-full bg-primary/10 px-3 py-1">
                      <Text className="text-xs font-semibold uppercase tracking-wide text-primary">
                        Structured
                      </Text>
                    </View>
                  </View>
                  {report.report.meta.visitDate ? (
                    <Text className="mb-2 text-sm text-muted-foreground">
                      Visit date: {report.report.meta.visitDate}
                    </Text>
                  ) : null}
                  <Text className="text-base leading-relaxed text-muted-foreground">
                    {report.report.meta.summary}
                  </Text>
                </Card>
              </Animated.View>

              {weatherLines.length > 0 && (
                <Animated.View entering={FadeInDown.duration(100)}>
                  <Card>
                    <View className="mb-2 flex-row items-center gap-2">
                      <View className="h-8 w-8 items-center justify-center rounded-md bg-primary/10">
                        <Cloud size={16} color="#f47316" />
                      </View>
                      <Text className="text-base font-semibold text-foreground">
                        Weather
                      </Text>
                    </View>
                    <View className="gap-2">
                      {weatherLines.map((line, index) => (
                        <Text
                          key={`weather-${index}`}
                          className="text-base leading-relaxed text-muted-foreground"
                        >
                          {line}
                        </Text>
                      ))}
                    </View>
                  </Card>
                </Animated.View>
              )}

              {manpowerLines.length > 0 && (
                <Animated.View entering={FadeInDown.duration(100)}>
                  <Card>
                    <View className="mb-2 flex-row items-center gap-2">
                      <View className="h-8 w-8 items-center justify-center rounded-md bg-primary/10">
                        <Users size={16} color="#f47316" />
                      </View>
                      <Text className="text-base font-semibold text-foreground">
                        Manpower
                      </Text>
                    </View>
                    <View className="gap-2">
                      {manpowerLines.map((line, index) => (
                        <Text
                          key={`manpower-${index}`}
                          className="text-base leading-relaxed text-muted-foreground"
                        >
                          {line}
                        </Text>
                      ))}
                    </View>
                  </Card>
                </Animated.View>
              )}

              {report.report.siteConditions.length > 0 && (
                <Animated.View entering={FadeInDown.duration(100)}>
                  <Card>
                    <View className="mb-3 flex-row items-center gap-2">
                      <View className="h-8 w-8 items-center justify-center rounded-md bg-primary/10">
                        <HardHat size={16} color="#f47316" />
                      </View>
                      <Text className="text-base font-semibold text-foreground">
                        Site Conditions
                      </Text>
                    </View>
                    <View className="gap-3">
                      {report.report.siteConditions.map((condition, index) => (
                        <View key={`${condition.topic}-${index}`}>
                          <Text className="text-sm font-semibold uppercase tracking-wide text-foreground">
                            {condition.topic}
                          </Text>
                          <Text className="mt-1 text-base leading-relaxed text-muted-foreground">
                            {condition.details}
                          </Text>
                        </View>
                      ))}
                    </View>
                  </Card>
                </Animated.View>
              )}

              {report.report.activities.length > 0 && (
                <View className="gap-3">
                  <Text className="mt-2 text-xs font-semibold uppercase tracking-[1.2px] text-muted-foreground">
                    Activities
                  </Text>
                  {report.report.activities.map((activity, index) => (
                    <Animated.View
                      key={`${activity.name}-${index}`}
                      entering={FadeInDown.duration(100)}
                    >
                      <Card>
                        <View className="mb-3 flex-row items-start justify-between gap-3">
                          <View className="flex-1">
                            <Text className="text-base font-semibold text-foreground">
                              {activity.name}
                            </Text>
                            <View className="mt-2 flex-row flex-wrap gap-2">
                              {getActivitySummaryChips(activity).map((chip) => (
                                <View
                                  key={`${activity.name}-${chip}`}
                                  className="rounded-full bg-secondary px-2.5 py-1"
                                >
                                  <Text className="text-xs font-medium text-secondary-foreground">
                                    {chip}
                                  </Text>
                                </View>
                              ))}
                            </View>
                          </View>
                        </View>

                        <Text className="text-base leading-relaxed text-muted-foreground">
                          {activity.summary}
                        </Text>

                        {getManpowerLines(activity.manpower).length > 0 && (
                          <View className="mt-4 gap-2">
                            <Text className="text-sm font-semibold uppercase tracking-wide text-foreground">
                              Crew
                            </Text>
                            {getManpowerLines(activity.manpower).map((line, itemIndex) => (
                              <Text
                                key={`${activity.name}-crew-${itemIndex}`}
                                className="text-sm leading-relaxed text-muted-foreground"
                              >
                                {line}
                              </Text>
                            ))}
                          </View>
                        )}

                        {activity.materials.length > 0 && (
                          <View className="mt-4 gap-2">
                            <Text className="text-sm font-semibold uppercase tracking-wide text-foreground">
                              Materials
                            </Text>
                            {activity.materials.map((item, itemIndex) => (
                              <View
                                key={`${activity.name}-material-${item.name}-${itemIndex}`}
                                className="rounded-md bg-secondary/60 p-3"
                              >
                                <Text className="text-sm font-semibold text-foreground">
                                  {item.name}
                                </Text>
                                {getItemMeta([
                                  item.quantity,
                                  item.status ? toTitleCase(item.status) : null,
                                  item.notes,
                                ]) ? (
                                  <Text className="mt-1 text-sm leading-relaxed text-muted-foreground">
                                    {getItemMeta([
                                      item.quantity,
                                      item.status ? toTitleCase(item.status) : null,
                                      item.notes,
                                    ])}
                                  </Text>
                                ) : null}
                              </View>
                            ))}
                          </View>
                        )}

                        {activity.equipment.length > 0 && (
                          <View className="mt-4 gap-2">
                            <Text className="text-sm font-semibold uppercase tracking-wide text-foreground">
                              Equipment
                            </Text>
                            {activity.equipment.map((item, itemIndex) => (
                              <View
                                key={`${activity.name}-equipment-${item.name}-${itemIndex}`}
                                className="rounded-md bg-secondary/60 p-3"
                              >
                                <Text className="text-sm font-semibold text-foreground">
                                  {item.name}
                                </Text>
                                {getItemMeta([
                                  item.quantity,
                                  item.status ? toTitleCase(item.status) : null,
                                  item.hoursUsed ? `Hours: ${item.hoursUsed}` : null,
                                  item.notes,
                                ]) ? (
                                  <Text className="mt-1 text-sm leading-relaxed text-muted-foreground">
                                    {getItemMeta([
                                      item.quantity,
                                      item.status ? toTitleCase(item.status) : null,
                                      item.hoursUsed ? `Hours: ${item.hoursUsed}` : null,
                                      item.notes,
                                    ])}
                                  </Text>
                                ) : null}
                              </View>
                            ))}
                          </View>
                        )}

                        {activity.observations.length > 0 && (
                          <View className="mt-4 gap-2">
                            <Text className="text-sm font-semibold uppercase tracking-wide text-foreground">
                              Observations
                            </Text>
                            {activity.observations.map((observation, itemIndex) => (
                              <Text
                                key={`${activity.name}-observation-${itemIndex}`}
                                className="text-sm leading-relaxed text-muted-foreground"
                              >
                                {observation}
                              </Text>
                            ))}
                          </View>
                        )}

                        {activity.issues.length > 0 && (
                          <View className="mt-4 gap-3">
                            <Text className="text-sm font-semibold uppercase tracking-wide text-foreground">
                              Activity Issues
                            </Text>
                            {activity.issues.map((issue, itemIndex) => (
                              <View
                                key={`${activity.name}-issue-${issue.title}-${itemIndex}`}
                                className="rounded-md border border-border p-3"
                              >
                                <Text className="text-sm font-semibold text-foreground">
                                  {issue.title}
                                </Text>
                                <Text className="mt-1 text-sm text-muted-foreground">
                                  {getIssueMeta(issue)}
                                </Text>
                                <Text className="mt-2 text-sm leading-relaxed text-muted-foreground">
                                  {issue.details}
                                </Text>
                                {issue.actionRequired ? (
                                  <Text className="mt-2 text-sm leading-relaxed text-foreground">
                                    Action: {issue.actionRequired}
                                  </Text>
                                ) : null}
                                {formatSourceNotes(issue.sourceNoteIndexes) ? (
                                  <Text className="mt-2 text-xs text-muted-foreground">
                                    {formatSourceNotes(issue.sourceNoteIndexes)}
                                  </Text>
                                ) : null}
                              </View>
                            ))}
                          </View>
                        )}

                        {formatSourceNotes(activity.sourceNoteIndexes) ? (
                          <Text className="mt-4 text-xs text-muted-foreground">
                            {formatSourceNotes(activity.sourceNoteIndexes)}
                          </Text>
                        ) : null}
                      </Card>
                    </Animated.View>
                  ))}
                </View>
              )}

              {report.report.issues.length > 0 && (
                <Animated.View entering={FadeInDown.duration(100)}>
                  <Card>
                    <View className="mb-3 flex-row items-center gap-2">
                      <View className="h-8 w-8 items-center justify-center rounded-md bg-primary/10">
                        <AlertTriangle size={16} color="#f47316" />
                      </View>
                      <Text className="text-base font-semibold text-foreground">
                        Site-wide Issues
                      </Text>
                    </View>
                    <View className="gap-3">
                      {report.report.issues.map((issue, index) => (
                        <View
                          key={`${issue.title}-${index}`}
                          className="rounded-md border border-border p-3"
                        >
                          <Text className="text-sm font-semibold text-foreground">
                            {issue.title}
                          </Text>
                          <Text className="mt-1 text-sm text-muted-foreground">
                            {getIssueMeta(issue)}
                          </Text>
                          <Text className="mt-2 text-sm leading-relaxed text-muted-foreground">
                            {issue.details}
                          </Text>
                          {issue.actionRequired ? (
                            <Text className="mt-2 text-sm leading-relaxed text-foreground">
                              Action: {issue.actionRequired}
                            </Text>
                          ) : null}
                          {formatSourceNotes(issue.sourceNoteIndexes) ? (
                            <Text className="mt-2 text-xs text-muted-foreground">
                              {formatSourceNotes(issue.sourceNoteIndexes)}
                            </Text>
                          ) : null}
                        </View>
                      ))}
                    </View>
                  </Card>
                </Animated.View>
              )}

              {report.report.nextSteps.length > 0 && (
                <Animated.View entering={FadeInDown.duration(100)}>
                  <Card>
                    <View className="mb-3 flex-row items-center gap-2">
                      <View className="h-8 w-8 items-center justify-center rounded-md bg-primary/10">
                        <ClipboardList size={16} color="#f47316" />
                      </View>
                      <Text className="text-base font-semibold text-foreground">
                        Next Steps
                      </Text>
                    </View>
                    <View className="gap-2">
                      {report.report.nextSteps.map((step, index) => (
                        <Text
                          key={`next-step-${index}`}
                          className="text-base leading-relaxed text-muted-foreground"
                        >
                          {step}
                        </Text>
                      ))}
                    </View>
                  </Card>
                </Animated.View>
              )}

              {reportSections.length > 0 && (
                <View className="gap-3">
                  <Text className="mt-2 text-xs font-semibold uppercase tracking-[1.2px] text-muted-foreground">
                    Final Sections
                  </Text>
                  {reportSections.map((block, i) => {
                    const Icon = SECTION_ICONS[block.title] || ClipboardList;
                    const isEditing = editingIndex === i;
                    return (
                      <Animated.View
                        key={`${block.title}-${i}`}
                        entering={FadeInDown.duration(100)}
                      >
                        <Card>
                          <View className="mb-2 flex-row items-center gap-2">
                            <View className="h-8 w-8 items-center justify-center rounded-md bg-primary/10">
                              <Icon size={16} color="#f47316" />
                            </View>
                            <Text className="flex-1 text-base font-semibold text-foreground">
                              {block.title}
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
                              className="min-h-[60px] rounded-md bg-secondary p-2 text-base leading-relaxed text-foreground"
                              onBlur={saveEdit}
                            />
                          ) : (
                            <Pressable onPress={() => startEditing(i)}>
                              <Text className="text-base leading-relaxed text-muted-foreground">
                                {block.content}
                              </Text>
                            </Pressable>
                          )}
                          {formatSourceNotes(block.sourceNoteIndexes) ? (
                            <Text className="mt-3 text-xs text-muted-foreground">
                              {formatSourceNotes(block.sourceNoteIndexes)}
                            </Text>
                          ) : null}
                        </Card>
                      </Animated.View>
                    );
                  })}
                </View>
              )}

              <Animated.View entering={FadeIn} className="gap-2">
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
                    <Text className="text-base font-semibold text-foreground">
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
