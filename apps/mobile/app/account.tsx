import {
  View,
  ScrollView,
  ActivityIndicator,
} from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import Animated, { FadeInDown } from "react-native-reanimated";
import { Input } from "@/components/ui/Input";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { InlineNotice } from "@/components/ui/InlineNotice";
import { useAuth } from "@/lib/auth";

export default function AccountScreen() {
  const router = useRouter();
  const { profile } = useAuth();

  if (!profile) {
    return (
      <SafeAreaView className="flex-1 bg-background">
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color="#1a1a2e" />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-background">
      <View className="flex-1">
        <View className="px-5 py-4">
          <ScreenHeader
            title="Account Details"
            onBack={() => router.back()}
            backLabel="Profile"
          />
        </View>

        <Animated.View entering={FadeInDown.duration(200)} className="flex-1">
          <ScrollView
            className="flex-1 px-5"
            contentContainerStyle={{ gap: 20 }}
          >
            <InlineNotice tone="info">
              Phone numbers are managed through sign-in. Contact support if you need to recover access to a different number.
            </InlineNotice>
            <Input
              label="Phone"
              value={profile.phone}
              editable={false}
            />
            <Input
              label="Full Name"
              value={profile.full_name ?? ""}
              editable={false}
            />
            <Input
              label="Company Name"
              value={profile.company_name ?? ""}
              editable={false}
            />
          </ScrollView>
        </Animated.View>
      </View>
    </SafeAreaView>
  );
}
