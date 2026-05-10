import { Stack } from "expo-router";

/**
 * The camera lives in its own route group because it is launched from
 * many places (report screen, AvatarUploader, future "add icon"). A
 * full-screen modal presentation keeps it visually independent of the
 * caller and lets us lock orientation without leaking that lock into
 * the parent stack.
 */
export default function CameraLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        presentation: "fullScreenModal",
        animation: "slide_from_bottom",
        orientation: "portrait",
        contentStyle: { backgroundColor: "#000000" },
      }}
    />
  );
}
