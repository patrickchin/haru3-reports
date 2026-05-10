import { useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, Text, View } from "react-native";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { router } from "expo-router";
import { Screen } from "@/shared/components/Screen";
import { TextField } from "@/shared/components/TextField";
import { Button } from "@/shared/components/Button";
import { useAuth } from "./auth-context";
import { testIds } from "@/infra/test-ids";

const signInSchema = z.object({
  phone: z.string().min(10, "Phone number must be at least 10 digits"),
});

const otpSchema = z.object({
  otp: z.string().min(6, "Code must be 6 digits"),
});

type SignInForm = z.infer<typeof signInSchema>;
type OtpForm = z.infer<typeof otpSchema>;

export function SignInScreen() {
  const { signInWithPhone, verifyOtp } = useAuth();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [otpSent, setOtpSent] = useState(false);
  const [phoneNumber, setPhoneNumber] = useState("");

  const {
    control: phoneControl,
    handleSubmit: handlePhoneSubmit,
    formState: { errors: phoneErrors },
  } = useForm<SignInForm>({
    // @ts-expect-error: Zod v4 type incompatibility with @hookform/resolvers v3.9 - resolved in future versions
    resolver: zodResolver(signInSchema),
    defaultValues: {
      phone: "",
    },
  });

  const {
    control: otpControl,
    handleSubmit: handleOtpSubmit,
    formState: { errors: otpErrors },
  } = useForm<OtpForm>({
    // @ts-expect-error: Zod v4 type incompatibility with @hookform/resolvers v3.9 - resolved in future versions
    resolver: zodResolver(otpSchema),
    defaultValues: {
      otp: "",
    },
  });

  const onPhoneSubmit = async (data: SignInForm) => {
    setIsSubmitting(true);
    try {
      await signInWithPhone(data.phone);
      setPhoneNumber(data.phone);
      setOtpSent(true);
    } catch (error) {
      console.error("Sign in error:", error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const onOtpSubmit = async (data: OtpForm) => {
    setIsSubmitting(true);
    try {
      await verifyOtp(phoneNumber, data.otp);
    } catch (error) {
      console.error("OTP verification error:", error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleChangeNumber = () => {
    setOtpSent(false);
    setPhoneNumber("");
  };

  if (otpSent) {
    return (
      <Screen>
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          className="flex-1 justify-center px-6"
        >
          <Text className="text-title text-foreground mb-4 text-center">
            Check your phone
          </Text>
          <Text className="text-body text-muted-foreground text-center mb-8">
            We've sent a verification code to {phoneNumber}.
          </Text>

          <Controller
            control={otpControl}
            name="otp"
            render={({ field: { onChange, onBlur, value } }) => (
              <TextField
                label="Verification Code"
                placeholder="123456"
                keyboardType="number-pad"
                autoComplete="one-time-code"
                value={value}
                onChangeText={onChange}
                onBlur={onBlur}
                error={otpErrors.otp?.message}
                testID={testIds.auth.otpInput}
              />
            )}
          />

          <Button
            onPress={handleOtpSubmit(onOtpSubmit)}
            loading={isSubmitting}
            className="mt-6"
            testID={testIds.auth.verifyCodeButton}
          >
            <Text className="text-body text-primary-foreground font-semibold">
              {isSubmitting ? "Verifying..." : "Verify Code"}
            </Text>
          </Button>

          <Button
            onPress={handleChangeNumber}
            disabled={isSubmitting}
            className="mt-3 bg-transparent"
            testID={testIds.auth.changeNumberButton}
          >
            <Text className="text-body text-foreground font-medium">
              Change Number
            </Text>
          </Button>
        </KeyboardAvoidingView>
      </Screen>
    );
  }

  return (
    <Screen>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        className="flex-1 justify-center px-6"
      >
        <Text className="text-display text-foreground mb-8 text-center">
          Welcome to Harpa
        </Text>

        <Controller
          control={phoneControl}
          name="phone"
          render={({ field: { onChange, onBlur, value } }) => (
            <TextField
              label="Phone Number"
              placeholder="+1 (555) 123-4567"
              keyboardType="phone-pad"
              autoComplete="tel"
              textContentType="telephoneNumber"
              value={value}
              onChangeText={onChange}
              onBlur={onBlur}
              error={phoneErrors.phone?.message}
              testID={testIds.auth.phoneInput}
            />
          )}
        />

        <Button
          onPress={handlePhoneSubmit(onPhoneSubmit)}
          loading={isSubmitting}
          className="mt-6"
          testID={testIds.auth.sendCodeButton}
        >
          <Text className="text-body text-primary-foreground font-semibold">
            {isSubmitting ? "Sending Code..." : "Send Code"}
          </Text>
        </Button>

        <Pressable
          testID={testIds.auth.signUpLink}
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
      </KeyboardAvoidingView>
    </Screen>
  );
}
