import "../global.css";

import { Stack } from "expo-router";
import { ActivityIndicator, View } from "react-native";
import { useEffect } from "react";
import { StatusBar } from "expo-status-bar";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import {
  usePathname,
  useRootNavigationState,
  useRouter,
} from "expo-router";
import { AuthProvider, useAuth } from "@/lib/auth";

const queryClient = new QueryClient();

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <StatusBar style="dark" />
          <AuthNavigation />
        </AuthProvider>
      </QueryClientProvider>
    </GestureHandlerRootView>
  );
}

function AuthNavigation() {
  const pathname = usePathname();
  const navigationState = useRootNavigationState();
  const router = useRouter();
  const { session, isLoading } = useAuth();

  useEffect(() => {
    if (!navigationState?.key || isLoading) {
      return;
    }

    const isAuthScreen = pathname === "/";

    if (!session && !isAuthScreen) {
      router.replace("/");
      return;
    }

    if (session && isAuthScreen) {
      router.replace("/(tabs)/projects");
    }
  }, [session, isLoading]);

  if (isLoading) {
    return (
      <View className="flex-1 items-center justify-center bg-background">
        <ActivityIndicator size="large" color="#f97316" />
      </View>
    );
  }

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: "#ffffff" },
        animation: "slide_from_right",
      }}
    />
  );
}
