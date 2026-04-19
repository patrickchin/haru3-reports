import {
  View,
  Text,
  ScrollView,
  Pressable,
  ActivityIndicator,
  Alert,
} from "react-native";
import { useState } from "react";
import { useRouter, useLocalSearchParams } from "expo-router";
import {
  ArrowLeft,
  Calendar,
  Trash2,
  FileDown,
  Share2,
} from "lucide-react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Animated, { FadeIn } from "react-native-reanimated";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/Button";
import { ReportView } from "@/components/reports/ReportView";
import { toTitleCase } from "@/lib/report-helpers";
import {
  normalizeGeneratedReportPayload,
  type GeneratedSiteReport,
} from "@/lib/generated-report";
import { backend } from "@/lib/backend";
import { exportReportPdf, saveReportPdf } from "@/lib/export-report-pdf";

export default function ReportDetailScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [isExporting, setIsExporting] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const params = useLocalSearchParams<{
    projectId?: string | string[];
    reportId?: string | string[];
  }>();
  const projectId = typeof params.projectId === "string" ? params.projectId : "";
  const reportId = typeof params.reportId === "string" ? params.reportId : "";
  const hasValidRouteParams = projectId.length > 0 && reportId.length > 0;

  const { data: report, isLoading, error, refetch } = useQuery<GeneratedSiteReport>({
    queryKey: ["report", projectId, reportId],
    enabled: hasValidRouteParams,
    queryFn: async () => {
      const { data: row, error: fetchError } = await backend
        .from("reports")
        .select("report_data, visit_date")
        .eq("id", reportId)
        .eq("project_id", projectId)
        .single();

      if (fetchError) throw fetchError;
      if (!row) throw new Error("Report not found.");

      const parsed = normalizeGeneratedReportPayload(row.report_data);
      if (!parsed) throw new Error("Report data could not be parsed.");

      return parsed;
    },
  });

  const { mutate: deleteReport, isPending: isDeleting } = useMutation({
    mutationFn: async () => {
      const { error } = await backend
        .from("reports")
        .delete()
        .eq("id", reportId)
        .eq("project_id", projectId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.removeQueries({ queryKey: ["report", projectId, reportId] });
      queryClient.invalidateQueries({ queryKey: ["reports", projectId] });
      router.replace(`/projects/${projectId}/reports`);
    },
    onError: (err) => {
      Alert.alert(
        "Delete Failed",
        err instanceof Error ? err.message : "Could not delete the report.",
      );
    },
  });

  const confirmDelete = () => {
    Alert.alert(
      "Delete Report",
      "This report will be permanently deleted. This cannot be undone.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => deleteReport(),
        },
      ]
    );
  };

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

  if (!hasValidRouteParams) {
    return (
      <SafeAreaView className="flex-1 bg-background" edges={["top"]}>
        <View className="flex-1 items-center justify-center px-5">
          <Text className="text-xl font-semibold text-foreground">
            Invalid report link
          </Text>
          <Text className="mt-2 text-center text-base text-muted-foreground">
            This report URL is missing the project or report id.
          </Text>
          <Button
            variant="outline"
            size="default"
            className="mt-4"
            onPress={() => router.replace("/(tabs)/projects")}
          >
            Back to projects
          </Button>
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
        <View className="px-5 py-4">
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
          <View className="mt-4 flex-row gap-3">
            <Button
              variant="outline"
              size="sm"
              accessibilityLabel="Save report as PDF"
              onPress={async () => {
                if (!report) return;
                setIsSaving(true);
                try {
                  await saveReportPdf(report);
                  Alert.alert("PDF Saved", "The report has been saved to your device. You can find it in the app's documents folder.");
                } catch (e) {
                  Alert.alert("Save failed", e instanceof Error ? e.message : "Could not generate PDF.");
                } finally {
                  setIsSaving(false);
                }
              }}
              disabled={isSaving || isExporting}
            >
              <View className="flex-row items-center gap-1.5">
                <FileDown size={14} color="#1a1a2e" />
                <Text className="text-base font-semibold text-foreground">
                  {isSaving ? "Saving..." : "Save PDF"}
                </Text>
              </View>
            </Button>
            <Button
              variant="outline"
              size="sm"
              accessibilityLabel="Share report as PDF"
              onPress={async () => {
                if (!report) return;
                setIsExporting(true);
                try {
                  await exportReportPdf(report);
                } catch (e) {
                  Alert.alert("Export failed", e instanceof Error ? e.message : "Could not generate PDF.");
                } finally {
                  setIsExporting(false);
                }
              }}
              disabled={isExporting || isSaving}
            >
              <View className="flex-row items-center gap-1.5">
                <Share2 size={14} color="#1a1a2e" />
                <Text className="text-base font-semibold text-foreground">
                  {isExporting ? "Sharing..." : "Share PDF"}
                </Text>
              </View>
            </Button>
            <Button
              variant="outline"
              size="sm"
              accessibilityLabel="Delete report"
              onPress={confirmDelete}
              disabled={isDeleting}
            >
              <View className="flex-row items-center gap-1.5">
                <Trash2 size={14} color="#e5383b" />
                <Text className="text-base font-semibold text-destructive">
                  {isDeleting ? "Deleting..." : "Delete"}
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
