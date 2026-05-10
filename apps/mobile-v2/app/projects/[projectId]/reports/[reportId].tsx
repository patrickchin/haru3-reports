/**
 * Report detail screen — tabs for View, Edit, Notes, Source.
 */
import { useState, useEffect, useRef } from "react";
import { View, Text, Pressable, ScrollView } from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { normalizeGeneratedReportPayload, type GeneratedSiteReport } from "@harpa/report-core";
import { Screen } from "@/shared/components/Screen";
import { Button } from "@/shared/components/Button";
import { Sheet } from "@/shared/components/Sheet";
import { testIds } from "@/infra/test-ids";
import {
  useReport,
  useUpdateReport,
  useSoftDeleteReport,
  createEmptyReport,
  ReportEditForm,
  ReportView,
  NoteTimeline,
} from "@/features/reports";

type Tab = "view" | "edit" | "notes" | "source";

export default function ReportDetailScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ projectId?: string; reportId?: string }>();
  const projectId = typeof params.projectId === "string" ? params.projectId : null;
  const reportId = typeof params.reportId === "string" ? params.reportId : null;

  const { data: rawReport, isLoading } = useReport(reportId);
  const updateReport = useUpdateReport();
  const deleteReport = useSoftDeleteReport();

  const [activeTab, setActiveTab] = useState<Tab>("view");
  const [localReport, setLocalReport] = useState<GeneratedSiteReport | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const lastServerJsonRef = useRef<string | null>(null);

  // Parse report_data from DB row
  const parsedReport = rawReport?.report_data
    ? normalizeGeneratedReportPayload(rawReport.report_data)
    : null;

  // Sync localReport from server (preserve local edits)
  useEffect(() => {
    if (!parsedReport) return;
    const nextJson = JSON.stringify(parsedReport);
    if (!localReport) {
      setLocalReport(parsedReport);
      lastServerJsonRef.current = nextJson;
      return;
    }
    if (
      lastServerJsonRef.current !== null &&
      JSON.stringify(localReport) === lastServerJsonRef.current
    ) {
      setLocalReport(parsedReport);
    }
    lastServerJsonRef.current = nextJson;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [parsedReport]);

  // Initialize with empty report if parsing failed
  useEffect(() => {
    if (rawReport && !parsedReport && !localReport) {
      setLocalReport(createEmptyReport());
    }
  }, [rawReport, parsedReport, localReport]);

  const handleSave = async () => {
    if (!projectId || !reportId || !localReport) return;
    await updateReport.mutateAsync({
      reportId,
      projectId,
      report: localReport,
    });
  };

  const handleDelete = async () => {
    if (!projectId || !reportId) return;
    await deleteReport.mutateAsync({ reportId, projectId });
    router.back();
  };

  if (isLoading || !rawReport || !localReport) {
    return (
      <Screen>
        <View className="flex-1 items-center justify-center">
          <Text className="text-gray-500">Loading report...</Text>
        </View>
      </Screen>
    );
  }

  return (
    <Screen>
      {/* Header */}
      <View className="px-4 py-3 border-b border-gray-200">
        <View className="flex-row justify-between items-center">
          <Text className="text-xl font-bold" numberOfLines={1}>
            {localReport.report.meta.title || "Untitled Report"}
          </Text>
          <View className="flex-row gap-2">
            {activeTab === "edit" && (
              <Button
                variant="primary"
                onPress={handleSave}
                loading={updateReport.isPending}
                testID={testIds.reports.saveButton}
              >
                <Text className="text-white font-medium">Save</Text>
              </Button>
            )}
            <Button
              variant="destructive"
              onPress={() => setDeleteConfirm(true)}
              testID={testIds.reports.deleteButton}
            >
              <Text className="text-white">Delete</Text>
            </Button>
          </View>
        </View>
      </View>

      {/* Tabs */}
      <View className="flex-row border-b border-gray-200 bg-white">
        {(["view", "edit", "notes", "source"] as Tab[]).map((tab) => (
          <Pressable
            key={tab}
            onPress={() => setActiveTab(tab)}
            className={`flex-1 py-3 items-center ${
              activeTab === tab ? "border-b-2 border-blue-600" : ""
            }`}
            testID={`btn-tab-${tab}`}
          >
            <Text
              className={`font-medium capitalize ${
                activeTab === tab ? "text-blue-600" : "text-gray-600"
              }`}
            >
              {tab}
            </Text>
          </Pressable>
        ))}
      </View>

      {/* Tab content */}
      <View className="flex-1">
        {activeTab === "view" && <ReportView report={localReport} />}
        {activeTab === "edit" && (
          <ReportEditForm report={localReport} onChange={setLocalReport} />
        )}
        {activeTab === "notes" && projectId && reportId && (
          <NoteTimeline reportId={reportId} projectId={projectId} />
        )}
        {activeTab === "source" && (
          <ScrollView className="flex-1 p-4">
            <Text className="text-xs font-mono text-gray-700">
              {JSON.stringify(localReport, null, 2)}
            </Text>
          </ScrollView>
        )}
      </View>

      {/* Delete confirmation */}
      <Sheet visible={deleteConfirm} onClose={() => setDeleteConfirm(false)}>
        <Sheet.Title>Delete Report</Sheet.Title>
        <Sheet.Body>
          <Text className="text-gray-700">
            Are you sure you want to delete this report? This action cannot be undone.
          </Text>
        </Sheet.Body>
        <Sheet.Actions>
          <Button variant="ghost" onPress={() => setDeleteConfirm(false)}>
            <Text className="text-gray-700">Cancel</Text>
          </Button>
          <Button
            variant="destructive"
            onPress={handleDelete}
            loading={deleteReport.isPending}
          >
            <Text className="text-white">Delete</Text>
          </Button>
        </Sheet.Actions>
      </Sheet>
    </Screen>
  );
}
