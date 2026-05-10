import { View, Text } from "react-native";
import { Link, Stack } from "expo-router";
import { SafeAreaView } from "@/components/ui/SafeAreaView";

export default function NotFoundScreen() {
  return (
    <>
      <Stack.Screen options={{ title: "Not Found" }} />
      <SafeAreaView className="flex-1 items-center justify-center bg-background px-6">
        <Text className="text-6xl font-bold text-muted-foreground">404</Text>
        <Text className="mt-4 text-xl text-foreground">Page not found</Text>
        <Link href="/" className="mt-6">
          <Text className="text-lg font-semibold text-primary">
            Go to Home
          </Text>
        </Link>
      </SafeAreaView>
    </>
  );
}
