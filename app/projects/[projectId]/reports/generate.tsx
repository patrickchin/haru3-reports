import { useState, useEffect } from "react";
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
  Send,
  Cloud,
  Users,
  TrendingUp,
  AlertTriangle,
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
import { MOCK_GENERATED_REPORT } from "@/constants/mock-data";

const SECTION_ICONS: Record<string, React.ComponentType<{ size: number; color: string }>> = {
  Weather: Cloud,
  Manpower: Users,
  Progress: TrendingUp,
  Issues: AlertTriangle,
};

type ReportSection = { section: string; content: string };

export default function GenerateReportScreen() {
  const router = useRouter();
  const { projectId } = useLocalSearchParams<{ projectId: string }>();
  const [isRecording, setIsRecording] = useState(false);
  const [notes, setNotes] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [report, setReport] = useState<ReportSection[] | null>(null);

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

  const toggleRecording = () => {
    setIsRecording(!isRecording);
    if (isRecording) {
      setNotes((prev) =>
        prev
          ? prev +
            " Poured concrete on third floor section B today. 12 people on site. Crane two needs maintenance."
          : "Poured concrete on third floor section B today. 12 people on site. Crane two needs maintenance."
      );
    }
  };

  const handleGenerate = () => {
    if (!notes.trim()) return;
    setIsGenerating(true);
    setTimeout(() => {
      setIsGenerating(false);
      setReport(MOCK_GENERATED_REPORT);
    }, 2000);
  };

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
            New Report
          </Text>
          <Text className="mt-1 text-sm text-muted-foreground">
            Ready for today's log?
          </Text>
        </View>

        {/* Content area */}
        <ScrollView
          className="flex-1 px-5"
          contentContainerStyle={{ paddingBottom: 100 }}
          keyboardShouldPersistTaps="handled"
        >
          {!report && !isGenerating && (
            <View className="items-center justify-center py-20">
              <View className="h-16 w-16 items-center justify-center rounded-2xl bg-secondary">
                <Mic size={28} color="#6e6e77" />
              </View>
              <Text className="mt-4 text-center text-sm text-muted-foreground">
                {"Record voice notes or type below,\nthen generate your AI report."}
              </Text>
            </View>
          )}

          {isGenerating && (
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

          {report && !isGenerating && (
            <View className="gap-3">
              {report.map((block, i) => {
                const Icon = SECTION_ICONS[block.section] || Cloud;
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
                        <Text className="text-sm font-semibold text-foreground">
                          {block.section}
                        </Text>
                      </View>
                      <Text className="text-sm leading-relaxed text-muted-foreground">
                        {block.content}
                      </Text>
                    </Card>
                  </Animated.View>
                );
              })}

              <Animated.View entering={FadeIn.delay(500)}>
                <Button
                  variant="hero"
                  size="xl"
                  className="mt-4 w-full"
                  onPress={() => router.back()}
                >
                  Save Report
                </Button>
              </Animated.View>
            </View>
          )}
        </ScrollView>

        {/* Fixed bottom input bar */}
        <View className="border-t border-border bg-background px-5 py-3">
          <View className="flex-row items-end gap-2">
            <TextInput
              value={notes}
              onChangeText={setNotes}
              placeholder="Type or record site notes..."
              placeholderTextColor="#6e6e77"
              className="min-h-11 flex-1 rounded-lg bg-secondary px-4 py-2 text-sm text-foreground"
              multiline={true}
            />

            {!notes.trim() ? (
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
            ) : (
              <Button
                size="icon"
                onPress={handleGenerate}
                disabled={isGenerating}
              >
                <Send size={16} color="#ffffff" />
              </Button>
            )}
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
