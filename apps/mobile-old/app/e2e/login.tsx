/**
 * E2E-only deep-link login route.
 *
 * Reachable via `harpa://e2e/login?demo=0` (Mike), `?demo=1` (Sarah),
 * `?demo=2` (Charlie). Triggers the existing demoSignIn() password
 * sign-in for the corresponding seeded user. The root layout's
 * AuthNavigation effect then routes the new session to /(tabs)/projects
 * (or /onboarding if the profile has no full_name, which seeded users
 * do, so this is a no-op for them).
 *
 * Gated by isDevPhoneAuthEnabled, the same flag that already protects
 * the demo sign-in buttons on the public login screen. The route file
 * is always present in the bundle but renders an "unavailable" stub in
 * production builds, so even if a deep link is fired at a prod APK
 * nothing happens. demoSignIn() itself also throws in production via
 * getDemoCredentials().
 *
 * This exists purely to make Maestro flows fast — phone-OTP login costs
 * 10–15s per flow because of the OTP-screen state churn. Deep-link
 * login is one async sign-in plus the layout's redirect.
 */
import { useEffect, useState } from "react";
import { ActivityIndicator, Text, View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { useAuth, isDevPhoneAuthEnabled } from "@/lib/auth";
import { colors } from "@/lib/design-tokens/colors";

export default function E2ELoginScreen() {
  const params = useLocalSearchParams<{ demo?: string }>();
  const { demoSignIn } = useAuth();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isDevPhoneAuthEnabled) {
      setError("E2E login is disabled in this build.");
      return;
    }

    const rawIndex = Array.isArray(params.demo) ? params.demo[0] : params.demo;
    const index = Number.parseInt(rawIndex ?? "", 10);

    if (!Number.isFinite(index) || index < 0 || index > 2) {
      setError(`Invalid ?demo=${rawIndex ?? ""} (expected 0, 1, or 2).`);
      return;
    }

    void demoSignIn(index).catch((err) => {
      setError(err instanceof Error ? err.message : String(err));
    });
  }, [params.demo, demoSignIn]);

  return (
    <View
      testID="e2e-login-screen"
      style={{
        flex: 1,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: colors.background,
        padding: 24,
      }}
    >
      {error ? (
        <Text
          testID="e2e-login-error"
          style={{
            color: colors.destructive.foreground ?? colors.foreground,
            textAlign: "center",
          }}
        >
          {error}
        </Text>
      ) : (
        <>
          <ActivityIndicator size="large" color={colors.foreground} />
          <Text
            testID="e2e-login-status"
            style={{ marginTop: 16, color: colors.foreground }}
          >
            Signing in...
          </Text>
        </>
      )}
    </View>
  );
}
