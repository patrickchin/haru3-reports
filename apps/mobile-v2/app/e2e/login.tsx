/**
 * E2E-only deep-link login route.
 * 
 * Used by Maestro flows to bypass OTP flow for fast test execution.
 * In v2, this currently does nothing since we don't have demo users or
 * password auth set up yet. The screen exists to satisfy the testID
 * requirement and provide a foundation for future implementation.
 * 
 * TODO: Implement actual demo user sign-in when we have seed users
 */
import { useEffect, useState } from "react";
import { ActivityIndicator, Text, View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { testIds } from "@/infra/test-ids";

export default function E2ELoginScreen() {
  const params = useLocalSearchParams<{ demo?: string }>();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!__DEV__) {
      setError("E2E login is only available in development builds.");
      return;
    }

    const rawIndex = Array.isArray(params.demo) ? params.demo[0] : params.demo;
    
    if (!rawIndex) {
      setError("No demo user specified. Use ?demo=0, ?demo=1, or ?demo=2");
      return;
    }

    const index = Number.parseInt(rawIndex, 10);
    if (!Number.isFinite(index) || index < 0 || index > 2) {
      setError(`Invalid demo index: ${rawIndex}. Expected 0, 1, or 2.`);
      return;
    }

    // TODO: Implement actual sign-in
    setError(`Demo user ${index} sign-in not yet implemented in v2.`);
  }, [params.demo]);

  return (
    <View
      testID={testIds.auth.e2eLoginScreen}
      style={{
        flex: 1,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: "#fff",
        padding: 24,
      }}
    >
      {error ? (
        <Text
          testID={testIds.auth.e2eLoginError}
          style={{
            color: "#ef4444",
            textAlign: "center",
            fontSize: 14,
          }}
        >
          {error}
        </Text>
      ) : (
        <>
          <ActivityIndicator size="large" color="#000" />
          <Text
            testID={testIds.auth.e2eLoginStatus}
            style={{ marginTop: 16, color: "#000" }}
          >
            Signing in...
          </Text>
        </>
      )}
    </View>
  );
}
