import { KeyboardAvoidingView, Platform, Text, View } from "react-native";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { router } from "expo-router";
import { Screen } from "@/shared/components/Screen";
import { TextField } from "@/shared/components/TextField";
import { Button } from "@/shared/components/Button";
import { useAuth } from "./auth-context";
import { useUpdateProfile } from "@/features/account/mutations";
import { testIds } from "@/infra/test-ids";

const onboardingSchema = z.object({
  fullName: z.string().min(1, "Full name is required"),
  companyName: z.string().min(1, "Company name is required"),
});

type OnboardingForm = z.infer<typeof onboardingSchema>;

export function OnboardingScreen() {
  const { profile, refreshProfile } = useAuth();
  const updateProfile = useUpdateProfile();

  const {
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<OnboardingForm>({
    // @ts-expect-error: Zod v4 type incompatibility with @hookform/resolvers v3.9 - resolved in future versions
    resolver: zodResolver(onboardingSchema),
    defaultValues: {
      fullName: profile?.full_name ?? "",
      companyName: profile?.company_name ?? "",
    },
  });

  const onSubmit = async (data: OnboardingForm) => {
    if (!profile) return;

    try {
      await updateProfile.mutateAsync({
        full_name: data.fullName,
        company_name: data.companyName,
      });
      await refreshProfile();
      router.replace("/(tabs)/projects");
    } catch (error) {
      console.error("Onboarding error:", error);
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
                testID={testIds.auth.onboardingNameInput}
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
                testID={testIds.auth.onboardingCompanyInput}
              />
            )}
          />
        </View>

        <Button
          onPress={handleSubmit(onSubmit)}
          loading={updateProfile.isPending}
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
