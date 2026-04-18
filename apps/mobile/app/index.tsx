import { useState } from "react";
import { View, Text, KeyboardAvoidingView, Platform, Pressable } from "react-native";
import { HardHat } from "lucide-react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Animated, { FadeInDown } from "react-native-reanimated";
import { useRouter } from "expo-router";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { SEED_USERS, isDevPhoneAuthEnabled, useAuth } from "@/lib/auth";

function normalizePhoneNumber(value: string) {
  const trimmed = value.trim();
  const prefix = trimmed.startsWith("+") ? "+" : "";
  const digits = trimmed.replace(/\D/g, "");

  return `${prefix}${digits}`;
}

function isValidPhoneNumber(value: string) {
  return /^\+[1-9]\d{7,14}$/.test(value);
}

export default function LoginScreen() {
  const router = useRouter();
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [codeSent, setCodeSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDemoLoggingIn, setIsDemoLoggingIn] = useState<number | null>(null);
  const { signInWithOtp, verifyOtp, demoSignIn } = useAuth();

  const normalizedPhone = normalizePhoneNumber(phone);

  const handleSendCode = async () => {
    if (!isValidPhoneNumber(normalizedPhone)) {
      setError("Use a valid phone number in E.164 format, like +15550000000.");
      return;
    }

    setIsSubmitting(true);
    setError(null);
    setInfo(null);

    try {
      await signInWithOtp(normalizedPhone);
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

  return (
    <SafeAreaView className="flex-1 bg-background">
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        className="flex-1"
      >
        <View className="flex-1 items-center justify-center px-6">
          <Animated.View
            entering={FadeInDown.duration(200).springify()}
            className="w-full max-w-sm"
          >
            <View className="flex-row items-center gap-3">
              <View className="h-12 w-12 items-center justify-center bg-primary">
                <HardHat size={24} color="#f8f6f1" />
              </View>
              <Text className="text-3xl font-bold tracking-tight text-foreground">
                Harpa Pro
              </Text>
            </View>

            <View className="mt-10 gap-4">
              {isDevPhoneAuthEnabled && (
                <View className="border border-border bg-card p-4 gap-3">
                  <Text className="text-base font-semibold text-foreground">
                    Demo Accounts
                  </Text>
                  {SEED_USERS.map((seedUser, index) => (
                    <Button
                      key={seedUser.phone}
                      testID={`demo-user-${index}`}
                      variant="outline"
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
                label="Phone Number"
                placeholder="+15550000000"
                value={phone}
                onChangeText={setPhone}
                keyboardType="phone-pad"
                autoComplete="tel"
                editable={!codeSent && !isSubmitting}
              />

              {codeSent && (
                <Input
                  label="Verification Code"
                  placeholder="123456"
                  value={otp}
                  onChangeText={setOtp}
                  keyboardType="number-pad"
                  autoComplete="one-time-code"
                  maxLength={6}
                  editable={!isSubmitting}
                />
              )}

              {error && (
                <Text className="text-base text-destructive">{error}</Text>
              )}

              {info && (
                <Text className="text-base text-muted-foreground">{info}</Text>
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
        </View>
        <View className="pb-4 items-center">
          <Text className="text-xs text-muted-foreground opacity-50" numberOfLines={1}>
            {process.env.EXPO_PUBLIC_SUPABASE_URL}
          </Text>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
