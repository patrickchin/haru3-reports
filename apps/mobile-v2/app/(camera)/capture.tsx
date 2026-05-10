/**
 * Camera capture screen.
 *
 * Full-screen expo-camera with burst capture support. Returns to caller
 * with array of local URIs via session registry.
 */
import { useState, useRef } from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import { CameraView, useCameraPermissions, CameraType, FlashMode } from "expo-camera";
import { router, useLocalSearchParams } from "expo-router";
import { X, Circle, RotateCw, Zap, ZapOff } from "lucide-react-native";
import { testIds } from "@/infra/test-ids";
import { commitCameraSession } from "@/infra/camera-session-registry";

export default function CaptureScreen() {
  const [permission, requestPermission] = useCameraPermissions();
  const [facing, setFacing] = useState<CameraType>("back");
  const [flash, setFlash] = useState<FlashMode>("off");
  const [capturedUris, setCapturedUris] = useState<string[]>([]);
  const cameraRef = useRef<CameraView>(null);

  const { sessionId } = useLocalSearchParams<{ sessionId?: string }>();

  if (!permission) {
    return <View className="flex-1 bg-black" />;
  }

  if (!permission.granted) {
    return (
      <View className="flex-1 bg-black items-center justify-center p-6">
        <Text className="text-white text-center mb-4">
          Camera permission required
        </Text>
        <Pressable
          onPress={requestPermission}
          className="bg-blue-600 px-6 py-3 rounded-lg"
          testID="btn-camera-permission-action"
        >
          <Text className="text-white font-medium">Grant Permission</Text>
        </Pressable>
      </View>
    );
  }

  const onCapture = async () => {
    if (!cameraRef.current) return;
    try {
      const photo = await cameraRef.current.takePictureAsync({
        quality: 1,
        skipProcessing: false,
      });
      if (photo) {
        setCapturedUris((prev) => [...prev, photo.uri]);
      }
    } catch (err) {
      console.error("Camera capture failed:", err);
    }
  };

  const onToggleFacing = () => {
    setFacing((prev) => (prev === "back" ? "front" : "back"));
  };

  const onToggleFlash = () => {
    setFlash((prev) => {
      if (prev === "off") return "auto";
      if (prev === "auto") return "on";
      return "off";
    });
  };

  const onDone = () => {
    if (sessionId) {
      commitCameraSession(sessionId, capturedUris);
    }
    router.back();
  };

  const onCancel = () => {
    router.back();
  };

  const flashIcon =
    flash === "off" ? (
      <ZapOff size={22} color="#fff" />
    ) : (
      <Zap size={22} color={flash === "on" ? "#fbbf24" : "#fff"} />
    );

  return (
    <View style={StyleSheet.absoluteFill} testID="camera-screen">
      <CameraView
        ref={cameraRef}
        style={StyleSheet.absoluteFill}
        facing={facing}
        flash={flash}
      />

      {/* Top bar */}
      <View className="absolute top-0 left-0 right-0 pt-12 px-4 flex-row justify-between items-center">
        <Pressable
          onPress={onCancel}
          className="w-10 h-10 items-center justify-center"
          testID="btn-camera-cancel"
        >
          <X size={28} color="#fff" />
        </Pressable>
        <View className="flex-row gap-4 items-center">
          <Pressable
            onPress={onToggleFlash}
            className="flex-row items-center gap-1"
            testID={testIds.camera.flashButton}
          >
            {flashIcon}
            <Text className="text-white text-xs font-medium uppercase">
              {flash}
            </Text>
          </Pressable>
          <Pressable
            onPress={onToggleFacing}
            className="w-10 h-10 items-center justify-center"
            testID="btn-camera-flip"
          >
            <RotateCw size={24} color="#fff" />
          </Pressable>
        </View>
      </View>

      {/* Bottom bar */}
      <View className="absolute bottom-0 left-0 right-0 pb-12 px-4 items-center">
        <Text
          className="text-white mb-4 text-sm font-medium"
          testID={testIds.camera.countLabel}
        >
          {capturedUris.length === 0
            ? "No photos"
            : `${capturedUris.length} photo${capturedUris.length > 1 ? "s" : ""}`}
        </Text>
        <View className="flex-row gap-6 items-center">
          {capturedUris.length > 0 && (
            <Pressable
              onPress={onDone}
              className="bg-blue-600 px-6 py-3 rounded-lg"
              testID="btn-camera-done"
            >
              <Text className="text-white font-medium">Done</Text>
            </Pressable>
          )}
          <Pressable
            onPress={onCapture}
            className="w-16 h-16 border-4 border-white rounded-full items-center justify-center"
            testID="btn-camera-capture"
          >
            <Circle size={48} color="#fff" fill="#fff" />
          </Pressable>
        </View>
      </View>
    </View>
  );
}
