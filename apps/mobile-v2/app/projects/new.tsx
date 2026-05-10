import { View } from "react-native";
import { useRouter } from "expo-router";
import { Screen } from "@/shared/components/Screen";
import { ProjectForm } from "@/features/projects";
import { useCreateProject } from "@/features/projects";
import { useAuth } from "@/features/auth/auth-context";

export default function NewProjectScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const createProject = useCreateProject(user?.id ?? "");

  const handleSubmit = async (data: { name: string; address?: string }) => {
    await createProject.mutateAsync(data);
    router.back();
  };

  return (
    <Screen>
      <View className="flex-1 p-4">
        <ProjectForm
          onSubmit={handleSubmit}
          submitLabel="Create Project"
        />
      </View>
    </Screen>
  );
}
