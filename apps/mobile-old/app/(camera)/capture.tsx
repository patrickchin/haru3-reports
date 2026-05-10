import { useCallback, useRef, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import {
  CameraView,
  useCameraPermissions,
  type CameraCapturedPicture,
  type CameraType,
  type FlashMode,
} from "expo-camera";
import { File } from "expo-file-system";
import {
  Camera as CameraIcon,
  RefreshCw,
  X,
  Zap,
  ZapOff,
} from "lucide-react-native";
import { AppDialogSheet } from "@/components/ui/AppDialogSheet";
import { Button } from "@/components/ui/Button";
import { commitCameraSession } from "@/lib/camera-session-registry";
import { colors } from "@/lib/design-tokens/colors";

const MAX_BURST = 20;

interface Capture {
  uri: string;
  width: number;
  height: number;
}

/**
 * Full-screen burst capture modal. UI per docs/10-media-pipeline.md §B.
 *
 * The screen owns no upload logic — its single output is a `string[]` of
 * local file URIs, posted back to the caller via `commitCameraSession`.
 * That keeps the screen reusable from any caller (report, avatar, …)
 * without coupling it to project/report ids.
 */
export default function CaptureScreen() {
  const router = useRouter();
  const { sessionId } = useLocalSearchParams<{ sessionId?: string }>();

  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef = useRef<CameraView>(null);

  const [facing, setFacing] = useState<CameraType>("back");
  const [flash, setFlash] = useState<FlashMode>("off");
  const [captures, setCaptures] = useState<Capture[]>([]);
  const [isCapturing, setIsCapturing] = useState(false);
  const [confirmDiscardOpen, setConfirmDiscardOpen] = useState(false);

  const handleCapture = useCallback(async () => {
    if (isCapturing || !cameraRef.current) return;
    if (captures.length >= MAX_BURST) return;
    setIsCapturing(true);
    try {
      const photo: CameraCapturedPicture | undefined =
        await cameraRef.current.takePictureAsync({
          quality: 0.9,
          skipProcessing: false,
          exif: false,
          imageType: "jpg",
        });
      if (photo?.uri) {
        setCaptures((prev) => [
          ...prev,
          { uri: photo.uri, width: photo.width, height: photo.height },
        ]);
      }
    } catch {
      // Swallow — a single bad shot shouldn't kill the screen. The user
      // can simply press the shutter again.
    } finally {
      setIsCapturing(false);
    }
  }, [captures.length, isCapturing]);

  const handleRemove = useCallback((uri: string) => {
    setCaptures((prev) => prev.filter((c) => c.uri !== uri));
    // Best-effort cache cleanup; ignore errors (file may already be gone
    // or live outside our managed cache root on some platforms).
    try {
      new File(uri).delete();
    } catch {
      // ignore
    }
  }, []);

  const handleDone = useCallback(() => {
    if (sessionId) {
      commitCameraSession(
        sessionId,
        captures.map((c) => c.uri),
      );
    }
    router.back();
  }, [captures, router, sessionId]);

  const discardAndClose = useCallback(() => {
    for (const c of captures) {
      try {
        new File(c.uri).delete();
      } catch {
        // ignore
      }
    }
    setConfirmDiscardOpen(false);
    router.back();
  }, [captures, router]);

  const handleCancel = useCallback(() => {
    if (captures.length > 0) {
      setConfirmDiscardOpen(true);
      return;
    }
    router.back();
  }, [captures.length, router]);

  // ── Permission gates ────────────────────────────────────────────────

  if (!permission) {
    return (
      <View style={[styles.container, styles.center]}>
        <ActivityIndicator color="#ffffff" />
      </View>
    );
  }

  if (!permission.granted) {
    const canAskAgain = permission.canAskAgain;
    return (
      <SafeAreaView style={[styles.container, styles.center]}>
        <View style={styles.permissionInner}>
          <CameraIcon size={48} color="#ffffff" />
          <Text style={styles.permissionTitle}>Camera access is off</Text>
          <Text style={styles.permissionBody}>
            Allow camera access to capture site photos for your reports.
          </Text>
          <View style={styles.permissionActions}>
            <Button
              testID="btn-camera-permission-action"
              onPress={() =>
                canAskAgain ? requestPermission() : Linking.openSettings()
              }
            >
              {canAskAgain ? "Allow camera" : "Open Settings"}
            </Button>
            <Pressable
              accessibilityRole="button"
              onPress={() => router.back()}
              style={styles.permissionCancel}
              testID="btn-camera-permission-cancel"
            >
              <Text style={styles.permissionCancelText}>Cancel</Text>
            </Pressable>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  // ── Camera UI ───────────────────────────────────────────────────────

  const flashIcon =
    flash === "off" ? (
      <ZapOff size={22} color="#ffffff" />
    ) : (
      <Zap size={22} color={flash === "on" ? colors.accent.DEFAULT : "#ffffff"} />
    );
  const nextFlash: FlashMode =
    flash === "off" ? "auto" : flash === "auto" ? "on" : "off";

  return (
    <View style={styles.container}>
      <CameraView
        ref={cameraRef}
        style={StyleSheet.absoluteFill}
        facing={facing}
        flash={flash}
        mode="picture"
        pictureSize="1920x1080"
        responsiveOrientationWhenOrientationLocked={false}
      />

      <SafeAreaView style={styles.overlay} pointerEvents="box-none">
        {/* Top bar */}
        <View style={styles.topBar}>
          <Pressable
            onPress={handleCancel}
            accessibilityRole="button"
            accessibilityLabel="Cancel"
            testID="btn-camera-cancel"
            style={styles.iconButton}
          >
            <X size={24} color="#ffffff" />
          </Pressable>
          <Pressable
            onPress={() => setFlash(nextFlash)}
            accessibilityRole="button"
            accessibilityLabel={`Flash ${flash}`}
            testID="btn-camera-flash"
            style={styles.iconButton}
          >
            {flashIcon}
            <Text style={styles.flashLabel}>{flash}</Text>
          </Pressable>
        </View>

        <View style={{ flex: 1 }} />

        {/* Thumbnail strip + flip */}
        <View style={styles.stripRow}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.stripContent}
            style={styles.strip}
          >
            {captures.map((c, idx) => (
              <Pressable
                key={c.uri}
                onPress={() => handleRemove(c.uri)}
                accessibilityRole="button"
                accessibilityLabel={`Remove photo ${idx + 1}`}
                testID={`btn-camera-thumb-${idx}`}
                style={styles.thumbWrap}
              >
                <Image source={{ uri: c.uri }} style={styles.thumb} />
              </Pressable>
            ))}
          </ScrollView>
          <Pressable
            onPress={() => setFacing((f) => (f === "back" ? "front" : "back"))}
            accessibilityRole="button"
            accessibilityLabel="Flip camera"
            testID="btn-camera-flip"
            style={[styles.iconButton, styles.flipButton]}
          >
            <RefreshCw size={22} color="#ffffff" />
          </Pressable>
        </View>

        {/* Shutter */}
        <View style={styles.shutterRow}>
          <Pressable
            onPress={handleCapture}
            disabled={isCapturing || captures.length >= MAX_BURST}
            accessibilityRole="button"
            accessibilityLabel="Take photo"
            testID="btn-camera-shutter"
            style={({ pressed }) => [
              styles.shutter,
              (pressed || isCapturing) && styles.shutterPressed,
              captures.length >= MAX_BURST && styles.shutterDisabled,
            ]}
          >
            <View style={styles.shutterInner} />
          </Pressable>
        </View>

        {/* Bottom action bar */}
        <View style={styles.bottomBar}>
          <Text style={styles.countLabel} testID="lbl-camera-count">
            {captures.length === 0
              ? "No photos"
              : `${captures.length} photo${captures.length === 1 ? "" : "s"}`}
            {captures.length >= MAX_BURST ? " (max)" : ""}
          </Text>
          <Button
            onPress={handleDone}
            disabled={captures.length === 0}
            testID="btn-camera-done"
          >
            Done
          </Button>
        </View>
      </SafeAreaView>

      <AppDialogSheet
        visible={confirmDiscardOpen}
        title="Discard photos?"
        message={`You have ${captures.length} unsaved photo${captures.length === 1 ? "" : "s"}.`}
        onClose={() => setConfirmDiscardOpen(false)}
        actions={[
          {
            label: "Keep editing",
            onPress: () => setConfirmDiscardOpen(false),
            variant: "secondary",
          },
          {
            label: "Discard",
            onPress: discardAndClose,
            variant: "destructive",
            testID: "btn-camera-confirm-discard",
          },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#000000" },
  center: { alignItems: "center", justifyContent: "center" },
  overlay: { ...StyleSheet.absoluteFillObject, justifyContent: "flex-end" },
  topBar: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 56,
    paddingHorizontal: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "rgba(0,0,0,0.35)",
  },
  iconButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.35)",
  },
  flashLabel: {
    color: "#ffffff",
    fontSize: 9,
    marginTop: 2,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  stripRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingBottom: 8,
    gap: 8,
  },
  strip: { flexGrow: 0, flexShrink: 1 },
  stripContent: { gap: 6, alignItems: "center" },
  thumbWrap: {
    width: 56,
    height: 56,
    borderRadius: 8,
    overflow: "hidden",
    borderWidth: 2,
    borderColor: "#ffffff",
  },
  thumb: { width: "100%", height: "100%" },
  flipButton: { marginLeft: "auto" },
  shutterRow: { alignItems: "center", paddingVertical: 12 },
  shutter: {
    width: 78,
    height: 78,
    borderRadius: 39,
    borderWidth: 4,
    borderColor: "#ffffff",
    alignItems: "center",
    justifyContent: "center",
  },
  shutterInner: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: "#ffffff",
  },
  shutterPressed: { opacity: 0.7 },
  shutterDisabled: { opacity: 0.4 },
  bottomBar: {
    paddingHorizontal: 16,
    paddingBottom: 16,
    paddingTop: 4,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  countLabel: { color: "#ffffff", fontSize: 14, fontWeight: "500" },
  permissionInner: { paddingHorizontal: 32, alignItems: "center", gap: 16 },
  permissionTitle: {
    color: "#ffffff",
    fontSize: 20,
    fontWeight: "700",
    marginTop: 8,
    textAlign: "center",
  },
  permissionBody: {
    color: "#d6d3cc",
    fontSize: 15,
    textAlign: "center",
    lineHeight: 21,
  },
  permissionActions: { marginTop: 16, gap: 8, alignSelf: "stretch" },
  permissionCancel: { paddingVertical: 12, alignItems: "center" },
  permissionCancelText: { color: "#ffffff", fontSize: 15 },
});
