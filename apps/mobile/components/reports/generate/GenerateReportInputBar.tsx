import { Pressable, Text, TextInput, View } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
  Easing,
} from "react-native-reanimated";
import { useEffect } from "react";
import { Camera, Mic, MicOff, Paperclip, Plus } from "lucide-react-native";
import { Button } from "@/components/ui/Button";
import { InlineNotice } from "@/components/ui/InlineNotice";
import { LiveWaveform } from "@/components/ui/LiveWaveform";
import { colors } from "@/lib/design-tokens/colors";

interface GenerateReportInputBarProps {
  currentInput: string;
  onChangeInput: (text: string) => void;
  onSubmit: () => void;
  isRecording: boolean;
  amplitude: number;
  interimTranscript: string;
  speechError: string | null;
  onToggleRecording: () => void;
  onCameraCapture: () => void;
  onOpenAttachmentSheet: () => void;
}

export function GenerateReportInputBar({
  currentInput,
  onChangeInput,
  onSubmit,
  isRecording,
  amplitude,
  interimTranscript,
  speechError,
  onToggleRecording,
  onCameraCapture,
  onOpenAttachmentSheet,
}: GenerateReportInputBarProps) {
  // Pulse animation for recording
  const pulseScale = useSharedValue(1);
  const pulseOpacity = useSharedValue(0.6);

  useEffect(() => {
    if (isRecording) {
      pulseScale.value = withRepeat(
        withTiming(1.5, { duration: 1000, easing: Easing.out(Easing.ease) }),
        -1,
        false,
      );
      pulseOpacity.value = withRepeat(
        withTiming(0, { duration: 1000, easing: Easing.out(Easing.ease) }),
        -1,
        false,
      );
    } else {
      pulseScale.value = 1;
      pulseOpacity.value = 0.6;
    }
  }, [isRecording, pulseScale, pulseOpacity]);

  const pulseStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pulseScale.value }],
    opacity: pulseOpacity.value,
  }));

  return (
    <View className="border-t border-border bg-background px-5 py-3">
      {speechError && (
        <InlineNotice tone="danger" className="mb-2">
          {speechError}
        </InlineNotice>
      )}
      <View className="flex-row items-stretch gap-3">
        <View
          testID={isRecording ? "input-note-recording" : "input-note-container"}
          accessible={isRecording}
          accessibilityRole={isRecording ? "text" : undefined}
          accessibilityLabel={
            isRecording
              ? interimTranscript
                ? `Recording voice note. ${interimTranscript}`
                : "Recording voice note. Listening."
              : undefined
          }
          accessibilityHint={
            isRecording ? "Tap the stop button to finish recording." : undefined
          }
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
                onPress={onOpenAttachmentSheet}
                hitSlop={8}
                testID="btn-attachment"
                accessibilityRole="button"
                accessibilityLabel="Add attachment"
                className="min-h-[44px] items-center justify-center"
              >
                <Paperclip size={20} color={colors.muted.foreground} />
              </Pressable>
              <TextInput
                testID="input-note"
                value={currentInput}
                onChangeText={onChangeInput}
                placeholder="Type a site note..."
                placeholderTextColor={colors.muted.foreground}
                className="min-h-[44px] flex-1 text-base text-foreground"
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
            onPress={onSubmit}
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
              onPress={onCameraCapture}
              disabled={isRecording}
              testID="btn-camera-capture"
              accessibilityRole="button"
              accessibilityLabel="Take photo"
            >
              <View className="min-h-[68px] min-w-[68px] items-center justify-center rounded-xl border border-border bg-card px-3">
                <View className="items-center gap-1">
                  <Camera size={24} color={colors.foreground} />
                  <Text className="text-xs font-semibold text-foreground">
                    Photo
                  </Text>
                </View>
              </View>
            </Pressable>
            <Pressable
              onPress={onToggleRecording}
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
                      backgroundColor: colors.primary.alpha30,
                    },
                    pulseStyle,
                  ]}
                />
              )}
              <View
                className={`min-h-[68px] min-w-[68px] items-center justify-center rounded-xl px-3 ${
                  isRecording ? "bg-destructive" : "border border-border bg-card"
                }`}
              >
                <View className="items-center gap-1">
                  {isRecording ? (
                    <>
                      <MicOff size={24} color={colors.destructive.foreground} />
                      <Text className="text-xs font-semibold text-destructive-foreground">
                        Stop
                      </Text>
                    </>
                  ) : (
                    <>
                      <Mic size={24} color={colors.foreground} />
                      <Text className="text-xs font-semibold text-foreground">
                        Voice
                      </Text>
                    </>
                  )}
                </View>
              </View>
            </Pressable>
          </>
        )}
      </View>
    </View>
  );
}
