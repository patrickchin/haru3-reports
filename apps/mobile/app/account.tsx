import {
  View,
  ScrollView,
  ActivityIndicator,
  RefreshControl,
} from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Input } from "@/components/ui/Input";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { InlineNotice } from "@/components/ui/InlineNotice";
import { AvatarUploader } from "@/components/account/AvatarUploader";
import { useAuth } from "@/lib/auth";
import { useRefresh } from "@/hooks/useRefresh";

export default function AccountScreen() {
  const router = useRouter();
  const { profile } = useAuth();
  const { refreshing, onRefresh } = useRefresh([]);

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

        <View className="flex-1">
          <ScrollView
            className="flex-1 px-5"
            contentContainerStyle={{ gap: 20 }}
            refreshControl={
              <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
            }
          >
            <View className="items-center pt-2">
              <AvatarUploader />
            </View>
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
        </View>
      </View>
    </SafeAreaView>
  );
}
