import { View, Text, SectionList, Pressable, ActivityIndicator } from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { Plus, FileText, ClipboardList } from "lucide-react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Animated, { FadeInDown } from "react-native-reanimated";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { backend } from "@/lib/backend";
import {
  buildProjectReportsSections,
  getProjectReportMeta,
  getProjectReportTitle,
  type ProjectReportListItem,
} from "@/lib/project-reports-list";

export default function ReportListScreen() {
  const router = useRouter();
  const { projectId } = useLocalSearchParams<{ projectId: string }>();
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const { data: project } = useQuery<{ name: string; address: string | null }>({
    queryKey: ["project", projectId],
    queryFn: async () => {
      const { data, error } = await backend
        .from("projects")
        .select("name, address")
        .eq("id", projectId)
        .single();
      if (error) throw error;
      return data;
    },
  });

  const { data: reports = [], isLoading } = useQuery<ProjectReportListItem[]>({
    queryKey: ["reports", projectId],
    queryFn: async () => {
      const { data, error } = await backend
        .from("reports")
        .select("id, title, report_type, status, visit_date, created_at")
        .eq("project_id", projectId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const { mutate: createDraft, isPending: isCreatingDraft } = useMutation({
    mutationFn: async () => {
      const { data, error } = await backend
        .from("reports")
        .insert({
          project_id: projectId,
          owner_id: user!.id,
          title: "",
          report_type: "daily",
          status: "draft",
          notes: [],
        })
        .select("id")
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["reports", projectId] });
      router.push(`/projects/${projectId}/reports/generate?reportId=${data.id}`);
    },
  });

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
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color="#1a1a2e" />
        </View>
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={(item) => item.id}
          stickySectionHeadersEnabled={false}
          contentContainerStyle={{ paddingBottom: 16, paddingTop: 8 }}
          removeClippedSubviews={true}
          maxToRenderPerBatch={10}
          updateCellsBatchingPeriod={50}
          renderSectionHeader={() => null}
          ListHeaderComponent={
            <Animated.View entering={FadeInDown.duration(70)} className="px-5 pt-3">
              <Pressable
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
                      <ActivityIndicator size={16} color="#1a1a2e" />
                    ) : (
                      <Plus size={20} color="#1a1a2e" />
                    )}
                  </View>
                  <View className="flex-1">
                    <Text className="text-lg font-semibold text-foreground">
                      New report
                    </Text>
                    <Text className="text-sm text-muted-foreground">
                      Start a draft for this site.
                    </Text>
                  </View>
                </View>
              </Pressable>
            </Animated.View>
          }
          ListEmptyComponent={
            <View className="px-5 pt-4">
              <EmptyState
                icon={<ClipboardList size={28} color="#5c5c6e" />}
                title="No reports yet"
                description="Start the first report for this site and the drafts/final reports will appear here."
              />
            </View>
          }
          renderItem={({ item, index }) => (
            <Animated.View
              entering={FadeInDown.duration(100).delay(index * 30)}
              className="px-5 pt-3"
            >
              <Pressable
                onPress={() => {
                  if (item.status === "draft") {
                    router.push(`/projects/${projectId}/reports/generate?reportId=${item.id}`);
                  } else {
                    router.push(`/projects/${projectId}/reports/${item.id}`);
                  }
                }}
                accessibilityRole="button"
                accessibilityLabel={`${getProjectReportTitle(item)}, ${getProjectReportMeta(item)}`}
              >
                <Card
                  variant={item.status === "draft" ? "emphasis" : "default"}
                  padding="sm"
                  className="flex-row items-center gap-3"
                >
                  <View className="h-10 w-10 items-center justify-center rounded-md border border-border bg-card">
                    <FileText size={20} color="#5c5c6e" />
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
            </Animated.View>
          )}
        />
      )}
    </SafeAreaView>
  );
}
