import { useState } from "react";
import { KeyboardAvoidingView, Platform, Text, View } from "react-native";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Screen } from "@/shared/components/Screen";
import { TextField } from "@/shared/components/TextField";
import { Button } from "@/shared/components/Button";
import { useAuth } from "./auth-context";
import { testIds } from "@/infra/test-ids";

const signInSchema = z.object({
  phone: z.string().min(10, "Phone number must be at least 10 digits"),
});

type SignInForm = z.infer<typeof signInSchema>;

export function SignInScreen() {
  const { signInWithPhone } = useAuth();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [otpSent, setOtpSent] = useState(false);

  const {
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<SignInForm>({
    // @ts-expect-error: Zod v4 type incompatibility with @hookform/resolvers v3.9 - resolved in future versions
    resolver: zodResolver(signInSchema),
    defaultValues: {
      phone: "",
    },
  });

  const onSubmit = async (data: SignInForm) => {
    setIsSubmitting(true);
    try {
      await signInWithPhone(data.phone);
      setOtpSent(true);
    } catch (error) {
      console.error("Sign in error:", error);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (otpSent) {
    return (
      <Screen>
        <View className="flex-1 justify-center px-6">
          <Text className="text-title text-foreground mb-4 text-center">
            Check your phone
          </Text>
          <Text className="text-body text-muted-foreground text-center">
            We've sent you a verification code via SMS.
          </Text>
        </View>
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
          control={control}
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
              error={errors.phone?.message}
              testID={testIds.auth.phoneInput}
            />
          )}
        />

        <Button
          onPress={handleSubmit(onSubmit)}
          loading={isSubmitting}
          className="mt-6"
          testID={testIds.auth.signInButton}
        >
          <Text className="text-body text-primary-foreground font-semibold">
            Continue
          </Text>
        </Button>
      </KeyboardAvoidingView>
    </Screen>
  );
}
