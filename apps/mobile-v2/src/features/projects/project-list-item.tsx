import { Text, Pressable, View } from "react-native";
import { Card } from "@/shared/components/Card";
import { testIds } from "@/infra/test-ids";
import type { ProjectWithRole } from "./queries";

type ProjectListItemProps = {
  project: ProjectWithRole;
  onPress: (projectId: string) => void;
};

export function ProjectListItem({ project, onPress, index }: ProjectListItemProps & { index: number }) {
  const roleLabel =
    project.role.charAt(0).toUpperCase() + project.role.slice(1);

  return (
    <Pressable
      onPress={() => onPress(project.id)}
      testID={testIds.projects.row(index)}
    >
      <Card>
        <View>
          <Text className="text-title-md text-foreground">{project.name}</Text>
          {project.address && (
            <Text className="text-body text-muted-foreground mt-1">
              {project.address}
            </Text>
          )}
          <View className="mt-2">
            <Text className="text-label text-muted-foreground">{roleLabel}</Text>
          </View>
        </View>
      </Card>
    </Pressable>
  );
}
