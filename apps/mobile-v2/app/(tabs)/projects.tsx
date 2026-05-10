import { Text, View } from "react-native";
import { Screen } from "@/shared/components/Screen";
import { EmptyState } from "@/shared/components/EmptyState";
import { testIds } from "@/infra/test-ids";

export default function ProjectsScreen() {
  return (
    <Screen>
      <View className="flex-1" testID={testIds.projects.list}>
        <EmptyState
          title="Projects"
          message="Phase 1: Project list will appear here"
        />
      </View>
    </Screen>
  );
}
