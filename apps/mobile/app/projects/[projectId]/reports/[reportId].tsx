import {
  View,
  Text,
  ScrollView,
  Pressable,
  ActivityIndicator,
} from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import {
  ArrowLeft,
  Calendar,
  Share2,
  FileDown,
} from "lucide-react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Animated, { FadeIn } from "react-native-reanimated";
import { useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { ReportView } from "@/components/reports/ReportView";
import { toTitleCase } from "@/lib/report-helpers";
import {
  normalizeGeneratedReportPayload,
  type GeneratedSiteReport,
} from "@/lib/generated-report";
import { backend } from "@/lib/backend";

type ReportRow = {
  report: GeneratedSiteReport;
  status: string;
};

export default function ReportDetailScreen() {
  const router = useRouter();
  const { projectId, reportId } = useLocalSearchParams<{
    projectId: string;
    reportId: string;
  }>();

  const { data, isLoading, error, refetch } = useQuery<ReportRow>({
    queryKey: ["report", projectId, reportId],
    queryFn: async () => {
      const { data: row, error: fetchError } = await backend
        .from("reports")
        .select("report_data, status, visit_date")
        .eq("id", reportId)
        .eq("project_id", projectId)
        .single();

      if (fetchError) throw fetchError;
      if (!row) throw new Error("Report not found.");

      const parsed = normalizeGeneratedReportPayload(row.report_data);
      if (!parsed) throw new Error("Report data could not be parsed.");

      return { report: parsed, status: row.status };
    },
  });

  const report = data?.report ?? null;
  const status = data?.status ?? "draft";

  if (isLoading) {
    return (
      <SafeAreaView className="flex-1 bg-background" edges={["top"]}>
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color="#1a1a2e" />
          <Text className="mt-3 text-base text-muted-foreground">
            Loading report...
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  if (error || !report) {
    return (
      <SafeAreaView className="flex-1 bg-background" edges={["top"]}>
        <View className="flex-1 items-center justify-center px-5">
          <Text className="text-xl font-semibold text-foreground">
            Failed to load report
          </Text>
          <Text className="mt-2 text-center text-base text-muted-foreground">
            {error instanceof Error ? error.message : "Report data is unavailable."}
          </Text>
          <Button
            variant="outline"
            size="default"
            className="mt-4"
            onPress={() => refetch()}
          >
            Retry
          </Button>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-background" edges={["top"]}>
      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingBottom: 32 }}
      >
        {/* Header */}
        <View className="px-5 pt-4 pb-4">
          <Pressable
            onPress={() => router.back()}
            className="mb-5 flex-row items-center gap-2 self-start border border-foreground px-4 py-2 active:opacity-75"
            accessibilityRole="button"
            accessibilityLabel="Go back to reports list"
          >
            <ArrowLeft size={16} color="#1a1a2e" />
            <Text className="text-sm font-semibold uppercase tracking-wider text-foreground">
              Reports
            </Text>
          </Pressable>

          <View className="flex-row items-start justify-between">
            <View className="flex-1">
              <Text className="text-3xl font-bold tracking-tight text-foreground">
                {report.report.meta.title}
              </Text>
              <Text className="mt-1 text-base text-muted-foreground">
                {toTitleCase(report.report.meta.reportType)}
              </Text>
            </View>
            <Badge variant={status === "draft" ? "draft" : "final"}>
              {toTitleCase(status)}
            </Badge>
          </View>

          <View className="mt-3 flex-row flex-wrap gap-3">
            {report.report.meta.visitDate && (
              <View className="flex-row items-center gap-1">
                <Calendar size={14} color="#5c5c6e" />
                <Text className="text-base text-muted-foreground">
                  {report.report.meta.visitDate}
                </Text>
              </View>
            )}

          </View>

          {/* Action buttons */}
          <View className="mt-4 flex-row gap-2">
            <Button
              variant="outline"
              size="sm"
              accessibilityLabel="Share report"
            >
              <View className="flex-row items-center gap-1.5">
                <Share2 size={14} color="#5c5c6e" />
                <Text className="text-base font-semibold text-foreground">
                  Share
                </Text>
              </View>
            </Button>
            <Button
              variant="outline"
              size="sm"
              accessibilityLabel="Export report as PDF"
            >
              <View className="flex-row items-center gap-1.5">
                <FileDown size={14} color="#5c5c6e" />
                <Text className="text-base font-semibold text-foreground">
                  Export PDF
                </Text>
              </View>
            </Button>
          </View>
        </View>

        {/* Report sections */}
        <Animated.View entering={FadeIn.duration(200)} className="px-5">
          <ReportView report={report} />
        </Animated.View>
      </ScrollView>
    </SafeAreaView>
  );
}
