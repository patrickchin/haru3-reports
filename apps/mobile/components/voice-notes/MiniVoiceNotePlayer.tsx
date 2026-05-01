/**
 * Floating "now playing" bar for voice notes.
 *
 * Mounted once at the root layout, just above the bottom safe-area /
 * tab bar. Hidden when nothing is playing. Shows the author + short id
 * of the active voice note, a play/pause control, and a close button
 * that fully unloads the player. Designed to be the single in-app
 * surface that always tells the user what audio is currently playing
 * regardless of which screen they're on.
 */
import { View, Text, Pressable, ActivityIndicator } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Play, Pause, X } from "lucide-react-native";
import { useAudioPlayback } from "@/lib/audio/AudioPlaybackProvider";
import { colors } from "@/lib/design-tokens/colors";

const BOTTOM_GAP = 8;

export function MiniVoiceNotePlayer() {
  const insets = useSafeAreaInsets();
  const {
    activeStoragePath,
    activeFile,
    activeAuthorName,
    isPlaying,
    isLoading,
    isDownloading,
    positionMs,
    durationMs,
    pause,
    resume,
    stop,
  } = useAudioPlayback();

  if (!activeStoragePath) return null;

  const title = activeAuthorName?.trim() || "Voice note";
  const shortId = activeFile?.id.slice(0, 8) ?? null;
  const progressRatio =
    durationMs > 0 ? Math.min(positionMs / durationMs, 1) : 0;

  const handleTogglePlay = () => {
    if (isPlaying) pause();
    else void resume();
  };

  return (
    <View
      pointerEvents="box-none"
      style={{
        position: "absolute",
        left: 12,
        right: 12,
        bottom: insets.bottom + BOTTOM_GAP,
      }}
      testID="mini-voice-note-player"
    >
      <View
        className="flex-row items-center gap-3 rounded-2xl border border-border bg-card px-3 py-2"
        style={{
          shadowColor: colors.surface.shadow,
          shadowOffset: { width: 0, height: 4 },
          shadowOpacity: 0.12,
          shadowRadius: 12,
          elevation: 6,
        }}
      >
        <Pressable
          onPress={handleTogglePlay}
          disabled={isLoading}
          accessibilityRole="button"
          accessibilityLabel={isPlaying ? "Pause voice note" : "Resume voice note"}
          testID="btn-mini-player-toggle"
          className="h-9 w-9 items-center justify-center rounded-full bg-primary"
        >
          {isLoading ? (
            <ActivityIndicator size="small" color={colors.primary.foreground} />
          ) : isPlaying ? (
            <Pause size={16} color={colors.primary.foreground} />
          ) : (
            <Play size={16} color={colors.primary.foreground} />
          )}
        </Pressable>

        <View className="min-w-0 flex-1">
          <Text
            numberOfLines={1}
            className="text-sm font-semibold text-foreground"
          >
            {title}
          </Text>
          <View className="mt-1 flex-row items-center gap-2">
            <View className="h-1 min-w-0 flex-1 overflow-hidden rounded-full bg-muted">
              <View
                className="h-full rounded-full bg-primary"
                style={{ width: `${progressRatio * 100}%` }}
              />
            </View>
            <Text className="text-[10px] text-muted-foreground">
              {isDownloading
                ? "Downloading"
                : `${formatDuration(positionMs)} / ${formatDuration(durationMs)}`}
              {shortId ? ` · ${shortId}` : ""}
            </Text>
          </View>
        </View>

        <Pressable
          onPress={stop}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Close voice note player"
          testID="btn-mini-player-close"
          className="h-8 w-8 items-center justify-center rounded-md"
        >
          <X size={16} color={colors.muted.foreground} />
        </Pressable>
      </View>
    </View>
  );
}

function formatDuration(ms: number): string {
  const totalSeconds = Math.max(0, Math.round(ms / 1000));
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}
