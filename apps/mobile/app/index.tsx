import { useState } from "react";
import { View, Text, KeyboardAvoidingView, Platform } from "react-native";
import { HardHat } from "lucide-react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Animated, { FadeInDown } from "react-native-reanimated";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import {
  DEV_FAKE_OTP_CODE,
  DEV_FAKE_PHONE_NUMBER,
  isDevPhoneAuthEnabled,
  isDevPhoneLoginPhone,
  useAuth,
} from "@/lib/auth";

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
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [codeSent, setCodeSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { signInWithOtp, verifyOtp } = useAuth();

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
      setInfo(
        isDevPhoneLoginPhone(normalizedPhone)
          ? `Development login ready for ${normalizedPhone}. Use code ${DEV_FAKE_OTP_CODE}.`
          : `We sent a one-time code to ${normalizedPhone}.`
      );
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unable to send verification code.";
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
            <View className="gap-3">
              <View className="flex-row items-center gap-3">
                <View className="h-12 w-12 items-center justify-center rounded-lg bg-primary">
                  <HardHat size={24} color="#ffffff" />
                </View>
                <Text className="text-2xl font-bold tracking-tight text-foreground">
                  Harpa Pro v3
                </Text>
              </View>
              <Text className="text-4xl font-extrabold tracking-tight text-foreground">
                {"Field-First\nReporting."}
              </Text>
              <Text className="text-base text-muted-foreground">
                Capture site data with voice. Let AI structure your reports.
              </Text>
            </View>

            <View className="mt-10 gap-4">
              {isDevPhoneAuthEnabled && (
                <View className="rounded-lg border border-dashed border-primary/40 bg-primary/5 p-4">
                  <Text className="text-sm font-semibold text-foreground">
                    Development Login
                  </Text>
                  <Text className="mt-1 text-sm text-muted-foreground">
                    Test phone: {DEV_FAKE_PHONE_NUMBER}
                  </Text>
                  <Text className="text-sm text-muted-foreground">
                    Verification code: {DEV_FAKE_OTP_CODE}
                  </Text>
                  <Button
                    variant="outline"
                    size="default"
                    className="mt-3"
                    onPress={() => {
                      setPhone(DEV_FAKE_PHONE_NUMBER);
                      setCodeSent(false);
                      setOtp("");
                      setError(null);
                      setInfo(
                        `Development login loaded. Tap Send Code, then enter ${DEV_FAKE_OTP_CODE}.`
                      );
                    }}
                    disabled={isSubmitting}
                  >
                    Use Test Number
                  </Button>
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
                <Text className="text-sm text-destructive">{error}</Text>
              )}

              {info && (
                <Text className="text-sm text-muted-foreground">{info}</Text>
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

            <Text className="mt-6 text-center text-sm text-muted-foreground">
              {isDevPhoneAuthEnabled
                ? "Use the test phone above for local sign-in, or enter a real E.164 number when SMS is configured."
                : "Use your full international phone number so we can text the login code."}
            </Text>

            <Text className="mt-2 text-center text-sm text-muted-foreground">
              By continuing, you agree to our Terms of Service.
            </Text>
          </Animated.View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
