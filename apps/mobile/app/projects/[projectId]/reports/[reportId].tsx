import { useState, useEffect } from "react";
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
  MapPin,
  Share2,
  FileDown,
} from "lucide-react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Animated, { FadeIn } from "react-native-reanimated";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { ReportView } from "@/components/reports/ReportView";
import { toTitleCase } from "@/lib/report-helpers";
import {
  normalizeGeneratedReportPayload,
  type GeneratedSiteReport,
} from "@/lib/generated-report";
import { MOCK_REPORT_DETAIL } from "@/constants/mock-data";

function buildMockGeneratedReport(): GeneratedSiteReport {
  return normalizeGeneratedReportPayload({
    report: {
      meta: {
        title: MOCK_REPORT_DETAIL.title,
        reportType: "daily_progress",
        summary:
          "Daily site visit covering weather, manpower, work progress, and issues.",
        visitDate: MOCK_REPORT_DETAIL.date,
      },
      weather: {
        conditions: "Clear skies",
        temperature: "84°F",
        wind: "5 mph NW",
        impact: null,
      },
      manpower: {
        totalWorkers: 12,
        workerHours: null,
        notes: null,
        roles: [
          { role: "Electricians", count: 4, notes: null },
          { role: "Iron Workers", count: 3, notes: null },
          { role: "Operators", count: 2, notes: null },
          { role: "Laborers", count: 2, notes: null },
          { role: "Foreman", count: 1, notes: null },
        ],
      },
      siteConditions: [],
      activities: [
        {
          name: "3rd Floor Concrete Pour",
          location: "Section B",
          status: "completed",
          summary:
            "3rd floor concrete pour completed (Section B). Rebar installation 60% complete on Section C. Formwork stripped on 2nd floor east wing.",
          sourceNoteIndexes: [],
          manpower: null,
          materials: [],
          equipment: [],
          issues: [],
          observations: [],
        },
      ],
      issues: [
        {
          title: "Crane #2 Hydraulic Wear",
          category: "equipment",
          severity: "medium",
          status: "open",
          details:
            "Crane #2 hydraulic line showing wear — maintenance scheduled for tomorrow AM.",
          actionRequired: "Schedule maintenance before next shift",
          sourceNoteIndexes: [],
        },
        {
          title: "Drywall Delivery Delay",
          category: "logistics",
          severity: "low",
          status: "open",
          details: "Minor delay on drywall delivery, ETA pushed to Thursday.",
          actionRequired: null,
          sourceNoteIndexes: [],
        },
      ],
      nextSteps: [
        "Complete crane #2 hydraulic maintenance",
        "Continue rebar installation on Section C",
        "Receive delayed drywall delivery Thursday",
      ],
      sections: [],
    },
  })!;
}

export default function ReportDetailScreen() {
  const router = useRouter();
  const { projectId, reportId } = useLocalSearchParams<{
    projectId: string;
    reportId: string;
  }>();

  const [report, setReport] = useState<GeneratedSiteReport | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // TODO: Replace with real API call using projectId + reportId
    const timer = setTimeout(() => {
      setReport(buildMockGeneratedReport());
      setIsLoading(false);
    }, 300);

    return () => clearTimeout(timer);
  }, [projectId, reportId]);

  if (isLoading) {
    return (
      <SafeAreaView className="flex-1 bg-background" edges={["top"]}>
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color="#1a1a2e" />
          <Text className="mt-3 text-sm text-muted-foreground">
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
          <Text className="text-lg font-semibold text-foreground">
            Failed to load report
          </Text>
          <Text className="mt-2 text-center text-sm text-muted-foreground">
            {error ?? "Report data is unavailable."}
          </Text>
          <Button
            variant="outline"
            size="default"
            className="mt-4"
            onPress={() => {
              setIsLoading(true);
              setError(null);
              const timer = setTimeout(() => {
                setReport(buildMockGeneratedReport());
                setIsLoading(false);
              }, 300);
              return () => clearTimeout(timer);
            }}
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
            <Text className="text-xs font-semibold uppercase tracking-wider text-foreground">
              Reports
            </Text>
          </Pressable>

          <View className="flex-row items-start justify-between">
            <View className="flex-1">
              <Text className="text-2xl font-bold tracking-tight text-foreground">
                {report.report.meta.title}
              </Text>
              <Text className="mt-1 text-sm text-muted-foreground">
                {toTitleCase(report.report.meta.reportType)}
              </Text>
            </View>
            <Badge variant="final">Final</Badge>
          </View>

          <View className="mt-3 flex-row flex-wrap gap-3">
            {report.report.meta.visitDate && (
              <View className="flex-row items-center gap-1">
                <Calendar size={14} color="#5c5c6e" />
                <Text className="text-sm text-muted-foreground">
                  {report.report.meta.visitDate}
                </Text>
              </View>
            )}
            <View className="flex-row items-center gap-1">
              <MapPin size={14} color="#5c5c6e" />
              <Text className="text-sm text-muted-foreground">
                {MOCK_REPORT_DETAIL.project}
              </Text>
            </View>
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
                <Text className="text-sm font-semibold text-foreground">
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
                <Text className="text-sm font-semibold text-foreground">
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
