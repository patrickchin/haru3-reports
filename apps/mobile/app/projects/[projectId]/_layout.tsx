import { Stack } from "expo-router";

export default function ProjectIdLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: "#ffffff" },
        animation: "ios",
      }}
    />
  );
}
