import { useState } from "react";
import { View, Text, Pressable, ScrollView } from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { Users, FileText, Settings, Trash2 } from "lucide-react-native";
import { Screen } from "@/shared/components/Screen";
import { Card } from "@/shared/components/Card";
import { LoadingDots } from "@/shared/components/LoadingDots";
import { Sheet } from "@/shared/components/Sheet";
import { Button } from "@/shared/components/Button";
import { testIds } from "@/infra/test-ids";
import {
  useProject,
  useProjectMembers,
  useSoftDeleteProject,
} from "@/features/projects";
import { colors } from "@/design-tokens/colors";

export default function ProjectOverviewScreen() {
  const router = useRouter();
  const { projectId } = useLocalSearchParams<{ projectId: string }>();
  const [showDeleteSheet, setShowDeleteSheet] = useState(false);

  const { data: project, isLoading: projectLoading } = useProject(projectId);
  const { data: members = [] } = useProjectMembers(projectId);
  const deleteProject = useSoftDeleteProject();

  const handleDelete = async () => {
    await deleteProject.mutateAsync(projectId!);
    setShowDeleteSheet(false);
    router.replace("/projects");
  };

  if (projectLoading) {
    return (
      <Screen>
        <View className="flex-1 items-center justify-center">
          <LoadingDots />
        </View>
      </Screen>
    );
  }

  if (!project) {
    return (
      <Screen>
        <View className="flex-1 items-center justify-center">
          <Text className="text-body text-muted-foreground">
            Project not found
          </Text>
        </View>
      </Screen>
    );
  }

  return (
    <>
      <Screen>
        <ScrollView
          className="flex-1"
          contentContainerStyle={{ padding: 16, gap: 16 }}
        >
          <Card testID="project-overview-card">
            <View>
              <Text className="text-title-lg text-foreground">
                {project.name}
              </Text>
              {project.address && (
                <Text className="text-body text-muted-foreground mt-2">
                  {project.address}
                </Text>
              )}
            </View>
          </Card>

          <View className="gap-3">
            <Pressable
              onPress={() => router.push(`/projects/${projectId}/members`)}
              testID={testIds.projects.membersButton}
            >
              <Card>
                <View className="flex-row items-center justify-between">
                  <View className="flex-row items-center gap-3">
                    <Users size={20} color={colors.foreground} />
                    <View>
                      <Text className="text-title-sm text-foreground">
                        Members
                      </Text>
                      <Text className="text-body text-muted-foreground">
                        {members.length} member{members.length !== 1 ? "s" : ""}
                      </Text>
                    </View>
                  </View>
                </View>
              </Card>
            </Pressable>

            <Pressable
              onPress={() =>
                router.push(`/projects/${projectId}/reports` as any)
              }
              testID={testIds.projects.reportsButton}
            >
              <Card>
                <View className="flex-row items-center gap-3">
                  <FileText size={20} color={colors.foreground} />
                  <View>
                    <Text className="text-title-sm text-foreground">Reports</Text>
                    <Text className="text-body text-muted-foreground">
                      View all reports
                    </Text>
                  </View>
                </View>
              </Card>
            </Pressable>

            <Pressable
              onPress={() => router.push(`/projects/${projectId}/edit`)}
              testID={testIds.projects.editButton}
            >
              <Card>
                <View className="flex-row items-center gap-3">
                  <Settings size={20} color={colors.foreground} />
                  <View>
                    <Text className="text-title-sm text-foreground">
                      Edit Project
                    </Text>
                    <Text className="text-body text-muted-foreground">
                      Update name and address
                    </Text>
                  </View>
                </View>
              </Card>
            </Pressable>

            <Pressable
              onPress={() => setShowDeleteSheet(true)}
              testID={testIds.projects.deleteButton}
            >
              <Card>
                <View className="flex-row items-center gap-3">
                  <Trash2 size={20} color={colors.destructive.DEFAULT} />
                  <View>
                    <Text className="text-title-sm text-destructive">
                      Delete Project
                    </Text>
                    <Text className="text-body text-muted-foreground">
                      Permanently remove this project
                    </Text>
                  </View>
                </View>
              </Card>
            </Pressable>
          </View>
        </ScrollView>
      </Screen>

      <Sheet visible={showDeleteSheet} onClose={() => setShowDeleteSheet(false)}>
        <Sheet.Title>Delete Project</Sheet.Title>
        <Sheet.Body>
          <Text className="text-body text-foreground">
            Are you sure you want to delete "{project.name}"? This action cannot be
            undone.
          </Text>
        </Sheet.Body>
        <Sheet.Actions>
          <Button variant="ghost" onPress={() => setShowDeleteSheet(false)}>
            <Text className="text-body">Cancel</Text>
          </Button>
          <Button
            variant="destructive"
            onPress={handleDelete}
            loading={deleteProject.isPending}
            testID={testIds.projects.confirmDelete}
          >
            <Text className="text-body text-primary-foreground">Delete</Text>
          </Button>
        </Sheet.Actions>
      </Sheet>
    </>
  );
}
