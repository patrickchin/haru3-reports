import { Slot } from "expo-router";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { QueryClientProvider } from "@tanstack/react-query";
import { StatusBar } from "expo-status-bar";
import { ErrorBoundary } from "@/shared/components/ErrorBoundary";
import { AuthProvider } from "@/features/auth";
import { AudioPlaybackProvider } from "@/features/audio";
import { queryClient } from "@/infra/query-client";
import "../global.css";

export default function RootLayout() {
  return (
    <ErrorBoundary>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <SafeAreaProvider>
          <QueryClientProvider client={queryClient}>
            <AuthProvider>
              <AudioPlaybackProvider>
                <StatusBar style="dark" />
                <Slot />
              </AudioPlaybackProvider>
            </AuthProvider>
          </QueryClientProvider>
        </SafeAreaProvider>
      </GestureHandlerRootView>
    </ErrorBoundary>
  );
}
