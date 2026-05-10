import { View, Text, ScrollView } from "react-native";
import { useRouter } from "expo-router";
import { ArrowLeft } from "lucide-react-native";
import { Screen } from "@/shared/components/Screen";
import { Card } from "@/shared/components/Card";
import { Button } from "@/shared/components/Button";
import { useAuth } from "@/features/auth";
import { ProfileForm } from "@/features/account/profile-form";
import { colors } from "@/design-tokens/colors";
import { testIds } from "@/infra/test-ids";

export default function ProfileScreen() {
  const router = useRouter();
  const { profile } = useAuth();

  const handleSuccess = () => {
    router.back();
  };

  return (
    <Screen testID={testIds.profile.screen}>
      <View className="flex-1">
        <View className="px-6 py-4">
          <Button variant="ghost" onPress={() => router.back()}>
            <View className="flex-row items-center gap-2">
              <ArrowLeft size={20} color={colors.foreground} />
              <Text className="text-body text-foreground">Back</Text>
            </View>
          </Button>
        </View>

        <ScrollView className="flex-1 px-6">
          <Text className="text-title text-foreground mb-6">Edit Profile</Text>

          {/* TODO: Avatar upload */}
          <Card className="mb-6 items-center py-8" testID="btn-avatar-upload">
            <Text className="text-body text-muted-foreground">
              Avatar upload coming soon
            </Text>
          </Card>

          {profile && (
            <ProfileForm profile={profile} onSuccess={handleSuccess} />
          )}
        </ScrollView>
      </View>
    </Screen>
  );
}
