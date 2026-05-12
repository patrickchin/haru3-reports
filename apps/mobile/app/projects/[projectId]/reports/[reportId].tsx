import {
  View,
  Text,
  ScrollView,
  RefreshControl,
} from "react-native";
import { useEffect, useRef, useState } from "react";
import { useRouter, useLocalSearchParams } from "expo-router";
import Animated, { FadeIn } from "react-native-reanimated";
import { ReportDetailSkeleton } from "@/components/skeletons/ReportDetailSkeleton";
import { SafeAreaView } from "@/components/ui/SafeAreaView";
import { AppDialogSheet } from "@/components/ui/AppDialogSheet";
import { Button } from "@/components/ui/Button";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { ReportView } from "@/components/reports/ReportView";
import { ReportPhotos } from "@/components/reports/ReportPhotos";
import { ReportEditForm } from "@/components/reports/ReportEditForm";
import { PdfPreviewModal } from "@/components/reports/PdfPreviewModal";
import { ImagePreviewModal } from "@/components/files/ImagePreviewModal";
import { ReportDetailHeader } from "@/components/reports/detail/ReportDetailHeader";
import {
  ReportDetailTabBar,
  type ReportDetailTab,
} from "@/components/reports/detail/ReportDetailTabBar";
import { ReportNotesPane } from "@/components/reports/detail/ReportNotesPane";
import { ReportActionsMenu } from "@/components/reports/detail/ReportActionsMenu";
import { SavedReportSheet } from "@/components/reports/detail/SavedReportSheet";
import {
  normalizeGeneratedReportPayload,
  type GeneratedSiteReport,
} from "@/lib/generated-report";
import { useLocalProject } from "@/hooks/useLocalProjects";
import { useLocalReportNotes } from "@/hooks/useLocalReportNotes";
import { useLocalReport } from "@/hooks/useLocalReports";
import { useReportAutoSave } from "@/hooks/useReportAutoSave";
import { useRefresh } from "@/hooks/useRefresh";
import { useImagePreviewProps } from "@/hooks/useImagePreviewProps";
import { useReportPdfActions } from "@/hooks/useReportPdfActions";
import { useReportDelete } from "@/hooks/useReportDelete";
import { useReportUnfinalize } from "@/hooks/useReportUnfinalize";
import { type FileMetadataRow } from "@/lib/file-upload";

