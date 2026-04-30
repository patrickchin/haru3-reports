import { useState } from "react";
import { colors } from "@/lib/design-tokens/colors";
import {
  View,
  Text,
  KeyboardAvoidingView,
  Pressable,
  ScrollView,
} from "react-native";
import { HardHat, ArrowLeft } from "lucide-react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { InlineNotice } from "@/components/ui/InlineNotice";
import { useAuth } from "@/lib/auth";
import { buildInfo } from "@/lib/build-info";
import {
  INVALID_PHONE_NUMBER_MESSAGE,
  isValidPhoneNumber,
  normalizePhoneNumber,
} from "@/lib/phone";

type Step = "identity" | "phone" | "verify";

const SIGNUP_STEPS: Array<{ key: Step; label: string; number: string }> = [
  { key: "identity", label: "About you", number: "1" },
  { key: "phone", label: "Phone", number: "2" },
  { key: "verify", label: "Verify", number: "3" },
];

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
      setError(INVALID_PHONE_NUMBER_MESSAGE);
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
      setError("Enter the 6-digit code from your text message.");
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
        behavior="padding"
        className="flex-1"
      >
        <View className="px-5 pt-3">
          <Pressable
            onPress={handleBack}
            className="flex-row items-center gap-2 py-2"
          >
            <ArrowLeft size={20} color={colors.foreground} />
            <Text className="text-base font-semibold text-foreground">
              {step === "identity" ? "Back to Sign In" : "Back"}
            </Text>
          </Pressable>
        </View>

        <ScrollView
          className="flex-1"
          contentContainerClassName="grow px-6 py-10"
          keyboardShouldPersistTaps="handled"
        >
          <View
            className="w-full max-w-sm self-center"
          >
            <View className="flex-row items-center gap-3">
              <View className="h-12 w-12 items-center justify-center rounded-lg bg-primary">
                <HardHat size={24} color={colors.primary.foreground} />
              </View>
              <View className="flex-1">
                <Text className="text-display text-foreground">
                  Create Account
                </Text>
                <Text className="text-body text-muted-foreground">
                  {step === "identity" && "Tell us about yourself so your reports look professional from the start."}
                  {step === "phone" && "Verify the number you will use to sign in from the field."}
                  {step === "verify" && `Enter the 6-digit code we sent to ${normalizedPhone}.`}
                </Text>
              </View>
            </View>

            <View className="mt-8 gap-4">
              <View className="flex-row gap-2">
                {SIGNUP_STEPS.map((signupStep, index) => {
                  const isComplete =
                    index < SIGNUP_STEPS.findIndex((item) => item.key === step);
                  const isActive = signupStep.key === step;
                  return (
                    <View key={signupStep.key} className="flex-1 gap-2">
                      <View className="flex-row items-center gap-2">
                        <View
                          className={`h-7 w-7 items-center justify-center rounded-full border ${
                            isActive || isComplete
                              ? "border-primary bg-primary"
                              : "border-border bg-card"
                          }`}
                        >
                          <Text
                            className={`text-sm font-semibold ${
                              isActive || isComplete
                                ? "text-primary-foreground"
                                : "text-muted-foreground"
                            }`}
                          >
                            {signupStep.number}
                          </Text>
                        </View>
                        <Text
                          className={`text-sm font-semibold ${
                            isActive
                              ? "text-foreground"
                              : "text-muted-foreground"
                          }`}
                        >
                          {signupStep.label}
                        </Text>
                      </View>
                      <View
                        className={`h-1.5 rounded-full ${
                          isActive || isComplete ? "bg-primary" : "bg-border"
                        }`}
                      />
                    </View>
                  );
                })}
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
                    hint="Use the name coworkers and clients will recognize."
                    autoFocus
                    testID="input-signup-name"
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
                    hint="This appears in your profile and exported reports."
                    testID="input-signup-company"
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
                  hint="Include your country code, starting with +. For example, +1 555 123 4567."
                  autoFocus
                />
              )}

              {step === "verify" && (
                <Input
                  label="Code"
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
                <InlineNotice tone="danger">{error}</InlineNotice>
              )}

              {info && (
                <InlineNotice tone="info">{info}</InlineNotice>
              )}

              {step === "identity" && (
                <View className="gap-3">
                  <Button
                    variant="hero"
                    size="xl"
                    className="w-full"
                    onPress={handleContinueToPhone}
                  >
                    Continue
                  </Button>
                  <Button
                    variant="outline"
                    size="xl"
                    className="w-full"
                    onPress={() => router.replace("/")}
                  >
                    Cancel Sign Up
                  </Button>
                </View>
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
                    testID="btn-signup-verify"
                  >
                    {isSubmitting ? "Verifying..." : "Verify"}
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

            <Text
              testID="server-info"
              className="mt-4 text-center text-xs text-muted-foreground"
              selectable
            >
              Server: {buildInfo.serverLabel}
            </Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
