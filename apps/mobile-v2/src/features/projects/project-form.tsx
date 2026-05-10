import { useState } from "react";
import { View } from "react-native";
import { TextField } from "@/shared/components/TextField";
import { Button } from "@/shared/components/Button";
import { testIds } from "@/infra/test-ids";
import { z } from "zod";

const projectSchema = z.object({
  name: z.string().min(1, "Project name is required"),
  address: z.string().optional(),
});

type ProjectFormData = z.infer<typeof projectSchema>;

type ProjectFormProps = {
  initialData?: Partial<ProjectFormData>;
  onSubmit: (data: ProjectFormData) => Promise<void>;
  submitLabel: string;
};

export function ProjectForm({
  initialData,
  onSubmit,
  submitLabel,
}: ProjectFormProps) {
  const [name, setName] = useState(initialData?.name ?? "");
  const [address, setAddress] = useState(initialData?.address ?? "");
  const [errors, setErrors] = useState<Partial<Record<keyof ProjectFormData, string>>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async () => {
    setErrors({});
    
    const result = projectSchema.safeParse({ name, address });
    if (!result.success) {
      const fieldErrors: Partial<Record<keyof ProjectFormData, string>> = {};
      // @ts-expect-error: Zod v4 API change - errors property access
      result.error.errors.forEach((err: any) => {
        if (err.path[0]) {
          fieldErrors[err.path[0] as keyof ProjectFormData] = err.message;
        }
      });
      setErrors(fieldErrors);
      return;
    }

    setIsSubmitting(true);
    try {
      await onSubmit(result.data);
    } catch (error) {
      setErrors({
        name: error instanceof Error ? error.message : "Failed to save project",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <View className="gap-4">
      <TextField
        label="Project Name"
        value={name}
        onChangeText={setName}
        placeholder="Enter project name"
        error={errors.name}
        testID={testIds.projects.form.nameInput}
      />
      <TextField
        label="Address (Optional)"
        value={address}
        onChangeText={setAddress}
        placeholder="Enter project address"
        error={errors.address}
        testID={testIds.projects.form.addressInput}
      />
      <Button
        onPress={handleSubmit}
        loading={isSubmitting}
        testID={testIds.projects.form.submitButton}
      >
        <View className="text-primary-foreground text-body font-semibold">
          {submitLabel}
        </View>
      </Button>
    </View>
  );
}
