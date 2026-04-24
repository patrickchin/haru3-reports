import { useEffect, useState } from "react";
import { View, Text, KeyboardAvoidingView, Platform, Pressable, ScrollView } from "react-native";
import { Check, HardHat } from "lucide-react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Animated, { FadeInDown } from "react-native-reanimated";
import { useRouter } from "expo-router";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { InlineNotice } from "@/components/ui/InlineNotice";
import { SEED_USERS, isDevPhoneAuthEnabled, useAuth } from "@/lib/auth";
import { getRuntimeIsDev, logClientError } from "@/lib/auth-security";
import { getLoginPhoneHint } from "@/lib/login-phone-hint";
import {
  INVALID_PHONE_NUMBER_MESSAGE,
  isValidPhoneNumber,
  normalizePhoneNumber,
} from "@/lib/phone";
import {
  clearRememberedPhoneNumber,
  getRememberedPhoneNumber,
  rememberPhoneNumber,
} from "@/lib/remembered-login";

export default function LoginScreen() {
  const router = useRouter();
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [codeSent, setCodeSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDemoLoggingIn, setIsDemoLoggingIn] = useState<number | null>(null);
  const [rememberedPhone, setRememberedPhone] = useState<string | null>(null);
  const [shouldRememberPhone, setShouldRememberPhone] = useState(false);
  const { signInWithOtp, verifyOtp, demoSignIn } = useAuth();

  const normalizedPhone = normalizePhoneNumber(phone);
  const isDevBuild = getRuntimeIsDev();

  useEffect(() => {
    let isMounted = true;

    void getRememberedPhoneNumber()
      .then((storedPhoneNumber) => {
        if (!isMounted || !storedPhoneNumber) {
          return;
        }

        setRememberedPhone(storedPhoneNumber);
        setShouldRememberPhone(true);
        setPhone((currentPhone) =>
          currentPhone.trim().length === 0 ? storedPhoneNumber : currentPhone
        );
      })
      .catch((error) => {
        logClientError("Failed to load remembered phone number", error, isDevBuild);
      });

    return () => {
      isMounted = false;
    };
  }, [isDevBuild]);

  const persistRememberedPhone = async (phoneNumber: string) => {
    try {
      if (!shouldRememberPhone) {
        await clearRememberedPhoneNumber();
        setRememberedPhone(null);
        return;
      }

      const storedPhoneNumber = await rememberPhoneNumber(phoneNumber);
      setRememberedPhone(storedPhoneNumber);
    } catch (error) {
      logClientError("Failed to remember phone number", error, isDevBuild);
    }
  };

  const handleSendCode = async () => {
    if (!isValidPhoneNumber(normalizedPhone)) {
      setError(INVALID_PHONE_NUMBER_MESSAGE);
      return;
    }

    setIsSubmitting(true);
    setError(null);
    setInfo(null);

    try {
      await signInWithOtp(normalizedPhone);
      await persistRememberedPhone(normalizedPhone);
      setPhone(normalizedPhone);
      setCodeSent(true);
      setInfo(`We sent a text message with your code to ${normalizedPhone}.`);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Unable to send verification code.";
      setError(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleVerifyCode = async () => {
    if (!codeSent) {
      return;
    }

    if (otp.trim().length < 6) {
      setError("Enter the 6-digit code from your text message.");
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      await verifyOtp(normalizedPhone, otp.trim());
      await persistRememberedPhone(normalizedPhone);
      setInfo("Phone number verified.");
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unable to verify your code.";
      setError(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDemoLogin = async (index: number) => {
    setIsDemoLoggingIn(index);
    setError(null);
    setInfo(null);

    try {
      await demoSignIn(index);
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : "Unable to sign in with demo account.";
      setError(message);
    } finally {
      setIsDemoLoggingIn(null);
    }
  };

  const handleForgetRememberedPhone = async () => {
    try {
      await clearRememberedPhoneNumber();
      setRememberedPhone(null);
      setShouldRememberPhone(false);
      setError(null);
      setInfo("Removed the saved phone number from this device.");
    } catch (error) {
      logClientError("Failed to clear remembered phone number", error, isDevBuild);
      setError("Unable to clear the saved phone number right now.");
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-background">
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        className="flex-1"
      >
        <ScrollView
          className="flex-1"
          contentContainerClassName="grow px-6 py-10"
          keyboardShouldPersistTaps="handled"
        >
          <Animated.View
            entering={FadeInDown.duration(250).springify()}
            className="w-full max-w-sm self-center"
          >
            <View className="flex-row items-center gap-3">
              <View className="h-12 w-12 items-center justify-center rounded-lg bg-primary">
                <HardHat size={24} color="#f8f6f1" />
              </View>
              <View className="flex-1">
                <Text className="text-display text-foreground">Harpa Pro</Text>
                <Text className="text-body text-muted-foreground">
                  Capture field notes quickly and turn them into clean site reports.
                </Text>
              </View>
            </View>

            <View className="mt-8 gap-4">
              {isDevPhoneAuthEnabled && (
                <View className="gap-3 rounded-xl border border-border bg-surface-muted p-4">
                  <Text className="text-label text-muted-foreground">
                    Development Only
                  </Text>
                  <Text className="text-body text-foreground">
                    Demo Accounts
                  </Text>
                  {SEED_USERS.map((seedUser, index) => (
                    <Button
                      key={seedUser.phone}
                      testID={`demo-user-${index}`}
                      variant="secondary"
                      size="default"
                      textClassName="line-clamp-1"
                      onPress={() => handleDemoLogin(index)}
                      disabled={isDemoLoggingIn !== null || isSubmitting}
                    >
                      {isDemoLoggingIn === index
                        ? "Signing in..."
                        : `${seedUser.full_name} - ${seedUser.company_name}`}
                    </Button>
                  ))}
                </View>
              )}

              <Input
                testID="input-phone"
                label="Phone Number"
                placeholder="+15550000000"
                value={phone}
                onChangeText={setPhone}
                keyboardType="phone-pad"
                autoComplete="tel"
                editable={!codeSent && !isSubmitting}
                hint={getLoginPhoneHint({ codeSent, rememberedPhone, shouldRememberPhone })}
              />

              <Pressable
                testID="remember-phone-toggle"
                accessibilityRole="checkbox"
                accessibilityState={{ checked: shouldRememberPhone, disabled: isSubmitting }}
                className="flex-row items-center gap-3 rounded-md py-1"
                disabled={isSubmitting}
                onPress={() => {
                  if (shouldRememberPhone) {
                    void handleForgetRememberedPhone();
                    return;
                  }

                  setShouldRememberPhone(true);
                  setError(null);
                  setInfo(null);
                }}
              >
                <View
                  className={`h-6 w-6 items-center justify-center rounded-md border ${
                    shouldRememberPhone
                      ? "border-primary bg-primary"
                      : "border-border bg-card"
                  }`}
                >
                  {shouldRememberPhone && <Check size={16} color="#f8f6f1" />}
                </View>
                <Text className="flex-1 text-base text-foreground">
                  Remember my phone number.
                </Text>
              </Pressable>

              {codeSent && (
                <Input
                  testID="input-otp"
                  label="Verification Code"
                  placeholder="123456"
                  value={otp}
                  onChangeText={setOtp}
                  keyboardType="number-pad"
                  autoComplete="one-time-code"
                  maxLength={6}
                  editable={!isSubmitting}
                  hint="Most phones can autofill the code from Messages."
                />
              )}

              {error && (
                <InlineNotice tone="danger">{error}</InlineNotice>
              )}

              {info && (
                <InlineNotice tone="info">{info}</InlineNotice>
              )}

              {!codeSent ? (
                <Button
                  variant="hero"
                  size="xl"
                  className="w-full"
                  onPress={handleSendCode}
                  disabled={isSubmitting}
                >
                  {isSubmitting ? "Sending Code..." : "Send Code"}
                </Button>
              ) : (
                <View className="gap-3">
                  <Button
                    variant="hero"
                    size="xl"
                    className="w-full"
                    onPress={handleVerifyCode}
                    disabled={isSubmitting}
                  >
                    {isSubmitting ? "Verifying..." : "Verify Code"}
                  </Button>
                  <Button
                    variant="outline"
                    size="xl"
                    className="w-full"
                    onPress={() => {
                      setCodeSent(false);
                      setOtp("");
                      setError(null);
                      setInfo(null);
                    }}
                    disabled={isSubmitting}
                  >
                    Change Number
                  </Button>
                </View>
              )}
            </View>

            <Pressable
              testID="link-signup"
              onPress={() => router.push("/signup")}
              className="mt-8 items-center py-2"
            >
              <Text className="text-base text-muted-foreground">
                Don't have an account?{" "}
                <Text className="font-semibold text-foreground underline">
                  Create Account
                </Text>
              </Text>
            </Pressable>
          </Animated.View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
