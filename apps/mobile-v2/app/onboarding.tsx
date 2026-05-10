import { View } from "react-native";
import { OnboardingScreen } from "@/features/auth/onboarding-screen";
import { testIds } from "@/infra/test-ids";

export default function OnboardingPage() {
  return (
    <View testID={testIds.auth.onboardingScreen} style={{ flex: 1 }}>
      <OnboardingScreen />
    </View>
  );
}
