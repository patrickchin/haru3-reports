import "../global.css";

import { Component, type ReactNode } from "react";
import { Stack } from "expo-router";
import { ActivityIndicator, View, Text, Pressable } from "react-native";
import { useEffect } from "react";
import { StatusBar } from "expo-status-bar";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { colors } from "@/lib/design-tokens/colors";
import {
  usePathname,
  useRootNavigationState,
  useRouter,
} from "expo-router";
import { AuthProvider, useAuth } from "@/lib/auth";
import { AudioPlaybackProvider } from "@/lib/audio/AudioPlaybackProvider";
import { getRuntimeIsDev, logClientError } from "@/lib/auth-security";
import { setImageLoadSink } from "@/lib/image-telemetry";
import { schedulePrewarmUploadQueue } from "@/lib/uploads/prewarm";

// Pre-warm the singleton upload queue *off* the report-screen critical
// path. See lib/uploads/prewarm.ts for the rationale.
schedulePrewarmUploadQueue();

// Sensible TanStack defaults so re-mounting a screen (e.g. tabbing back
// into a report) renders the cached notes/files/team instantly while a
// background refetch revalidates. Mutations still call
// `queryClient.invalidateQueries(...)` directly when they need to force
// a refresh, so freshness on writes is preserved. Without this,
// `staleTime: 0` (the default) makes every screen mount block on a
// fresh network round-trip per query — perceptible as "notes load
// slowly" on every navigation.
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: 5 * 60_000,
      refetchOnWindowFocus: false,
      refetchOnReconnect: true,
      retry: 1,
    },
  },
});
const isDevBuild = getRuntimeIsDev();

// Forward image-load telemetry to the existing client logger. Slow loads
// (>1s) surface as warnings even in production so we can spot CDN /
// signed-URL regressions; dev builds also log fast loads at debug level.
setImageLoadSink((event) => {
  const slow = event.durationMs > 1_000 && event.source !== "cache";
  if (slow) {
    logClientError(
      "Slow image load",
      {
        cacheKey: event.cacheKey,
        durationMs: event.durationMs,
        source: event.source,
      },
      isDevBuild,
    );
  } else if (isDevBuild) {
    // eslint-disable-next-line no-console
    console.debug(
      `[image] ${event.source} ${event.durationMs}ms key=${event.cacheKey ?? "?"}`,
    );
  }
});

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
    logClientError(
      "Uncaught error",
      { error, componentStack: info.componentStack },
      isDevBuild,
    );
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
            backgroundColor: colors.background,
          }}
        >
          <Text
            style={{
              fontSize: 20,
              fontWeight: "700",
              color: colors.foreground,
              marginBottom: 8,
            }}
          >
            Something went wrong
          </Text>
          <Text
            style={{
              fontSize: 16,
              color: colors.muted.foreground,
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
              borderColor: colors.foreground,
              paddingHorizontal: 24,
              paddingVertical: 12,
            }}
          >
            <Text style={{ fontSize: 16, fontWeight: "600", color: colors.foreground }}>
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
        <SafeAreaProvider>
          <QueryClientProvider client={queryClient}>
            <AuthProvider>
              <StatusBar style="dark" />
              <AudioPlaybackProvider>
                <AuthNavigation />
              </AudioPlaybackProvider>
            </AuthProvider>
          </QueryClientProvider>
        </SafeAreaProvider>
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

    // `/e2e/login` is a debug-only deep-link entry point used by Maestro
    // (gated by isDevPhoneAuthEnabled inside the route component itself).
    // It must be treated as public so an unauthenticated deep-link arrival
    // isn't immediately bounced back to `/` before the demoSignIn() call
    // resolves and a session appears.
    const isPublicScreen =
      pathname === "/" || pathname === "/signup" || pathname === "/e2e/login";

    if (!session && !isPublicScreen) {
      // Clear any pushed routes so swipe-back can't return to authenticated screens.
      router.dismissAll();
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
        <ActivityIndicator size="large" color={colors.foreground} />
      </View>
    );
  }

  return (
    <View style={{ flex: 1 }}>
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.background },
          animation: "simple_push",
          animationDuration: 80,
        }}
      />
    </View>
  );
}
