import {
  View,
  Text,
  ScrollView,
  Pressable,
  RefreshControl,
} from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { ProjectOverviewSkeleton } from "@/components/skeletons/ProjectOverviewSkeleton";
import { colors } from "@/lib/design-tokens/colors";
import {
  Check,
  ChevronRight,
  ClipboardList,
  Copy,
  FileText,
  FolderOpen,
  HardHat,
  MapPin,
  Pencil,
  Users,
  type LucideIcon,
} from "lucide-react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { StatTile } from "@/components/ui/StatTile";
import { useCopyToClipboard } from "@/hooks/useCopyToClipboard";
import { useLocalProject } from "@/hooks/useLocalProjects";
import { useLocalReports } from "@/hooks/useLocalReports";
import { useRefresh } from "@/hooks/useRefresh";
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
  const { copy, isCopied } = useCopyToClipboard();

  const { data: project, isLoading: isLoadingProject, refetch: refetchProject } = useLocalProject(projectId);

  const { data: reports = [], isLoading: isLoadingReports, refetch: refetchReports } =
    useLocalReports(projectId) as {
      data: ProjectReportListItem[];
      isLoading: boolean;
      refetch: () => Promise<unknown>;
    };

  const { refreshing, onRefresh } = useRefresh([refetchProject, refetchReports]);

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
        <ProjectOverviewSkeleton />
      ) : (
        <ScrollView
          contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 8, paddingBottom: 24, gap: 16 }}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          }
        >
          <View className="flex-row items-center justify-between gap-3">
            {(project?.client_name || project?.address) ? (
              <View className="min-w-0 flex-1 gap-1">
                {project.client_name ? (
                  <Pressable
                    onPress={() =>
                      copy(project.client_name, {
                        key: "client",
                        toast: "Client copied",
                      })
                    }
                    accessibilityRole="button"
                    accessibilityLabel={`Copy client: ${project.client_name}`}
                    testID="btn-copy-client"
                    className="flex-row items-center gap-2 active:opacity-60"
                    hitSlop={8}
                  >
                    <Text className="flex-1 text-body font-medium text-foreground">
                      {project.client_name}
                    </Text>
                    {isCopied("client") ? (
                      <Check size={14} color={colors.muted.foreground} />
                    ) : (
                      <Copy size={14} color={colors.muted.foreground} />
                    )}
                  </Pressable>
                ) : null}
                {project.address ? (
                  <Pressable
                    onPress={() =>
                      copy(project.address, {
                        key: "address",
                        toast: "Address copied",
                      })
                    }
                    accessibilityRole="button"
                    accessibilityLabel={`Copy address: ${project.address}`}
                    testID="btn-copy-address"
                    className="flex-row items-center gap-2 active:opacity-60"
                    hitSlop={8}
                  >
                    <MapPin size={14} color={colors.muted.foreground} />
                    <Text className="flex-1 text-body text-muted-foreground">
                      {project.address}
                    </Text>
                    {isCopied("address") ? (
                      <Check size={14} color={colors.muted.foreground} />
                    ) : (
                      <Copy size={14} color={colors.muted.foreground} />
                    )}
                  </Pressable>
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
              <Pencil size={14} color={colors.foreground} />
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
                <View
                  key={action.key}
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
                        <Icon size={20} color={colors.muted.foreground} />
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
                        <ChevronRight size={18} color={colors.muted.foreground} />
                      ) : null}
                    </Card>
                  </Pressable>
                </View>
              );
            })}
          </View>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}
