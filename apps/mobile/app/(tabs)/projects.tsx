import { View, Text, FlatList, Pressable, RefreshControl } from "react-native";
import { useRouter } from "expo-router";
import { Plus, MapPin, Clock, HardHat } from "lucide-react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { useAuth } from "@/lib/auth";
import { useLocalProjects } from "@/hooks/useLocalProjects";
import { useRefresh } from "@/hooks/useRefresh";
import { formatDate } from "@/lib/report-helpers";
import { ProjectListSkeleton } from "@/components/skeletons/ProjectListSkeleton";
import { colors } from "@/lib/design-tokens/colors";

const ROLE_LABELS: Record<string, string> = {
  owner: "Owner",
  admin: "Admin",
  editor: "Editor",
  viewer: "Viewer",
};

export default function ProjectsScreen() {
  const router = useRouter();
  const { user } = useAuth();

  const {
    data: projects = [],
    isLoading,
    isLoadingInitialProjects,
    refetch,
  } = useLocalProjects(user?.id);
  const { refreshing, onRefresh } = useRefresh([refetch]);
  const isProjectsLoading = isLoading || isLoadingInitialProjects;

  return (
    <SafeAreaView className="flex-1 bg-background" edges={["top"]}>
      <View className="px-5 py-4">
        <ScreenHeader title="Projects" />
      </View>

      {isProjectsLoading ? (
        <ProjectListSkeleton />
      ) : (
        <FlatList
          data={projects}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 16, paddingBottom: 16, gap: 12 }}
          removeClippedSubviews={true}
          maxToRenderPerBatch={10}
          updateCellsBatchingPeriod={50}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          }
          ListHeaderComponent={
            projects.length === 0 ? null : (
              <View style={{ marginBottom: 12 }}>
                <Pressable
                  testID="btn-new-project"
                  onPress={() => router.push("/projects/new")}
                  accessibilityRole="button"
                  accessibilityLabel="Add new project"
                >
                  <View className="flex-row items-center gap-3 rounded-lg border border-dashed border-border bg-surface-muted p-4">
                    <View className="h-10 w-10 items-center justify-center rounded-md border border-border bg-card">
                      <Plus size={20} color={colors.foreground} />
                    </View>
                    <View className="flex-1">
                      <Text className="text-title-sm text-foreground">Add new project</Text>
                      <Text className="text-sm text-muted-foreground">
                        Create a destination for field notes and reports.
                      </Text>
                    </View>
                  </View>
                </Pressable>
              </View>
            )
          }
          ListEmptyComponent={
            <EmptyState
              icon={<HardHat size={28} color={colors.muted.foreground} />}
              title="No projects yet"
              description="Create your first project so field notes and daily reports have a clear destination."
              action={
                <Button
                  testID="btn-new-project"
                  variant="hero"
                  size="lg"
                  onPress={() => router.push("/projects/new")}
                  accessibilityLabel="Add new project"
                >
                  Add your first project
                </Button>
              }
            />
          }
          renderItem={({ item, index }) => (
            <View>
              <Pressable
                testID={`project-row-${index}`}
                onPress={() => router.push(`/projects/${item.id}`)}
              >
                <Card variant="emphasis" className="gap-3">
                  <View className="flex-row items-center justify-between">
                    <Text className="min-w-0 flex-1 text-title-sm text-foreground" numberOfLines={1}>
                      {item.name}
                    </Text>
                    <Text className="ml-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                      {ROLE_LABELS[item.role] ?? item.role}
                    </Text>
                  </View>
                  {item.address && (
                    <View className="flex-row items-center gap-1.5">
                      <MapPin size={14} color={colors.muted.foreground} />
                      <Text className="text-body text-muted-foreground">
                        {item.address}
                      </Text>
                    </View>
                  )}
                  <View className="flex-row items-center gap-1.5">
                    <Clock size={12} color={colors.muted.foreground} />
                    <Text className="text-sm text-muted-foreground">
                      Updated: {formatDate(item.updated_at)}
                    </Text>
                  </View>
                </Card>
              </Pressable>
            </View>
          )}
        />
      )}
    </SafeAreaView>
  );
}
