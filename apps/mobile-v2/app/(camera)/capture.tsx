/**
 * Camera capture screen.
 *
 * Full-screen expo-camera with burst capture support. Returns to caller
 * with array of local URIs via router params or session registry.
 */
import { useState, useRef } from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import { CameraView, useCameraPermissions, CameraType } from "expo-camera";
import { router, useLocalSearchParams } from "expo-router";
import { X, Circle, RotateCw } from "lucide-react-native";
import { testIds } from "@/infra/test-ids";

export default function CaptureScreen() {
  const [permission, requestPermission] = useCameraPermissions();
  const [facing, setFacing] = useState<CameraType>("back");
  const [capturedUris, setCapturedUris] = useState<string[]>([]);
  const cameraRef = useRef<CameraView>(null);

  const { returnTo } = useLocalSearchParams<{ returnTo?: string }>();

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
          testID={testIds.camera.requestPermissionButton}
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

  const onDone = () => {
    // TODO: Hand off URIs via session registry or router params
    // For now, just go back
    if (returnTo) {
      router.push(returnTo as any);
    } else {
      router.back();
    }
  };

  const onCancel = () => {
    router.back();
  };

  return (
    <View style={StyleSheet.absoluteFill} testID={testIds.camera.screen}>
      <CameraView
        ref={cameraRef}
        style={StyleSheet.absoluteFill}
        facing={facing}
      />

      {/* Top bar */}
      <View className="absolute top-0 left-0 right-0 pt-12 px-4 flex-row justify-between items-center">
        <Pressable
          onPress={onCancel}
          className="w-10 h-10 items-center justify-center"
          testID={testIds.camera.closeButton}
        >
          <X size={28} color="#fff" />
        </Pressable>
        <Pressable
          onPress={onToggleFacing}
          className="w-10 h-10 items-center justify-center"
          testID={testIds.camera.flipButton}
        >
          <RotateCw size={24} color="#fff" />
        </Pressable>
      </View>

      {/* Bottom bar */}
      <View className="absolute bottom-0 left-0 right-0 pb-12 px-4 items-center">
        {capturedUris.length > 0 && (
          <Text className="text-white mb-4">
            {capturedUris.length} photo{capturedUris.length > 1 ? "s" : ""}{" "}
            captured
          </Text>
        )}
        <View className="flex-row gap-6 items-center">
          {capturedUris.length > 0 && (
            <Pressable
              onPress={onDone}
              className="bg-blue-600 px-6 py-3 rounded-lg"
              testID={testIds.camera.doneButton}
            >
              <Text className="text-white font-medium">Done</Text>
            </Pressable>
          )}
          <Pressable
            onPress={onCapture}
            className="w-16 h-16 border-4 border-white rounded-full items-center justify-center"
            testID={testIds.camera.captureButton}
          >
            <Circle size={48} color="#fff" fill="#fff" />
          </Pressable>
        </View>
      </View>
    </View>
  );
}
