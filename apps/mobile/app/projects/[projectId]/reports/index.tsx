import { View, Text, SectionList, Pressable, ActivityIndicator } from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { Plus, FileText, ClipboardList, Pencil, ArrowLeft } from "lucide-react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Animated, { FadeInDown } from "react-native-reanimated";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/Button";
import { useAuth } from "@/lib/auth";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { AppHeaderActions } from "@/components/ui/AppHeaderActions";
import { backend } from "@/lib/backend";
import {
  buildProjectReportsSections,
  getProjectReportMeta,
  getProjectReportsScreenTitle,
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
  const screenTitle = getProjectReportsScreenTitle(project?.name);

  return (
    <SafeAreaView className="flex-1 bg-background" edges={["top"]}>
      <View className="px-5 pt-4 pb-2">
        <View className="min-h-touch flex-row items-center justify-between gap-3">
          <Button
            onPress={() => router.back()}
            variant="outline"
            size="default"
            className="self-start px-4"
            accessibilityRole="button"
            accessibilityLabel="Back to site overview"
          >
            <View className="h-full flex-row items-center gap-2">
              <ArrowLeft size={16} color="#1a1a2e" />
              <Text
                className="text-sm font-semibold text-foreground"
                style={{ lineHeight: 16, includeFontPadding: false }}
              >
                Overview
              </Text>
            </View>
          </Button>
          <AppHeaderActions />
        </View>
      </View>
      <View className="px-5 pb-1">
        <Text className="text-title text-foreground">{screenTitle}</Text>
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
          contentContainerStyle={{ paddingBottom: 16 }}
          removeClippedSubviews={true}
          maxToRenderPerBatch={10}
          updateCellsBatchingPeriod={50}
          ListHeaderComponent={
            <View className="px-5 pt-0 pb-4">
              <View className="flex-row flex-wrap items-center justify-between gap-3">
                {project?.address ? (
                  <Text className="flex-1 text-body text-muted-foreground">
                    {project.address}
                  </Text>
                ) : (
                  <View className="flex-1" />
                )}

                <Button
                  variant="outline"
                  size="sm"
                  onPress={() => router.push(`/projects/${projectId}/edit`)}
                  className="shrink-0 flex-row items-center gap-1.5"
                  accessibilityLabel="Edit site details"
                >
                  <Pencil size={14} color="#1a1a2e" />
                  <Text className="text-sm font-semibold text-foreground">
                    Edit Site
                  </Text>
                </Button>
              </View>
            </View>
          }
          renderSectionHeader={() => (
            <View className="border-y border-border bg-background px-5 py-3">
              <View className="flex-row items-center justify-between gap-3">
                <Text className="text-display text-foreground">Reports</Text>
                <Button
                  onPress={() => createDraft()}
                  disabled={isCreatingDraft}
                  size="sm"
                  accessibilityLabel="Create new report"
                  className="shrink-0 flex-row items-center gap-1.5"
                >
                  {isCreatingDraft ? (
                    <ActivityIndicator size={16} color="#ffffff" />
                  ) : (
                    <Plus size={16} color="#ffffff" />
                  )}
                  <Text className="text-sm font-semibold text-primary-foreground">
                    New Report
                  </Text>
                </Button>
              </View>
            </View>
          )}
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
              entering={FadeInDown.duration(150).delay(index * 50)}
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
