import { View } from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { Screen } from "@/shared/components/Screen";
import { LoadingDots } from "@/shared/components/LoadingDots";
import { ProjectForm } from "@/features/projects";
import { useProject, useUpdateProject } from "@/features/projects";

export default function EditProjectScreen() {
  const router = useRouter();
  const { projectId } = useLocalSearchParams<{ projectId: string }>();

  const { data: project, isLoading } = useProject(projectId);
  const updateProject = useUpdateProject(projectId!);

  const handleSubmit = async (data: { name: string; address?: string }) => {
    await updateProject.mutateAsync(data);
    router.back();
  };

  if (isLoading) {
    return (
      <Screen>
        <View className="flex-1 items-center justify-center">
          <LoadingDots />
        </View>
      </Screen>
    );
  }

  return (
    <Screen>
      <View className="flex-1 p-4">
        <ProjectForm
          initialData={{
            name: project?.name ?? "",
            address: project?.address ?? "",
          }}
          onSubmit={handleSubmit}
          submitLabel="Save Changes"
        />
      </View>
    </Screen>
  );
}
