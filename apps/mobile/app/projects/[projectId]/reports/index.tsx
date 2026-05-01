import { View, Text, SectionList, Pressable, ActivityIndicator, RefreshControl } from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { Plus, FileText, ClipboardList } from "lucide-react-native";
import { SafeAreaView } from "@/components/ui/SafeAreaView";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { useLocalProject } from "@/hooks/useLocalProjects";
import { useLocalReports, useLocalReportMutations } from "@/hooks/useLocalReports";
import { useRefresh } from "@/hooks/useRefresh";
import { ReportsListSkeleton } from "@/components/skeletons/ReportsListSkeleton";
import { colors } from "@/lib/design-tokens/colors";
import { randomId } from "@/lib/local-db/clock";
import {
  buildProjectReportsSections,
  getProjectReportMeta,
  getProjectReportTitle,
  type ProjectReportListItem,
} from "@/lib/project-reports-list";

export default function ReportListScreen() {
  const router = useRouter();
  const { projectId } = useLocalSearchParams<{ projectId: string }>();

  const { data: project } = useLocalProject(projectId);

  const { data: reports = [], isLoading, refetch } =
    useLocalReports(projectId) as {
      data: ProjectReportListItem[];
      isLoading: boolean;
      refetch: () => Promise<unknown>;
    };

  const { refreshing, onRefresh } = useRefresh([refetch]);

  const { create } = useLocalReportMutations();
  const isCreatingDraft = create.isPending;
  const createDraft = () => {
    const optimisticId = randomId();
    // Navigate immediately — the local SQLite write completes in <5ms
    // so the generate screen picks up the row almost instantly.
    router.push(`/projects/${projectId}/reports/generate?reportId=${optimisticId}`);
    create.mutate({ projectId, reportType: "daily", optimisticId });
  };

  const sections = buildProjectReportsSections(reports);

  return (
    <SafeAreaView className="flex-1 bg-background" edges={["top"]}>
      <View className="px-5 pt-4 pb-2">
        <ScreenHeader
          title="Reports"
          subtitle={project?.name ?? undefined}
          onBack={() => router.back()}
          backLabel="Overview"
        />
      </View>

      {isLoading ? (
        <ReportsListSkeleton />
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={(item) => item.id}
          stickySectionHeadersEnabled={false}
          contentContainerStyle={{ paddingBottom: 16, paddingTop: 8 }}
          removeClippedSubviews={true}
          maxToRenderPerBatch={10}
          updateCellsBatchingPeriod={50}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          }
          renderSectionHeader={() => null}
          ListHeaderComponent={
            <View className="px-5 pt-3">
              <Pressable
                testID="btn-new-report"
                onPress={() => {
                  if (!isCreatingDraft) createDraft();
                }}
                disabled={isCreatingDraft}
                accessibilityRole="button"
                accessibilityLabel="Create new report"
              >
                <View
                  className="flex-row items-center gap-3 rounded-lg border border-dashed border-border bg-surface-muted p-3"
                  style={{ opacity: isCreatingDraft ? 0.6 : 1 }}
                >
                  <View className="h-10 w-10 items-center justify-center rounded-md border border-border bg-card">
                    {isCreatingDraft ? (
                      <ActivityIndicator size={16} color={colors.foreground} />
                    ) : (
                      <Plus size={20} color={colors.foreground} />
                    )}
                  </View>
                  <View className="flex-1">
                    <Text className="text-lg font-semibold text-foreground">
                      New report
                    </Text>
                    <Text className="text-sm text-muted-foreground">
                      Start a draft for this project.
                    </Text>
                  </View>
                </View>
              </Pressable>
            </View>
          }
          ListEmptyComponent={
            <View className="px-5 pt-4">
              <EmptyState
                icon={<ClipboardList size={28} color={colors.muted.foreground} />}
                title="No reports yet"
                description="Start the first report for this project and the drafts/final reports will appear here."
              />
            </View>
          }
          renderItem={({ item, index }) => (
            <View
              className="px-5 pt-3"
            >
              <Pressable
                testID={`report-row-${item.status}-${index}`}
                onPress={() => {
                  if (item.status === "draft") {
                    router.push(`/projects/${projectId}/reports/generate?reportId=${item.id}`);
                  } else {
                    router.push(`/projects/${projectId}/reports/${item.id}`);
                  }
                }}
                accessibilityRole="button"
              >
                <Card
                  variant={item.status === "draft" ? "emphasis" : "default"}
                  padding="sm"
                  className="flex-row items-center gap-3"
                >
                  <View className="h-10 w-10 items-center justify-center rounded-md border border-border bg-card">
                    <FileText size={20} color={colors.muted.foreground} />
                  </View>
                  <View className="min-w-0 flex-1 gap-1">
                    <View className="min-w-0 flex-row items-start gap-2">
                      <Text
                        className="flex-1 text-lg font-semibold text-foreground"
                        numberOfLines={2}
                      >
                        {getProjectReportTitle(item)}
                      </Text>
                      {item.status === "draft" && (
                        <View className="mt-0.5 shrink-0 rounded-md border border-warning-border bg-warning-soft px-2 py-1">
                          <Text className="text-xs font-semibold uppercase text-warning-text">
                            Draft
                          </Text>
                        </View>
                      )}
                    </View>
                    <Text className="text-sm text-muted-foreground">
                      {getProjectReportMeta(item)}
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
