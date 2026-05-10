import { useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import { router } from "expo-router";
import { ArrowLeft } from "lucide-react-native";
import { Screen } from "@/shared/components/Screen";
import { TextField } from "@/shared/components/TextField";
import { Button } from "@/shared/components/Button";
import { useAuth } from "./auth-context";
import { testIds } from "@/infra/test-ids";

type Step = "identity" | "phone" | "verify";

const SIGNUP_STEPS: Array<{ key: Step; label: string; number: number }> = [
  { key: "identity", label: "About you", number: 1 },
  { key: "phone", label: "Phone", number: 2 },
  { key: "verify", label: "Verify", number: 3 },
];

export function SignupScreen() {
  const { signUpWithOtp, verifyOtp } = useAuth();

  const [step, setStep] = useState<Step>("identity");
  const [fullName, setFullName] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

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
    const trimmedPhone = phone.trim();

    if (trimmedPhone.length < 10) {
      setError("Phone number must be at least 10 digits.");
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      await signUpWithOtp(trimmedPhone, {
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
      await verifyOtp(phone.trim(), otp.trim());
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
    <Screen>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        className="flex-1"
      >
        <View className="px-6 pt-4">
          <Pressable
            onPress={handleBack}
            testID={testIds.auth.signupBackButton}
            accessibilityLabel={
              step === "identity" ? "Back to Sign In" : "Back"
            }
            className="flex-row items-center gap-2 py-2"
          >
            <ArrowLeft size={20} color="#000" />
            <Text className="text-base font-semibold text-foreground">
              {step === "identity" ? "Back to Sign In" : "Back"}
            </Text>
          </Pressable>
        </View>

        <ScrollView
          className="flex-1"
          contentContainerStyle={{ padding: 24, flexGrow: 1 }}
          keyboardShouldPersistTaps="handled"
        >
          <View className="w-full max-w-sm self-center">
            <Text className="text-display text-foreground mb-2">
              Create Account
            </Text>
            {step === "verify" && (
              <Text className="text-body text-muted-foreground mb-6">
                {`Enter the 6-digit code we sent to ${phone.trim()}.`}
              </Text>
            )}

            {/* Step indicators */}
            <View className="flex-row gap-2 mb-8">
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

            {/* Form fields */}
            <View className="gap-4">
              {step === "identity" && (
                <>
                  <TextField
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
                    testID={testIds.auth.signupNameInput}
                  />
                  <TextField
                    label="Company Name"
                    placeholder="Smith Construction LLC"
                    value={companyName}
                    onChangeText={(text) => {
                      setCompanyName(text);
                      setError(null);
                    }}
                    autoCapitalize="words"
                    testID={testIds.auth.signupCompanyInput}
                  />
                </>
              )}

              {step === "phone" && (
                <TextField
                  label="Phone Number"
                  placeholder="+1 (555) 123-4567"
                  value={phone}
                  onChangeText={(text) => {
                    setPhone(text);
                    setError(null);
                  }}
                  keyboardType="phone-pad"
                  autoComplete="tel"
                  autoFocus
                  testID={testIds.auth.signupPhoneInput}
                />
              )}

              {step === "verify" && (
                <TextField
                  label="Verification Code"
                  placeholder="123456"
                  value={otp}
                  onChangeText={(text) => {
                    setOtp(text);
                    setError(null);
                  }}
                  keyboardType="number-pad"
                  autoComplete="one-time-code"
                  autoFocus
                  testID={testIds.auth.signupOtpInput}
                />
              )}

              {error && (
                <View className="bg-destructive/10 p-3 rounded-lg">
                  <Text className="text-destructive text-sm">{error}</Text>
                </View>
              )}

              {step === "identity" && (
                <Button
                  onPress={handleContinueToPhone}
                  disabled={isSubmitting}
                >
                  <Text className="text-body text-primary-foreground font-semibold">
                    Continue
                  </Text>
                </Button>
              )}

              {step === "phone" && (
                <Button
                  onPress={handleSendCode}
                  loading={isSubmitting}
                >
                  <Text className="text-body text-primary-foreground font-semibold">
                    {isSubmitting ? "Sending Code..." : "Send Code"}
                  </Text>
                </Button>
              )}

              {step === "verify" && (
                <Button
                  onPress={handleVerifyCode}
                  loading={isSubmitting}
                  testID={testIds.auth.signupVerifyButton}
                >
                  <Text className="text-body text-primary-foreground font-semibold">
                    {isSubmitting ? "Verifying..." : "Verify Code"}
                  </Text>
                </Button>
              )}
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}
