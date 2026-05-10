/**
 * Reports list screen — shows all reports for a project.
 */
import { View, Text, Pressable, ScrollView } from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { Plus } from "lucide-react-native";
import { Screen } from "@/shared/components/Screen";
import { Button } from "@/shared/components/Button";
import { Card } from "@/shared/components/Card";
import { EmptyState } from "@/shared/components/EmptyState";
import { testIds } from "@/infra/test-ids";
import { useReports } from "@/features/reports";

export default function ReportsListScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ projectId?: string }>();
  const projectId = typeof params.projectId === "string" ? params.projectId : null;

  const { data: reports, isLoading } = useReports(projectId);

  const handleCreateReport = () => {
    if (!projectId) return;
    router.push(`/projects/${projectId}/reports/new`);
  };

  const handleReportPress = (reportId: string) => {
    if (!projectId) return;
    router.push(`/projects/${projectId}/reports/${reportId}`);
  };

  return (
    <Screen>
      <View className="flex-1 p-4">
        <View className="flex-row justify-between items-center mb-4">
          <Text className="text-2xl font-bold">Reports</Text>
          <Button
            variant="primary"
            onPress={handleCreateReport}
            testID={testIds.reports.createButton}
          >
            <Plus size={20} color="#fff" />
            <Text className="text-white ml-2">New</Text>
          </Button>
        </View>

        {isLoading ? (
          <View className="flex-1 items-center justify-center">
            <Text className="text-gray-500">Loading reports...</Text>
          </View>
        ) : reports && reports.length > 0 ? (
          <ScrollView
            className="flex-1"
            testID={testIds.reports.list}
            contentContainerClassName="gap-3"
          >
            {reports.map((report) => (
              <Pressable
                key={report.id}
                onPress={() => handleReportPress(report.id)}
                testID={testIds.reports.card(report.id)}
              >
                <Card>
                  <Text className="text-lg font-semibold text-gray-900">
                    {report.title || "Untitled Report"}
                  </Text>
                  <View className="flex-row gap-2 mt-2">
                    <Text className="text-sm text-gray-600 capitalize">{report.status}</Text>
                    <Text className="text-sm text-gray-400">•</Text>
                    <Text className="text-sm text-gray-600">
                      {new Date(report.created_at).toLocaleDateString()}
                    </Text>
                  </View>
                </Card>
              </Pressable>
            ))}
          </ScrollView>
        ) : (
          <EmptyState title="No reports yet" message="Create your first report." />
        )}
      </View>
    </Screen>
  );
}
