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

const onboardingSchema = z.object({
  fullName: z.string().min(1, "Full name is required"),
  companyName: z.string().min(1, "Company name is required"),
});

type OnboardingForm = z.infer<typeof onboardingSchema>;

export function OnboardingScreen() {
  const { profile, refreshProfile } = useAuth();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const {
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<OnboardingForm>({
    resolver: zodResolver(onboardingSchema),
    defaultValues: {
      fullName: profile?.full_name ?? "",
      companyName: profile?.company_name ?? "",
    },
  });

  const onSubmit = async (data: OnboardingForm) => {
    if (!profile) return;

    setIsSubmitting(true);
    try {
      // TODO Phase 1: implement profile update mutation
      await new Promise((resolve) => setTimeout(resolve, 1000));
      await refreshProfile();
    } catch (error) {
      console.error("Onboarding error:", error);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Screen>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        className="flex-1 justify-center px-6"
      >
        <Text className="text-title text-foreground mb-8 text-center">
          Complete your profile
        </Text>

        <View className="gap-4">
          <Controller
            control={control}
            name="fullName"
            render={({ field: { onChange, onBlur, value } }) => (
              <TextField
                label="Full Name"
                placeholder="John Doe"
                autoComplete="name"
                textContentType="name"
                value={value}
                onChangeText={onChange}
                onBlur={onBlur}
                error={errors.fullName?.message}
                testID={testIds.auth.onboardingFullNameInput}
              />
            )}
          />

          <Controller
            control={control}
            name="companyName"
            render={({ field: { onChange, onBlur, value } }) => (
              <TextField
                label="Company Name"
                placeholder="Acme Inc."
                autoComplete="organization"
                textContentType="organizationName"
                value={value}
                onChangeText={onChange}
                onBlur={onBlur}
                error={errors.companyName?.message}
                testID={testIds.auth.onboardingCompanyNameInput}
              />
            )}
          />
        </View>

        <Button
          onPress={handleSubmit(onSubmit)}
          loading={isSubmitting}
          className="mt-6"
          testID={testIds.auth.onboardingSubmitButton}
        >
          <Text className="text-body text-primary-foreground font-semibold">
            Get Started
          </Text>
        </Button>
      </KeyboardAvoidingView>
    </Screen>
  );
}
