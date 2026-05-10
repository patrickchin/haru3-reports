import { Stack } from "expo-router";
import { colors } from "@/lib/design-tokens/colors";

export default function ProjectIdLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.background },
        animation: "simple_push",
        animationDuration: 80,
      }}
    />
  );
}
