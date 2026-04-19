import { View, Text, FlatList, Pressable, ActivityIndicator } from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { ArrowLeft, Plus, FileText, ClipboardList, Pencil } from "lucide-react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Animated, { FadeInDown } from "react-native-reanimated";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/Button";
import { useAuth } from "@/lib/auth";
import { Card } from "@/components/ui/Card";
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
        <View className="mb-5 flex-row items-center justify-between">
          <Pressable
            onPress={() => router.back()}
            className="flex-row items-center gap-2 self-start border border-foreground px-4 py-2 active:opacity-75"
            accessibilityRole="button"
            accessibilityLabel="Go back to projects"
          >
            <ArrowLeft size={16} color="#1a1a2e" />
            <Text className="text-sm font-semibold uppercase tracking-wider text-foreground">Projects</Text>
          </Pressable>
          <Pressable
            onPress={() => router.push(`/projects/${projectId}/edit`)}
            className="flex-row items-center gap-2 self-start border border-border bg-card px-4 py-2 active:opacity-75"
            accessibilityRole="button"
            accessibilityLabel="Edit project"
          >
            <Pencil size={14} color="#5c5c6e" />
            <Text className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Edit Project</Text>
          </Pressable>
        </View>
        <View className="flex-row items-center justify-between">
          <View>
            {project?.name && (
              <Text className="text-base text-muted-foreground mb-0.5">
                {project.name}
              </Text>
            )}
            <Text className="text-3xl font-bold tracking-tight text-foreground">
              Reports
            </Text>
          </View>
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
        </View>
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
            <View className="items-center justify-center py-20">
              <View className="h-16 w-16 items-center justify-center border border-border bg-card">
                <ClipboardList size={28} color="#5c5c6e" />
              </View>
              <Text className="mt-4 text-center text-lg font-medium text-muted-foreground">
                No reports yet
              </Text>
              <Text className="mt-1 text-center text-base text-muted-foreground">
                Tap + to generate your first report.
              </Text>
            </View>
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
                <Card className="flex-row items-center justify-between">
                  <View className="flex-row items-center gap-3 flex-1">
                    <View className="h-10 w-10 items-center justify-center border border-border">
                      <FileText size={20} color="#5c5c6e" />
                    </View>
                    <View className="flex-1">
                      <View className="flex-row items-center gap-2">
                        <Text className="text-lg font-semibold text-foreground">
                          {item.title || "Untitled Report"}
                        </Text>
                        {item.status === "draft" && (
                          <View className="border border-orange-300 bg-orange-50 px-2 py-0.5">
                            <Text className="text-xs font-semibold uppercase text-orange-600">Draft</Text>
                          </View>
                        )}
                      </View>
                      <Text className="text-base text-muted-foreground">
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
