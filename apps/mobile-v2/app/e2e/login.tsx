import { Text, View } from "react-native";
import { Screen } from "@/shared/components/Screen";

/**
 * Dev-only deep-link for E2E login bypass.
 * Gated by __DEV__ && EXPO_PUBLIC_ENABLE_DEV_PHONE_AUTH.
 *
 * TODO Phase 1: Implement dev login flow
 */
export default function E2ELoginScreen() {
  if (!__DEV__) {
    throw new Error("E2E login route accessed in production");
  }

  return (
    <Screen>
      <View className="flex-1 items-center justify-center px-6">
        <Text className="text-title text-foreground mb-4">
          E2E Login (TODO)
        </Text>
        <Text className="text-body text-muted-foreground text-center">
          Dev-only deep-link login bypass will be implemented in Phase 1
        </Text>
      </View>
    </Screen>
  );
}
