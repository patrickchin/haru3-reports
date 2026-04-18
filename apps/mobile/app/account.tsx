import {
  View,
  Text,
  Pressable,
  ScrollView,
  ActivityIndicator,
} from "react-native";
import { useRouter } from "expo-router";
import { ArrowLeft } from "lucide-react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Animated, { FadeInDown } from "react-native-reanimated";
import { Input } from "@/components/ui/Input";
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
          <Pressable
            onPress={() => router.back()}
            className="mb-5 flex-row items-center gap-2 self-start border border-foreground px-4 py-2 active:opacity-75"
            accessibilityRole="button"
            accessibilityLabel="Go back"
          >
            <ArrowLeft size={16} color="#1a1a2e" />
            <Text className="text-sm font-semibold uppercase tracking-wider text-foreground">
              Back
            </Text>
          </Pressable>
          <Text className="text-3xl font-bold tracking-tight text-foreground">
            Account Details
          </Text>
        </View>

        <Animated.View entering={FadeInDown.duration(150)} className="flex-1">
          <ScrollView
            className="flex-1 px-5"
            contentContainerStyle={{ gap: 20 }}
          >
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
