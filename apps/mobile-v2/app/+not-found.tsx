import { Link, Stack } from "expo-router";
import { Text, View } from "react-native";

export default function NotFoundScreen() {
  return (
    <>
      <Stack.Screen options={{ title: "Not Found" }} />
      <View className="flex-1 items-center justify-center bg-background px-6">
        <Text className="text-title text-foreground mb-4">
          Screen not found
        </Text>
        <Link href="/" className="text-body text-accent">
          Go back home
        </Link>
      </View>
    </>
  );
}
