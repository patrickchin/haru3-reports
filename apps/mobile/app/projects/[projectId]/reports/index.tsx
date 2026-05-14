import { View, SectionList, RefreshControl } from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { ClipboardList } from "lucide-react-native";
import { ReportListRow, ReportListNewButton } from "@harpa/report-ui/reports-list";
import { SafeAreaView } from "@/components/ui/SafeAreaView";
import { EmptyState } from "@/components/ui/EmptyState";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { useLocalProject } from "@/hooks/useLocalProjects";
import { useLocalReports, useLocalReportMutations } from "@/hooks/useLocalReports";
import { useProjectRole } from "@/hooks/useProjectRole";
import { useRefresh } from "@/hooks/useRefresh";
import { ReportsListSkeleton } from "@/components/skeletons/ReportsListSkeleton";
import { colors } from "@/lib/design-tokens/colors";
import {
  buildProjectReportsSections,
  getProjectReportMeta,
  getProjectReportTitle,
  type ProjectReportListItem,
} from "@/lib/project-reports-list";
import { safeRandomUUID } from "@/lib/uuid";

export default function ReportListScreen() {
  const router = useRouter();
  const { projectId } = useLocalSearchParams<{ projectId: string }>();

  const { data: project } = useLocalProject(projectId);
  const { can: projectCan } = useProjectRole(projectId);

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
    const optimisticId = safeRandomUUID();
    // Navigate immediately — the optimistic row is rendered while the
    // server insert (started below) finishes in the background.
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
            projectCan.writeReport ? (
              <ReportListNewButton
                testID="btn-new-report"
                isLoading={isCreatingDraft}
                onPress={createDraft}
              />
            ) : null
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
            <ReportListRow
              testID={`report-row-${item.status}-${index}`}
              status={item.status}
              title={getProjectReportTitle(item)}
              meta={getProjectReportMeta(item)}
              onPress={() => {
                if (item.status === "draft") {
                  router.push(`/projects/${projectId}/reports/generate?reportId=${item.id}`);
                } else {
                  router.push(`/projects/${projectId}/reports/${item.id}`);
                }
              }}
            />
          )}
        />
      )}
    </SafeAreaView>
  );
}
