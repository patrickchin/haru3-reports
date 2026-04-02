import { useState } from "react";
import { View, Text, FlatList, Pressable, ScrollView, ActivityIndicator } from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { ArrowLeft, Plus, FileText, ClipboardList, Pencil } from "lucide-react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Animated, { FadeInDown } from "react-native-reanimated";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { backend } from "@/lib/backend";
import { toTitleCase, formatDate } from "@/lib/report-helpers";

const REPORT_FILTERS = ["All", "daily", "safety", "incident"] as const;

type Report = {
  id: string;
  title: string;
  report_type: string;
  status: string;
  confidence: number | null;
  visit_date: string | null;
};

export default function ReportListScreen() {
  const router = useRouter();
  const { projectId } = useLocalSearchParams<{ projectId: string }>();
  const [filter, setFilter] = useState<string>("All");

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
    queryKey: ["reports", projectId, filter],
    queryFn: async () => {
      let query = backend
        .from("reports")
        .select("id, title, report_type, status, confidence, visit_date")
        .eq("project_id", projectId)
        .order("visit_date", { ascending: false });

      if (filter !== "All") {
        query = query.eq("report_type", filter);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
  });

  return (
    <SafeAreaView className="flex-1 bg-background" edges={["top"]}>
      <View className="px-5 pt-4 pb-4">
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
            size="icon"
            onPress={() =>
              router.push(`/projects/${projectId}/reports/generate`)
            }
            accessibilityLabel="Create new report"
          >
            <Plus size={20} color="#ffffff" />
          </Button>
        </View>
      </View>

      {/* Filter pills */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        className="flex-grow-0"
        contentContainerStyle={{ paddingHorizontal: 20, gap: 8, paddingBottom: 16 }}
      >
        {REPORT_FILTERS.map((f) => (
          <Pressable
            key={f}
            onPress={() => setFilter(f)}
            className={`px-4 py-2 ${
              filter === f ? "bg-foreground" : "border border-border bg-card"
            }`}
            accessibilityRole="button"
            accessibilityLabel={`Filter by ${f}`}
            accessibilityState={{ selected: filter === f }}
          >
            <Text
              className={`text-lg font-medium ${
                filter === f
                  ? "text-primary-foreground"
                  : "text-secondary-foreground"
              }`}
            >
              {f === "All" ? f : toTitleCase(f)}
            </Text>
          </Pressable>
        ))}
      </ScrollView>

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
                onPress={() =>
                  router.push(`/projects/${projectId}/reports/${item.id}`)
                }
                accessibilityRole="button"
                accessibilityLabel={`${item.title}, ${formatDate(item.visit_date)}, ${item.status}`}
              >
                <Card className="flex-row items-center justify-between">
                  <View className="flex-row items-center gap-3 flex-1">
                    <View className="h-10 w-10 items-center justify-center border border-border">
                      <FileText size={20} color="#5c5c6e" />
                    </View>
                    <View className="flex-1">
                      <Text className="text-lg font-semibold text-foreground">
                        {item.title}
                      </Text>
                      <Text className="text-base text-muted-foreground">
                        {formatDate(item.visit_date)}
                      </Text>
                    </View>
                  </View>
                  <View className="items-end gap-1.5">
                    <Badge
                      variant={item.status === "draft" ? "draft" : "final"}
                    >
                      {toTitleCase(item.status)}
                    </Badge>
                    {item.confidence != null && (
                      <View className="border border-foreground px-2 py-0.5">
                        <Text className="text-sm font-semibold text-foreground">
                          {item.confidence}%
                        </Text>
                      </View>
                    )}
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
