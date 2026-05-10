import { useEffect } from "react";
import { View, Text } from "react-native";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/shared/components/Button";
import { TextField } from "@/shared/components/TextField";
import { testIds } from "@/infra/test-ids";
import { useUpdateProfile } from "./mutations";
import type { Profile } from "@/infra/db-types";

const profileSchema = z.object({
  full_name: z.string().min(1, "Full name is required"),
  company_name: z.string().optional(),
  phone: z.string().optional(),
});

type ProfileFormData = z.infer<typeof profileSchema>;

type ProfileFormProps = {
  profile: Profile;
  onSuccess?: () => void;
};

export function ProfileForm({ profile, onSuccess }: ProfileFormProps) {
  const updateProfile = useUpdateProfile();

  const {
    control,
    handleSubmit,
    reset,
    formState: { errors, isDirty },
  } = useForm<ProfileFormData>({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      full_name: profile.full_name ?? "",
      company_name: profile.company_name ?? "",
      phone: profile.phone ?? "",
    },
  });

  useEffect(() => {
    reset({
      full_name: profile.full_name ?? "",
      company_name: profile.company_name ?? "",
      phone: profile.phone ?? "",
    });
  }, [profile, reset]);

  const onSubmit = async (data: ProfileFormData) => {
    try {
      await updateProfile.mutateAsync({
        full_name: data.full_name || null,
        company_name: data.company_name || null,
      });
      onSuccess?.();
    } catch (error) {
      console.error("Failed to update profile", error);
    }
  };

  return (
    <View className="gap-4">
      <Controller
        control={control}
        name="full_name"
        render={({ field: { onChange, onBlur, value } }) => (
          <TextField
            label="Full Name"
            value={value}
            onChangeText={onChange}
            onBlur={onBlur}
            error={errors.full_name?.message}
            testID={testIds.profile.fullNameInput}
          />
        )}
      />

      <Controller
        control={control}
        name="company_name"
        render={({ field: { onChange, onBlur, value } }) => (
          <TextField
            label="Company Name"
            value={value}
            onChangeText={onChange}
            onBlur={onBlur}
            error={errors.company_name?.message}
            testID={testIds.profile.companyNameInput}
          />
        )}
      />

      <Controller
        control={control}
        name="phone"
        render={({ field: { value } }) => (
          <TextField
            label="Phone"
            value={value}
            editable={false}
            testID={testIds.profile.phoneInput}
          />
        )}
      />

      <Text className="text-body text-muted-foreground">
        Phone numbers are managed through sign-in. Contact support to update.
      </Text>

      <Button
        variant="primary"
        onPress={handleSubmit(onSubmit)}
        disabled={!isDirty || updateProfile.isPending}
        loading={updateProfile.isPending}
        testID={testIds.profile.btnSave}
      >
        <Text className="text-body text-primary-foreground font-semibold">
          Save Changes
        </Text>
      </Button>
    </View>
  );
}
