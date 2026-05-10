/**
 * Create new report screen.
 */
import { useState } from "react";
import { View, Text, TextInput } from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { Screen } from "@/shared/components/Screen";
import { Button } from "@/shared/components/Button";
import { testIds } from "@/infra/test-ids";
import { useCreateReport } from "@/features/reports";

export default function NewReportScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ projectId?: string }>();
  const projectId = typeof params.projectId === "string" ? params.projectId : null;

  const [title, setTitle] = useState("");
  const createReport = useCreateReport();

  const handleCreate = async () => {
    if (!projectId || !title.trim()) return;
    
    const report = await createReport.mutateAsync({
      projectId,
      title: title.trim(),
    });

    router.replace(`/projects/${projectId}/reports/${report.id}`);
  };

  return (
    <Screen>
      <View className="flex-1 p-4">
        <Text className="text-2xl font-bold mb-6">New Report</Text>

        <View className="gap-3 mb-6">
          <View>
            <Text className="text-sm font-medium text-gray-600 mb-1">Title</Text>
            <TextInput
              className="rounded-md border border-gray-300 bg-white px-3 py-2 text-base text-gray-900"
              value={title}
              onChangeText={setTitle}
              placeholder="Enter report title"
              autoFocus
              testID={testIds.reports.newReportTitleInput}
            />
          </View>
        </View>

        <Button
          variant="primary"
          onPress={handleCreate}
          disabled={!title.trim() || createReport.isPending}
          loading={createReport.isPending}
          testID={testIds.reports.createReportButton}
        >
          <Text className="text-white font-medium">Create Report</Text>
        </Button>
      </View>
    </Screen>
  );
}
