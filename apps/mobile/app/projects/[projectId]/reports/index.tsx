import { View, Text, FlatList, Pressable, ActivityIndicator } from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { ArrowLeft, Plus, FileText, ClipboardList, Pencil } from "lucide-react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Animated, { FadeInDown } from "react-native-reanimated";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/Button";
import { useAuth } from "@/lib/auth";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { backend } from "@/lib/backend";
import { formatDate } from "@/lib/report-helpers";

type Report = {
  id: string;
  title: string;
  report_type: string;
  status: string;
  visit_date: string | null;
  created_at: string;
};

export default function ReportListScreen() {
  const router = useRouter();
  const { projectId } = useLocalSearchParams<{ projectId: string }>();
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const { data: project } = useQuery<{ name: string }>({
    queryKey: ["project", projectId],
    queryFn: async () => {
      const { data, error } = await backend
        .from("projects")
        .select("name")
        .eq("id", projectId)
        .single();
      if (error) throw error;
      return data;
    },
  });

  const { data: reports = [], isLoading } = useQuery<Report[]>({
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

  return (
    <SafeAreaView className="flex-1 bg-background" edges={["top"]}>
      <View className="px-5 py-4">
        <ScreenHeader
          eyebrow={project?.name ?? "Site"}
          title="Reports"
          subtitle="Open finalized reports or continue drafts for this site."
          onBack={() => router.back()}
          backLabel="Sites"
          trailing={
            <Button
              onPress={() => createDraft()}
              disabled={isCreatingDraft}
              accessibilityLabel="Create new report"
              className="flex-row items-center gap-1.5"
            >
              {isCreatingDraft ? (
                <ActivityIndicator size={16} color="#ffffff" />
              ) : (
                <Plus size={18} color="#ffffff" />
              )}
              <Text className="text-sm font-semibold text-primary-foreground">New Report</Text>
            </Button>
          }
        />
        <Button
          variant="secondary"
          size="sm"
          onPress={() => router.push(`/projects/${projectId}/edit`)}
          className="mt-4 self-start"
          accessibilityLabel="Edit site details"
        >
          <View className="flex-row items-center gap-2">
            <Pencil size={14} color="#1a1a2e" />
            <Text className="text-sm font-semibold text-foreground">Edit Site</Text>
          </View>
        </Button>
      </View>

      {isLoading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color="#1a1a2e" />
        </View>
      ) : (
        <FlatList
          data={reports}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 16, gap: 12 }}
          removeClippedSubviews={true}
          maxToRenderPerBatch={10}
          updateCellsBatchingPeriod={50}
          ListEmptyComponent={
            <EmptyState
              icon={<ClipboardList size={28} color="#5c5c6e" />}
              title="No reports yet"
              description="Start the first report for this site and the drafts/final reports will appear here."
            />
          }
          renderItem={({ item, index }) => (
            <Animated.View entering={FadeInDown.duration(150).delay(index * 50)}>
              <Pressable
                onPress={() => {
                  if (item.status === "draft") {
                    router.push(`/projects/${projectId}/reports/generate?reportId=${item.id}`);
                  } else {
                    router.push(`/projects/${projectId}/reports/${item.id}`);
                  }
                }}
                accessibilityRole="button"
                accessibilityLabel={`${item.title || "Untitled Report"}, ${formatDate(item.visit_date)}`}
              >
                <Card
                  variant={item.status === "draft" ? "emphasis" : "default"}
                  className="flex-row items-center justify-between"
                >
                  <View className="flex-row items-center gap-3 flex-1">
                    <View className="h-10 w-10 items-center justify-center rounded-md border border-border bg-card">
                      <FileText size={20} color="#5c5c6e" />
                    </View>
                    <View className="min-w-0 flex-1">
                      <View className="min-w-0 flex-row items-start gap-2 pr-2">
                        <Text
                          className="flex-1 text-title-sm text-foreground"
                          numberOfLines={2}
                        >
                          {item.title || "Untitled Report"}
                        </Text>
                        {item.status === "draft" && (
                          <View className="mt-0.5 shrink-0 rounded-md border border-warning-border bg-warning-soft px-2 py-1">
                            <Text className="text-xs font-semibold uppercase text-warning-text">Draft</Text>
                          </View>
                        )}
                      </View>
                      <Text className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                        {item.report_type.replace("_", " ")}
                      </Text>
                      <Text className="mt-1 text-body text-muted-foreground">
                        {formatDate(item.visit_date ?? item.created_at)}
                      </Text>
                    </View>
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
