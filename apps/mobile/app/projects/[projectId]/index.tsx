import { View, Text, ScrollView, Pressable, ActivityIndicator } from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import {
  ChevronRight,
  ClipboardList,
  FileText,
  FolderOpen,
  HardHat,
  MapPin,
  Pencil,
  Users,
  type LucideIcon,
} from "lucide-react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Animated, { FadeInDown } from "react-native-reanimated";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { StatTile } from "@/components/ui/StatTile";
import { backend } from "@/lib/backend";
import type { ProjectReportListItem } from "@/lib/project-reports-list";
import {
  computeProjectOverviewStats,
  formatRelativeTime,
} from "@/lib/project-overview";

interface OverviewAction {
  key: string;
  title: string;
  description: string;
  icon: LucideIcon;
  onPress?: () => void;
  comingSoon?: boolean;
  testID?: string;
}

export default function ProjectOverviewScreen() {
  const router = useRouter();
  const { projectId } = useLocalSearchParams<{ projectId: string }>();

  const { data: project, isLoading: isLoadingProject } = useQuery<{
    name: string;
    address: string | null;
    client_name: string | null;
  }>({
    queryKey: ["project", projectId],
    queryFn: async () => {
      const { data, error } = await backend
        .from("projects")
        .select("name, address, client_name")
        .eq("id", projectId)
        .single();
      if (error) throw error;
      return data;
    },
  });

  const { data: reports = [], isLoading: isLoadingReports } = useQuery<ProjectReportListItem[]>({
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

  const stats = computeProjectOverviewStats(reports);
  const lastReportRelative = formatRelativeTime(stats.lastReportAt);

  const actions: OverviewAction[] = [
    {
      key: "reports",
      title: "Reports",
      description:
        stats.totalReports === 0
          ? "No reports yet"
          : `${stats.totalReports} report${stats.totalReports === 1 ? "" : "s"} · Last ${lastReportRelative.toLowerCase()}`,
      icon: ClipboardList,
      onPress: () => router.push(`/projects/${projectId}/reports`),
      testID: "btn-open-reports",
    },
    {
      key: "documents",
      title: "Documents",
      description: "Drawings, permits, contracts",
      icon: FolderOpen,
      comingSoon: true,
    },
    {
      key: "materials-equipment",
      title: "Materials & Equipment",
      description: "Track materials, tools, and machinery",
      icon: HardHat,
      comingSoon: true,
    },
    {
      key: "members",
      title: "Members",
      description: "Invite teammates to this project",
      icon: Users,
      onPress: () => router.push(`/projects/${projectId}/members`),
      testID: "btn-open-members",
    },
  ];

  const isLoading = isLoadingProject || isLoadingReports;
  const siteName = project?.name?.trim() || "Project";

  return (
    <SafeAreaView className="flex-1 bg-background" edges={["top"]}>
      <View className="px-5 pt-4 pb-3">
        <ScreenHeader
          title={siteName}
          onBack={() => router.back()}
          backLabel="Projects"
        />
      </View>

      {isLoading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color="#1a1a2e" />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 8, paddingBottom: 24, gap: 16 }}
          showsVerticalScrollIndicator={false}
        >
          <View className="flex-row items-center justify-between gap-3">
            {(project?.client_name || project?.address) ? (
              <View className="min-w-0 flex-1 gap-1">
                {project.client_name ? (
                  <Text className="text-body font-medium text-foreground">
                    {project.client_name}
                  </Text>
                ) : null}
                {project.address ? (
                  <View className="flex-row items-center gap-2">
                    <MapPin size={14} color="#5c5c6e" />
                    <Text className="flex-1 text-body text-muted-foreground">
                      {project.address}
                    </Text>
                  </View>
                ) : null}
              </View>
            ) : null}
            <Button
              variant="outline"
              size="sm"
              onPress={() => router.push(`/projects/${projectId}/edit`)}
              className="shrink-0 flex-row items-center gap-1.5"
              accessibilityLabel="Edit project details"
              testID="btn-edit-project"
            >
              <Pencil size={14} color="#1a1a2e" />
              <Text className="text-sm font-semibold text-foreground">Edit</Text>
            </Button>
          </View>

          <View className="flex-row gap-3">
            <StatTile
              value={stats.totalReports}
              label="Total reports"
            />
            <StatTile
              value={stats.draftReports}
              label="Drafts"
              tone={stats.draftReports > 0 ? "warning" : "default"}
            />
          </View>

          <Card variant="muted" padding="md" className="gap-1">
            <Text className="text-label text-muted-foreground">Last report</Text>
            <Text className="text-title-sm text-foreground">{lastReportRelative}</Text>
          </Card>

          <View className="gap-3">
            {actions.map((action, index) => {
              const Icon = action.icon;
              const isDisabled = action.comingSoon || !action.onPress;
              return (
                <Animated.View
                  key={action.key}
                  entering={FadeInDown.duration(200).delay(index * 40)}
                >
                  <Pressable
                    onPress={action.onPress}
                    disabled={isDisabled}
                    testID={action.testID}
                    accessibilityRole="button"
                    accessibilityLabel={action.title}
                    accessibilityState={{ disabled: isDisabled }}
                  >
                    <Card
                      variant={action.comingSoon ? "muted" : "default"}
                      padding="md"
                      className="flex-row items-center gap-3"
                    >
                      <View className="h-10 w-10 items-center justify-center rounded-md border border-border bg-card">
                        <Icon size={20} color="#5c5c6e" />
                      </View>
                      <View className="min-w-0 flex-1 gap-1">
                        <View className="flex-row items-center gap-2">
                          <Text className="text-lg font-semibold text-foreground">
                            {action.title}
                          </Text>
                          {action.comingSoon ? (
                            <View className="rounded-md border border-border bg-card px-2 py-0.5">
                              <Text className="text-xs font-semibold uppercase text-muted-foreground">
                                Soon
                              </Text>
                            </View>
                          ) : null}
                        </View>
                        <Text className="text-sm text-muted-foreground">
                          {action.description}
                        </Text>
                      </View>
                      {!isDisabled ? (
                        <ChevronRight size={18} color="#5c5c6e" />
                      ) : null}
                    </Card>
                  </Pressable>
                </Animated.View>
              );
            })}
          </View>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}
