/**
 * Camera layout — full-screen modal presentation.
 */
import { Stack } from "expo-router";

export default function CameraLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        presentation: "fullScreenModal",
        animation: "slide_from_bottom",
      }}
    />
  );
}
