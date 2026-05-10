/**
 * Report detail screen — tabs for View, Edit, Notes, Source.
 */
import { useState, useEffect, useRef } from "react";
import { View, Text, Pressable, ScrollView, Alert, Linking } from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { normalizeGeneratedReportPayload, type GeneratedSiteReport } from "@harpa/report-core";
import { Screen } from "@/shared/components/Screen";
import { Button } from "@/shared/components/Button";
import { Sheet } from "@/shared/components/Sheet";
import { testIds } from "@/infra/test-ids";
import { generateReportPdf, shareReportPdf } from "@/lib/export-report-pdf";
import {
  useReport,
  useUpdateReport,
  useSoftDeleteReport,
  useFinalizeReport,
  useGenerateReport,
  useReportNotes,
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
  const { data: notes = [] } = useReportNotes(reportId);
  const updateReport = useUpdateReport();
  const deleteReport = useSoftDeleteReport();
  const finalizeReport = useFinalizeReport();
  const generateReport = useGenerateReport();

  const [activeTab, setActiveTab] = useState<Tab>("view");
  const [localReport, setLocalReport] = useState<GeneratedSiteReport | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [actionsSheet, setActionsSheet] = useState(false);
  const [pdfSavedSheet, setPdfSavedSheet] = useState(false);
  const [savedPdfUri, setSavedPdfUri] = useState<string | null>(null);
  const lastServerJsonRef = useRef<string | null>(null);

  // Parse report_data from DB row
  const parsedReport = rawReport?.report_data
    ? normalizeGeneratedReportPayload(rawReport.report_data)
    : null;

  const isDraft = rawReport?.status === "draft";
  const isFinal = rawReport?.status === "final";

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

  const handleGenerate = async () => {
    if (!projectId || !reportId) return;
    try {
      const noteTexts = notes
        .filter((n) => n.kind === "text" && n.body)
        .map((n) => n.body as string);
      
      const generated = await generateReport.mutateAsync({
        reportId,
        projectId,
        notes: noteTexts,
      });

      // Merge generated report into local state and save
      setLocalReport(generated);
      await updateReport.mutateAsync({
        reportId,
        projectId,
        report: generated,
      });

      // Switch to view tab to show result
      setActiveTab("view");
    } catch (err) {
      Alert.alert("Error", err instanceof Error ? err.message : "Failed to generate report");
    }
  };

  const handleFinalize = async () => {
    if (!projectId || !reportId) return;
    try {
      await finalizeReport.mutateAsync({ reportId, projectId });
    } catch (err) {
      Alert.alert("Error", err instanceof Error ? err.message : "Failed to finalize report");
    }
  };

  const handleViewPdf = async () => {
    if (!localReport) return;
    setActionsSheet(false);
    try {
      const { uri } = await generateReportPdf(localReport);
      await Linking.openURL(uri);
    } catch (err) {
      Alert.alert("Error", err instanceof Error ? err.message : "Failed to open PDF");
    }
  };

  const handleSavePdf = async () => {
    if (!localReport) return;
    setActionsSheet(false);
    try {
      const { uri } = await generateReportPdf(localReport);
      setSavedPdfUri(uri);
      setPdfSavedSheet(true);
    } catch (err) {
      Alert.alert("Error", err instanceof Error ? err.message : "Failed to save PDF");
    }
  };

  const handleSharePdf = async () => {
    if (!localReport) return;
    setActionsSheet(false);
    try {
      const { uri, filename } = await generateReportPdf(localReport);
      await shareReportPdf(uri, filename);
    } catch (err) {
      Alert.alert("Error", err instanceof Error ? err.message : "Failed to share PDF");
    }
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
            {activeTab === "view" && !isFinal && (
              <Button
                variant="secondary"
                onPress={() => setActionsSheet(true)}
                testID={
                  isDraft
                    ? testIds.reports.draftMenuButton
                    : testIds.reports.actionsButton
                }
              >
                <Text className="font-medium">⋯</Text>
              </Button>
            )}
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
            testID={testIds.reports.tab[tab as keyof typeof testIds.reports.tab]}
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
        {activeTab === "view" && (
          <View className="flex-1">
            <ScrollView className="flex-1">
              <ReportView report={localReport} />
              {isDraft && (
                <View className="p-4 gap-3">
                  <Button
                    variant="primary"
                    onPress={handleGenerate}
                    loading={generateReport.isPending}
                    testID={testIds.reports.generateButton}
                  >
                    <Text className="text-white font-medium">
                      {localReport.report.meta.title ? "Update Report" : "Generate Report"}
                    </Text>
                  </Button>
                  <Button
                    variant="ghost"
                    onPress={() => setActiveTab("edit")}
                    testID={testIds.reports.editManuallyButton}
                  >
                    <Text className="text-gray-700">Edit Manually</Text>
                  </Button>
                </View>
              )}
              {isDraft && localReport.report.meta.title && (
                <View className="p-4">
                  <Button
                    variant="primary"
                    onPress={handleFinalize}
                    loading={finalizeReport.isPending}
                    testID={testIds.reports.finalizeButton}
                  >
                    <Text className="text-white font-medium">Finalize Report</Text>
                  </Button>
                </View>
              )}
            </ScrollView>
          </View>
        )}
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

      {/* Actions sheet */}
      <Sheet visible={actionsSheet} onClose={() => setActionsSheet(false)}>
        <Sheet.Title>Report Actions</Sheet.Title>
        <Sheet.Body>
          <View className="gap-2">
            <Button
              variant="ghost"
              onPress={handleViewPdf}
              testID={testIds.reports.viewPdfButton}
            >
              <Text className="text-gray-700">View PDF</Text>
            </Button>
            <Button
              variant="ghost"
              onPress={handleSavePdf}
              testID={testIds.reports.savePdfButton}
            >
              <Text className="text-gray-700">Save PDF</Text>
            </Button>
            <Button
              variant="ghost"
              onPress={handleSharePdf}
              testID={testIds.reports.sharePdfButton}
            >
              <Text className="text-gray-700">Share PDF</Text>
            </Button>
            <Button
              variant="destructive"
              onPress={() => {
                setActionsSheet(false);
                setDeleteConfirm(true);
              }}
              testID={
                isDraft
                  ? testIds.reports.deleteButton
                  : testIds.reports.reportDeleteButton
              }
            >
              <Text className="text-white">{isDraft ? "Delete Draft" : "Delete Report"}</Text>
            </Button>
          </View>
        </Sheet.Body>
      </Sheet>

      {/* PDF Saved confirmation */}
      <Sheet visible={pdfSavedSheet} onClose={() => setPdfSavedSheet(false)}>
        <Sheet.Title>PDF Saved</Sheet.Title>
        <Sheet.Body>
          <Text className="text-gray-700 mb-4">
            The report has been exported as a PDF.
          </Text>
        </Sheet.Body>
        <Sheet.Actions>
          {savedPdfUri && (
            <Button
              variant="ghost"
              onPress={async () => {
                try {
                  await Linking.openURL(savedPdfUri);
                } catch {}
              }}
              testID={testIds.reports.openExternallyButton}
            >
              <Text className="text-gray-700">Open PDF</Text>
            </Button>
          )}
          <Button
            variant="primary"
            onPress={() => setPdfSavedSheet(false)}
            testID={testIds.reports.savedPdfDoneButton}
          >
            <Text className="text-white">Done</Text>
          </Button>
        </Sheet.Actions>
      </Sheet>

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
            testID={testIds.shared.dialogAction(0)}
          >
            <Text className="text-white">Delete</Text>
          </Button>
        </Sheet.Actions>
      </Sheet>
    </Screen>
  );
}
