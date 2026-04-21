import "../global.css";

import { Component, type ReactNode } from "react";
import { Stack } from "expo-router";
import { ActivityIndicator, View, Text, Pressable } from "react-native";
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

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

class AppErrorBoundary extends Component<
  { children: ReactNode },
  ErrorBoundaryState
> {
  state: ErrorBoundaryState = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error("Uncaught error:", error, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return (
        <View
          style={{
            flex: 1,
            alignItems: "center",
            justifyContent: "center",
            padding: 24,
            backgroundColor: "#f8f6f1",
          }}
        >
          <Text
            style={{
              fontSize: 20,
              fontWeight: "700",
              color: "#1a1a2e",
              marginBottom: 8,
            }}
          >
            Something went wrong
          </Text>
          <Text
            style={{
              fontSize: 16,
              color: "#5c5c6e",
              textAlign: "center",
              marginBottom: 24,
            }}
          >
            {this.state.error?.message ?? "An unexpected error occurred."}
          </Text>
          <Pressable
            onPress={() => this.setState({ hasError: false, error: null })}
            style={{
              borderWidth: 1,
              borderColor: "#1a1a2e",
              paddingHorizontal: 24,
              paddingVertical: 12,
            }}
          >
            <Text style={{ fontSize: 16, fontWeight: "600", color: "#1a1a2e" }}>
              Try Again
            </Text>
          </Pressable>
        </View>
      );
    }

    return this.props.children;
  }
}

export default function RootLayout() {
  return (
    <AppErrorBoundary>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <QueryClientProvider client={queryClient}>
          <AuthProvider>
            <StatusBar style="dark" />
            <AuthNavigation />
          </AuthProvider>
        </QueryClientProvider>
      </GestureHandlerRootView>
    </AppErrorBoundary>
  );
}

function AuthNavigation() {
  const pathname = usePathname();
  const navigationState = useRootNavigationState();
  const router = useRouter();
  const { session, profile, isLoading } = useAuth();

  useEffect(() => {
    if (!navigationState?.key || isLoading) {
      return;
    }

    const isPublicScreen = pathname === "/" || pathname === "/signup";

    if (!session && !isPublicScreen) {
      router.replace("/");
      return;
    }

    if (session && !profile?.full_name && pathname !== "/onboarding") {
      router.replace("/onboarding");
      return;
    }

    if (session && profile?.full_name && isPublicScreen) {
      router.replace("/(tabs)/projects");
      return;
    }

    if (session && profile?.full_name && pathname === "/onboarding") {
      router.replace("/(tabs)/projects");
    }
  }, [session, profile, isLoading]);

  if (isLoading) {
    return (
      <View className="flex-1 items-center justify-center bg-background">
        <ActivityIndicator size="large" color="#1a1a2e" />
      </View>
    );
  }

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: "#f8f6f1" },
        animation: "simple_push",
        animationDuration: 80,
      }}
    />
  );
}
