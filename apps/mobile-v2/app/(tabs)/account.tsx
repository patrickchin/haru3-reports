import { Text, View } from "react-native";
import { Screen } from "@/shared/components/Screen";
import { Button } from "@/shared/components/Button";
import { useAuth } from "@/features/auth";

export default function AccountScreen() {
  const { profile, signOut } = useAuth();

  return (
    <Screen>
      <View className="flex-1 px-6 py-8">
        <Text className="text-title text-foreground mb-2">Account</Text>
        {profile && (
          <View className="mb-6">
            <Text className="text-body text-foreground">
              {profile.full_name}
            </Text>
            <Text className="text-body text-muted-foreground">
              {profile.company_name}
            </Text>
            <Text className="text-body text-muted-foreground">
              {profile.phone}
            </Text>
          </View>
        )}
        <Button variant="destructive" onPress={signOut}>
          <Text className="text-body text-primary-foreground font-semibold">
            Sign Out
          </Text>
        </Button>
      </View>
    </Screen>
  );
}
