import { useState } from "react";
import {
  View,
  Text,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
} from "react-native";
import { HardHat, ArrowLeft } from "lucide-react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Animated, { FadeInDown } from "react-native-reanimated";
import { useRouter } from "expo-router";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { useAuth } from "@/lib/auth";

type Step = "identity" | "phone" | "verify";

function normalizePhoneNumber(value: string) {
  const trimmed = value.trim();
  const prefix = trimmed.startsWith("+") ? "+" : "";
  const digits = trimmed.replace(/\D/g, "");

  return `${prefix}${digits}`;
}

function isValidPhoneNumber(value: string) {
  return /^\+[1-9]\d{7,14}$/.test(value);
}

export default function SignupScreen() {
  const router = useRouter();
  const { signUpWithOtp, verifyOtp } = useAuth();

  const [step, setStep] = useState<Step>("identity");
  const [fullName, setFullName] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const normalizedPhone = normalizePhoneNumber(phone);

  const handleContinueToPhone = () => {
    const trimmedName = fullName.trim();
    const trimmedCompany = companyName.trim();

    if (trimmedName.length < 2) {
      setError("Please enter your full name.");
      return;
    }

    if (trimmedCompany.length < 2) {
      setError("Please enter your company name.");
      return;
    }

    setError(null);
    setStep("phone");
  };

  const handleSendCode = async () => {
    if (!isValidPhoneNumber(normalizedPhone)) {
      setError("Use a valid phone number in E.164 format, like +15550000000.");
      return;
    }

    setIsSubmitting(true);
    setError(null);
    setInfo(null);

    try {
      await signUpWithOtp(normalizedPhone, {
        full_name: fullName.trim(),
        company_name: companyName.trim(),
      });
      setStep("verify");
      setInfo(`We sent a WhatsApp message with your code to ${normalizedPhone}.`);
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : "Unable to send verification code.";
      setError(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleVerifyCode = async () => {
    if (otp.trim().length < 6) {
      setError("Enter the 6-digit code from your WhatsApp message.");
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      await verifyOtp(normalizedPhone, otp.trim());
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Unable to verify your code.";
      setError(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleBack = () => {
    setError(null);
    setInfo(null);

    if (step === "phone") {
      setStep("identity");
      return;
    }

    if (step === "verify") {
      setOtp("");
      setStep("phone");
      return;
    }

    router.back();
  };

  return (
    <SafeAreaView className="flex-1 bg-background">
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        className="flex-1"
      >
        <View className="px-5 pt-3">
          <Pressable
            onPress={handleBack}
            className="flex-row items-center gap-2 py-2"
          >
            <ArrowLeft size={20} color="#1a1a2e" />
            <Text className="text-base font-semibold text-foreground">
              {step === "identity" ? "Back to Sign In" : "Back"}
            </Text>
          </Pressable>
        </View>

        <ScrollView
          className="flex-1"
          contentContainerClassName="flex-1 items-center justify-center px-6"
          keyboardShouldPersistTaps="handled"
        >
          <Animated.View
            entering={FadeInDown.duration(200).springify()}
            className="w-full max-w-sm"
          >
            <View className="flex-row items-center gap-3">
              <View className="h-12 w-12 items-center justify-center bg-primary">
                <HardHat size={24} color="#f8f6f1" />
              </View>
              <View>
                <Text className="text-3xl font-bold tracking-tight text-foreground">
                  Create Account
                </Text>
                <Text className="text-base text-muted-foreground">
                  {step === "identity" && "Tell us about yourself"}
                  {step === "phone" && "Verify your phone number"}
                  {step === "verify" && "Enter your verification code"}
                </Text>
              </View>
            </View>

            <View className="mt-10 gap-4">
              {/* Step indicator */}
              <View className="flex-row gap-2">
                {(["identity", "phone", "verify"] as const).map((s, i) => (
                  <View
                    key={s}
                    className={`h-1 flex-1 ${
                      i <=
                      ["identity", "phone", "verify"].indexOf(step)
                        ? "bg-primary"
                        : "bg-border"
                    }`}
                  />
                ))}
              </View>

              {step === "identity" && (
                <>
                  <Input
                    label="Full Name"
                    placeholder="John Smith"
                    value={fullName}
                    onChangeText={(text) => {
                      setFullName(text);
                      setError(null);
                    }}
                    autoComplete="name"
                    autoCapitalize="words"
                    autoFocus
                  />
                  <Input
                    label="Company Name"
                    placeholder="Smith Construction LLC"
                    value={companyName}
                    onChangeText={(text) => {
                      setCompanyName(text);
                      setError(null);
                    }}
                    autoComplete="organization"
                    autoCapitalize="words"
                  />
                </>
              )}

              {step === "phone" && (
                <Input
                  label="Phone Number"
                  placeholder="+15550000000"
                  value={phone}
                  onChangeText={(text) => {
                    setPhone(text);
                    setError(null);
                  }}
                  keyboardType="phone-pad"
                  autoComplete="tel"
                  autoFocus
                />
              )}

              {step === "verify" && (
                <Input
                  label="Verification Code"
                  placeholder="123456"
                  value={otp}
                  onChangeText={(text) => {
                    setOtp(text);
                    setError(null);
                  }}
                  keyboardType="number-pad"
                  autoComplete="one-time-code"
                  maxLength={6}
                  editable={!isSubmitting}
                  autoFocus
                />
              )}

              {error && (
                <Text className="text-base text-destructive">{error}</Text>
              )}

              {info && (
                <Text className="text-base text-muted-foreground">{info}</Text>
              )}

              {step === "identity" && (
                <Button
                  variant="hero"
                  size="xl"
                  className="w-full"
                  onPress={handleContinueToPhone}
                >
                  Continue
                </Button>
              )}

              {step === "phone" && (
                <Button
                  variant="hero"
                  size="xl"
                  className="w-full"
                  onPress={handleSendCode}
                  disabled={isSubmitting}
                >
                  {isSubmitting ? "Sending Code..." : "Send Code"}
                </Button>
              )}

              {step === "verify" && (
                <View className="gap-3">
                  <Button
                    variant="hero"
                    size="xl"
                    className="w-full"
                    onPress={handleVerifyCode}
                    disabled={isSubmitting}
                  >
                    {isSubmitting ? "Verifying..." : "Verify & Create Account"}
                  </Button>
                  <Button
                    variant="outline"
                    size="xl"
                    className="w-full"
                    onPress={() => {
                      setOtp("");
                      setError(null);
                      setInfo(null);
                      setStep("phone");
                    }}
                    disabled={isSubmitting}
                  >
                    Change Number
                  </Button>
                </View>
              )}
            </View>

            <Pressable
              onPress={() => router.replace("/")}
              className="mt-8 items-center py-2"
            >
              <Text className="text-base text-muted-foreground">
                Already have an account?{" "}
                <Text className="font-semibold text-foreground underline">
                  Sign In
                </Text>
              </Text>
            </Pressable>
          </Animated.View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
