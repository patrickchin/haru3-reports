import { View, FlatList, Pressable, Text } from "react-native";
import { useRouter } from "expo-router";
import { Plus } from "lucide-react-native";
import { Screen } from "@/shared/components/Screen";
import { EmptyState } from "@/shared/components/EmptyState";
import { LoadingDots } from "@/shared/components/LoadingDots";
import { testIds } from "@/infra/test-ids";
import { useProjects, ProjectListItem } from "@/features/projects";
import { useAuth } from "@/features/auth/auth-context";
import { colors } from "@/design-tokens/colors";

export default function ProjectsScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const { data: projects = [], isLoading } = useProjects(user?.id ?? null);

  const handleProjectPress = (projectId: string) => {
    router.push(`/projects/${projectId}`);
  };

  const handleCreateProject = () => {
    router.push("/projects/new");
  };

  return (
    <Screen>
      <View className="flex-1" testID={testIds.projects.list}>
        {isLoading ? (
          <View className="flex-1 items-center justify-center">
            <LoadingDots />
          </View>
        ) : projects.length === 0 ? (
          <EmptyState
            title="No Projects"
            message="Create your first project to get started"
          />
        ) : (
          <FlatList
            data={projects}
            keyExtractor={(item) => item.id}
            renderItem={({ item, index }) => (
              <ProjectListItem project={item} onPress={handleProjectPress} index={index} />
            )}
            contentContainerStyle={{ padding: 16, gap: 12 }}
          />
        )}

        <View className="absolute bottom-6 right-6">
          <Pressable
            onPress={handleCreateProject}
            testID={testIds.projects.createButton}
            className="bg-primary rounded-full w-14 h-14 items-center justify-center shadow-lg"
          >
            <Plus size={28} color={colors.primary.foreground} />
          </Pressable>
        </View>
      </View>
    </Screen>
  );
}