export default function ReportDetailScreen() {
  const router = useRouter();
  const [menuVisible, setMenuVisible] = useState(false);
  const [pdfPreviewVisible, setPdfPreviewVisible] = useState(false);
  const [imagePreview, setImagePreview] = useState<{
    file: FileMetadataRow;
  } | null>(null);
  const imagePreviewExtras = useImagePreviewProps(imagePreview?.file ?? null);

  const params = useLocalSearchParams<{
    projectId?: string | string[];
    reportId?: string | string[];
  }>();
  const projectId = typeof params.projectId === "string" ? params.projectId : "";
  const reportId = typeof params.reportId === "string" ? params.reportId : "";
  const hasValidRouteParams = projectId.length > 0 && reportId.length > 0;

  const { data: project } = useLocalProject(hasValidRouteParams ? projectId : null);
  const { data: rawReport, isLoading, error, refetch } = useLocalReport(
    hasValidRouteParams ? reportId : null,
  );
  const { data: noteRows } = useLocalReportNotes(hasValidRouteParams ? reportId : null);

  const { refreshing, onRefresh } = useRefresh([refetch]);

  const reportData = (() => {
    if (!rawReport) return undefined;
    const parsed = normalizeGeneratedReportPayload(rawReport.report_data);
    if (!parsed) return undefined;
    return { report: parsed };
  })();

  const report = reportData?.report;
  const [localReport, setLocalReport] = useState<GeneratedSiteReport | null>(null);
  const [activeTab, setActiveTab] = useState<ReportDetailTab>("report");
  const isFinal = rawReport?.status === "final";

  // Finalized reports are read-only. If the report becomes final while the
  // user is on the Edit tab (e.g. finalize-while-editing), drop them back to
  // the Report tab so they don't see a stale editor.
  useEffect(() => {
    if (isFinal && activeTab === "edit") {
      setActiveTab("report");
    }
  }, [isFinal, activeTab]);

  // Sync localReport from the parsed saved report. Refetches (incl.
  // pull-to-refresh) adopt the new server snapshot ONLY when the user has
  // no unsaved local edits — i.e. localReport still matches the previously
  // observed server snapshot. Edits in flight are preserved; autosave is
  // the writer that eventually reconciles them.
  const lastServerJsonRef = useRef<string | null>(null);
  useEffect(() => {
    if (!report) return;
    const nextJson = JSON.stringify(report);
    if (!localReport) {
      setLocalReport(report);
      lastServerJsonRef.current = nextJson;
      return;
    }
    if (
      lastServerJsonRef.current !== null &&
      JSON.stringify(localReport) === lastServerJsonRef.current
    ) {
      setLocalReport(report);
    }
    lastServerJsonRef.current = nextJson;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [report]);

  const { isSaving: isAutoSaving, lastSavedAt } = useReportAutoSave({
    reportId: hasValidRouteParams ? reportId : null,
    projectId,
    report: localReport,
  });

  const displayReport = localReport ?? report ?? null;
  // Count of source-note rows (text + voice + linked files) used as the
  // badge on the Notes tab so the user can see at a glance how many
  // inputs the report was built from.
  const notesCount = (noteRows ?? []).length;

  const {
    isDeleting,
    reportDialogSheet,
    setReportDialogSheet,
    deleteReport,
    confirmDelete,
    closeReportDialogSheet,
    canDismissReportDialogSheet,
  } = useReportDelete({ projectId, reportId });

  const {
    isUnfinalizing,
    unfinalizeDialogSheet,
    unfinalizeReport,
    confirmUnfinalize,
    closeUnfinalizeDialogSheet,
    canDismissUnfinalizeDialogSheet,
  } = useReportUnfinalize({ projectId, reportId });

  const {
    isExporting,
    isOpeningSavedPdf,
    isSharingSavedPdf,
    isSaving,
    savedReportSheet,
    savedReportSheetError,
    savedReportDetails,
    closeSavedReportSheet,
    handleSavePdf,
    handleOpenSavedPdf,
    handleShareSavedPdf,
    handleSharePdf,
  } = useReportPdfActions({
    displayReport,
    siteName: project?.name ?? null,
    onExportError: setReportDialogSheet,
  });

  if (isLoading) {
    return (
      <SafeAreaView className="flex-1 bg-background" edges={["top"]}>
        <View className="px-5 pt-4 pb-2">
          <ScreenHeader
            title="Report"
            onBack={() => router.back()}
            backLabel="Reports"
          />
        </View>
        <ReportDetailSkeleton />
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
            variant="secondary"
            size="default"
            className="mt-4"
            onPress={() => router.replace("/(tabs)/projects")}
          >
            Back to Projects
          </Button>
        </View>
      </SafeAreaView>
    );
  }

  if (error || !displayReport) {
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
            variant="secondary"
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
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        <ReportDetailHeader
          report={displayReport}
          onBack={() => router.back()}
          onOpenActions={() => setMenuVisible(true)}
          actionsDisabled={isSaving || isExporting || isDeleting || isUnfinalizing}
        />

        <ReportDetailTabBar
          activeTab={activeTab}
          onChange={setActiveTab}
          notesCount={notesCount}
          showEditTab={!isFinal}
        />

        {activeTab === "edit" ? (
          <View className="flex-row items-center justify-between px-5 pt-1 pb-1">
            <Text className="text-sm font-medium text-muted-foreground">
              Edit report
            </Text>
            <Text className="text-xs text-muted-foreground" testID="edit-autosave-status">
              {isAutoSaving ? "Saving…" : lastSavedAt ? "Saved" : ""}
            </Text>
          </View>
        ) : null}

        {activeTab === "report" ? (
          <Animated.View entering={FadeIn.duration(250)} className="px-5">
            <ReportView report={displayReport} />
            <View className="mt-3">
              <ReportPhotos
                projectId={projectId}
                noteRows={noteRows}
                onOpenFile={(file) => {
                  if (file.mime_type.startsWith("image/")) {
                    setImagePreview({ file });
                  }
                }}
              />
            </View>
          </Animated.View>
        ) : activeTab === "edit" ? (
          <View className="px-5">
            <ReportEditForm report={displayReport} onChange={setLocalReport} />
          </View>
        ) : (
          <Animated.View entering={FadeIn.duration(250)}>
            <ReportNotesPane
              projectId={projectId}
              reportId={reportId}
              reportCreatedAt={rawReport?.created_at ?? null}
              noteRows={noteRows}
              onOpenFile={(file) => {
                if (file.mime_type.startsWith("image/")) {
                  setImagePreview({ file });
                }
              }}
            />
          </Animated.View>
        )}
      </ScrollView>

      <ReportActionsMenu
        visible={menuVisible}
        onClose={() => setMenuVisible(false)}
        onViewPdf={() => {
          setMenuVisible(false);
          setPdfPreviewVisible(true);
        }}
        onSavePdf={async () => {
          setMenuVisible(false);
          await handleSavePdf();
        }}
        onSharePdf={async () => {
          setMenuVisible(false);
          await handleSharePdf();
        }}
        onUnfinalize={() => {
          setMenuVisible(false);
          confirmUnfinalize();
        }}
        onDelete={() => {
          setMenuVisible(false);
          confirmDelete();
        }}
        isSaving={isSaving}
        isExporting={isExporting}
        isUnfinalizing={isUnfinalizing}
        isDeleting={isDeleting}
      />

      <AppDialogSheet
        visible={reportDialogSheet !== null}
        title={reportDialogSheet?.title ?? "Report Action"}
        message={reportDialogSheet?.message ?? ""}
        noticeTone={reportDialogSheet?.tone ?? "danger"}
        noticeTitle={reportDialogSheet?.noticeTitle}
        onClose={closeReportDialogSheet}
        canDismiss={canDismissReportDialogSheet}
        actions={
          reportDialogSheet?.kind === "confirm-delete"
            ? [
                {
                  label: isDeleting ? "Deleting..." : reportDialogSheet.confirmLabel,
                  variant: reportDialogSheet.confirmVariant,
                  onPress: () => deleteReport(),
                  disabled: isDeleting,
                  accessibilityLabel: "Confirm delete report",
                  align: "start",
                },
                {
                  label: reportDialogSheet.cancelLabel ?? "Cancel",
                  variant: "quiet",
                  onPress: closeReportDialogSheet,
                  disabled: isDeleting,
                  accessibilityLabel: "Cancel delete report",
                },
              ]
            : reportDialogSheet
              ? [
                  {
                    label: reportDialogSheet.confirmLabel,
                    variant: reportDialogSheet.confirmVariant,
                    onPress: closeReportDialogSheet,
                    accessibilityLabel: "Dismiss report action dialog",
                  },
                ]
              : []
        }
      />

      <AppDialogSheet
        visible={unfinalizeDialogSheet !== null}
        title={unfinalizeDialogSheet?.title ?? "Unfinalize Report"}
        message={unfinalizeDialogSheet?.message ?? ""}
        noticeTone={unfinalizeDialogSheet?.tone ?? "warning"}
        noticeTitle={unfinalizeDialogSheet?.noticeTitle}
        onClose={closeUnfinalizeDialogSheet}
        canDismiss={canDismissUnfinalizeDialogSheet}
        actions={
          unfinalizeDialogSheet?.kind === "confirm-unfinalize"
            ? [
                {
                  label: isUnfinalizing
                    ? "Unfinalizing..."
                    : unfinalizeDialogSheet.confirmLabel,
                  variant: unfinalizeDialogSheet.confirmVariant,
                  onPress: () => unfinalizeReport(),
                  disabled: isUnfinalizing,
                  accessibilityLabel: "Confirm unfinalize report",
                  align: "start",
                },
                {
                  label: unfinalizeDialogSheet.cancelLabel ?? "Cancel",
                  variant: "quiet",
                  onPress: closeUnfinalizeDialogSheet,
                  disabled: isUnfinalizing,
                  accessibilityLabel: "Cancel unfinalize report",
                },
              ]
            : unfinalizeDialogSheet
              ? [
                  {
                    label: unfinalizeDialogSheet.confirmLabel,
                    variant: unfinalizeDialogSheet.confirmVariant,
                    onPress: closeUnfinalizeDialogSheet,
                    accessibilityLabel: "Dismiss unfinalize dialog",
                  },
                ]
              : []
        }
      />

      <PdfPreviewModal
        visible={pdfPreviewVisible}
        report={displayReport}
        siteName={project?.name ?? null}
        onClose={() => setPdfPreviewVisible(false)}
      />

      <ImagePreviewModal
        visible={imagePreview !== null}
        title={imagePreview?.file.filename}
        onClose={() => setImagePreview(null)}
        {...imagePreviewExtras}
      />

      <SavedReportSheet
        state={savedReportSheet}
        details={savedReportDetails}
        errorMessage={savedReportSheetError}
        isOpening={isOpeningSavedPdf}
        isSharing={isSharingSavedPdf}
        onClose={closeSavedReportSheet}
        onOpen={handleOpenSavedPdf}
        onShare={handleShareSavedPdf}
        onRetrySave={() => {
          closeSavedReportSheet();
          void handleSavePdf();
        }}
      />
    </SafeAreaView>
  );
}
