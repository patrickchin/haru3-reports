import {
  View,
  Text,
  ScrollView,
  ActivityIndicator,
  Modal,
  Pressable,
  RefreshControl,
} from "react-native";
import { useEffect, useState } from "react";
import { useRouter, useLocalSearchParams } from "expo-router";
import { ReportDetailSkeleton } from "@/components/skeletons/ReportDetailSkeleton";
import { colors } from "@/lib/design-tokens/colors";
import {
  Calendar,
  ChevronDown,
  ChevronRight,
  Eye,
  FileText,
  FileDown,
  FolderOpen,
  MessageSquare,
  MoreHorizontal,
  Pencil,
  Share2,
  Trash2,
  X,
} from "lucide-react-native";
import { SafeAreaView } from "@/components/ui/SafeAreaView";
import Animated, { FadeIn } from "react-native-reanimated";
import { useQueryClient } from "@tanstack/react-query";
import { AppDialogSheet } from "@/components/ui/AppDialogSheet";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { InlineNotice } from "@/components/ui/InlineNotice";
import { ReportView } from "@/components/reports/ReportView";
import { ReportEditForm } from "@/components/reports/ReportEditForm";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { ReportLinkedFiles } from "@/components/files/ReportLinkedFiles";
import { toTitleCase } from "@/lib/report-helpers";
import {
  normalizeGeneratedReportPayload,
  type GeneratedSiteReport,
} from "@/lib/generated-report";
import { useLocalProject } from "@/hooks/useLocalProjects";
import { useLocalReportNotes } from "@/hooks/useLocalReportNotes";
import { useLocalReport,
  useLocalReportMutations,
  reportKey,
  reportsKey,
} from "@/hooks/useLocalReports";
import { useReportAutoSave } from "@/hooks/useReportAutoSave";
import { useRefresh } from "@/hooks/useRefresh";
import { useImagePreviewProps } from "@/hooks/useImagePreviewProps";
import {
  type AppDialogCopy,
  getActionErrorDialogCopy,
  getDeleteReportDialogCopy,
} from "@/lib/app-dialog-copy";
import {
  exportReportPdf,
  getSavedReportDetails,
  openSavedReportPdf,
  saveReportPdf,
  shareSavedReportPdf,
} from "@/lib/export-report-pdf";
import { PdfPreviewModal } from "@/components/reports/PdfPreviewModal";
import { ImagePreviewModal } from "@/components/files/ImagePreviewModal";
import { ConflictBanner } from "@/components/sync/ConflictBanner";
import { type FileMetadataRow } from "@/lib/file-upload";

interface SavedReportSheetState {
  status: "generating" | "ready" | "error";
  locationDescription?: string;
  pdfUri?: string;
  reportTitle: string;
  errorMessage?: string;
}

interface ReportDialogSheetState extends AppDialogCopy {
  kind: "error" | "confirm-delete";
}

export default function ReportDetailScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [isExporting, setIsExporting] = useState(false);
  const [isOpeningSavedPdf, setIsOpeningSavedPdf] = useState(false);
  const [isSharingSavedPdf, setIsSharingSavedPdf] = useState(false);
  const [menuVisible, setMenuVisible] = useState(false);
  const [reportDialogSheet, setReportDialogSheet] =
    useState<ReportDialogSheetState | null>(null);
  const [savedReportSheet, setSavedReportSheet] = useState<SavedReportSheetState | null>(
    null,
  );
  const isSaving = savedReportSheet?.status === "generating";
  const [savedReportSheetError, setSavedReportSheetError] = useState<string | null>(
    null,
  );
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
  const [activeTab, setActiveTab] = useState<"report" | "edit">("report");

  // Sync localReport from the parsed saved report once it loads. Subsequent
  // refetches do NOT clobber in-progress edits — autosave is the writer.
  useEffect(() => {
    if (!localReport && report) {
      setLocalReport(report);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [report]);

  const { isSaving: isAutoSaving, lastSavedAt } = useReportAutoSave({
    reportId: hasValidRouteParams ? reportId : null,
    projectId,
    report: localReport,
  });

  const displayReport = localReport ?? report ?? null;
  const notes = (noteRows ?? [])
    .map((note) => note.body?.trim() ?? "")
    .filter((note) => note.length > 0);
  const [sourceNotesExpanded, setSourceNotesExpanded] = useState(false);

  const { remove: removeReport } = useLocalReportMutations();
  const isDeleting = removeReport.isPending;
  const deleteReport = () =>
    removeReport.mutate(
      { id: reportId, projectId },
      {
        onSuccess: () => {
          queryClient.removeQueries({ queryKey: reportKey(reportId) });
          queryClient.invalidateQueries({ queryKey: reportsKey(projectId) });
          const reportsHref = `/projects/${projectId}/reports`;
          if (router.canDismiss()) {
            router.dismissTo(reportsHref);
            return;
          }
          router.replace(reportsHref);
        },
        onError: (err) => {
          setReportDialogSheet({
            kind: "error",
            ...getActionErrorDialogCopy({
              title: "Delete Failed",
              fallbackMessage: "Could not delete the report.",
              message:
                err instanceof Error ? err.message : "Could not delete the report.",
            }),
          });
        },
      },
    );

  const confirmDelete = () => {
    setReportDialogSheet({
      kind: "confirm-delete",
      ...getDeleteReportDialogCopy(),
    });
  };

  const closeReportDialogSheet = () => {
    if (isDeleting && reportDialogSheet?.kind === "confirm-delete") {
      return;
    }

    setReportDialogSheet(null);
  };

  const closeSavedReportSheet = () => {
    setSavedReportSheet(null);
    setSavedReportSheetError(null);
    setIsOpeningSavedPdf(false);
    setIsSharingSavedPdf(false);
  };

  const handleSavePdf = async () => {
    if (!displayReport) return;
    setSavedReportSheetError(null);

    // Open the sheet immediately with a "generating" state so the user
    // sees instant feedback. The PDF generation fills it in.
    setSavedReportSheet({
      status: "generating",
      reportTitle: displayReport.report.meta.title,
    });

    try {
      const saveOptions = {
        siteName: project?.name ?? null,
      };
      const result = await saveReportPdf(displayReport, saveOptions);

      setSavedReportSheet({
        status: "ready",
        locationDescription:
          result.locationDescription ?? `Saved as ${result.pdfFilename}.`,
        pdfUri: result.pdfUri,
        reportTitle: displayReport.report.meta.title,
      });
    } catch (e) {
      setSavedReportSheet({
        status: "error",
        reportTitle: displayReport.report.meta.title,
        errorMessage: e instanceof Error ? e.message : "Could not generate PDF.",
      });
    }
  };

  const handleOpenSavedPdf = async () => {
    if (!savedReportSheet || !savedReportSheet.pdfUri) return;
    setIsOpeningSavedPdf(true);
    setSavedReportSheetError(null);

    try {
      await openSavedReportPdf(savedReportSheet.pdfUri);
      closeSavedReportSheet();
    } catch (error) {
      setSavedReportSheetError(
        error instanceof Error ? error.message : "Could not open the saved PDF.",
      );
    } finally {
      setIsOpeningSavedPdf(false);
    }
  };

  const handleShareSavedPdf = async () => {
    if (!savedReportSheet || !savedReportSheet.pdfUri) return;
    setIsSharingSavedPdf(true);
    setSavedReportSheetError(null);

    try {
      await shareSavedReportPdf({
        pdfUri: savedReportSheet.pdfUri,
        reportTitle: savedReportSheet.reportTitle,
      });
      closeSavedReportSheet();
    } catch (error) {
      setSavedReportSheetError(
        error instanceof Error ? error.message : "Could not share the saved PDF.",
      );
    } finally {
      setIsSharingSavedPdf(false);
    }
  };

  const handleSharePdf = async () => {
    if (!displayReport) return;
    setIsExporting(true);
    setSavedReportSheetError(null);
    try {
      const result = await exportReportPdf(displayReport, {
        siteName: project?.name ?? null,
      });

      if (result.shareErrorMessage) {
        setSavedReportSheet({
          status: "ready",
          locationDescription:
            result.locationDescription ?? `Saved as ${result.pdfFilename}.`,
          pdfUri: result.pdfUri,
          reportTitle: displayReport.report.meta.title,
        });
        setSavedReportSheetError(result.shareErrorMessage);
      }
    } catch (e) {
      setReportDialogSheet({
        kind: "error",
        ...getActionErrorDialogCopy({
          title: "Export Failed",
          fallbackMessage: "Could not generate PDF.",
          message: e instanceof Error ? e.message : "Could not generate PDF.",
        }),
      });
    } finally {
      setIsExporting(false);
    }
  };

  const savedReportDetails = savedReportSheet?.status === "ready" && savedReportSheet.locationDescription && savedReportSheet.pdfUri
    ? getSavedReportDetails({
        locationDescription: savedReportSheet.locationDescription,
        pdfUri: savedReportSheet.pdfUri,
      })
    : null;
  const isPdfGenerating = savedReportSheet?.status === "generating";
  const isPdfError = savedReportSheet?.status === "error";
  const canDismissReportDialogSheet =
    reportDialogSheet?.kind !== "confirm-delete" || !isDeleting;
  const canDismissSavedReportSheet = !isOpeningSavedPdf && !isSharingSavedPdf;

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
        {/* Header */}
        <View className="px-5 py-4">
          <ScreenHeader
            title={displayReport.report.meta.title}
            eyebrow={toTitleCase(displayReport.report.meta.reportType)}
            onBack={() => router.back()}
            backLabel="Reports"
          />

          <View className="mt-3 flex-row items-center justify-between">
            <View className="flex-row items-center gap-2">
              {displayReport.report.meta.visitDate ? (
                <View className="flex-row items-center gap-1 rounded-md border border-border bg-card px-3 py-2">
                  <Calendar size={14} color={colors.muted.foreground} />
                  <Text className="text-sm font-semibold text-muted-foreground">
                    {displayReport.report.meta.visitDate}
                  </Text>
                </View>
              ) : null}
            </View>
            <Button
              variant="secondary"
              size="default"
              accessibilityLabel="Open report actions menu"
              testID="btn-report-actions"
              onPress={() => setMenuVisible(true)}
              disabled={isSaving || isExporting || isDeleting}
            >
              <View className="flex-row items-center gap-1.5">
                <MoreHorizontal size={16} color={colors.foreground} />
                <Text className="text-sm font-semibold text-foreground">
                  Actions
                </Text>
              </View>
            </Button>
          </View>
        </View>

        {/* Conflict resolution banner */}
        {rawReport?.sync_state === "conflict" && (
          <View className="px-5 mb-3">
            <ConflictBanner
              reportId={reportId}
              projectId={projectId}
              hasConflict={true}
            />
          </View>
        )}

        {/* Tab bar */}
        <View className="mx-5 mb-2 flex-row rounded-lg border border-border bg-card p-1">
          <Pressable
            testID="btn-tab-report"
            onPress={() => setActiveTab("report")}
            className={`flex-1 flex-row items-center justify-center gap-2 rounded-md py-3 ${
              activeTab === "report" ? "bg-foreground" : ""
            }`}
          >
            <FileText
              size={16}
              color={activeTab === "report" ? colors.primary.foreground : colors.muted.foreground}
              style={{ marginTop: 1 }}
            />
            <Text
              className={`text-sm font-semibold ${
                activeTab === "report" ? "text-primary-foreground" : "text-muted-foreground"
              }`}
            >
              Report
            </Text>
          </Pressable>
          <Pressable
            testID="btn-tab-edit"
            onPress={() => setActiveTab("edit")}
            className={`flex-1 flex-row items-center justify-center gap-2 rounded-md py-3 ${
              activeTab === "edit" ? "bg-foreground" : ""
            }`}
          >
            <Pencil
              size={16}
              color={activeTab === "edit" ? colors.primary.foreground : colors.muted.foreground}
              style={{ marginTop: 1 }}
            />
            <Text
              className={`text-sm font-semibold ${
                activeTab === "edit" ? "text-primary-foreground" : "text-muted-foreground"
              }`}
            >
              Edit
            </Text>
          </Pressable>
        </View>

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

        {/* Report / Edit content */}
        {activeTab === "report" ? (
          <Animated.View entering={FadeIn.duration(250)} className="px-5">
            <ReportView report={displayReport} />
          </Animated.View>
        ) : (
          <View className="px-5">
            <ReportEditForm report={displayReport} onChange={setLocalReport} />
          </View>
        )}

        {/* Source notes — the raw notes (text, voice, images) that generated this report */}
        {hasValidRouteParams && (
          <View className="mt-4 px-5">
            <Card variant="muted" padding="md">
              <Pressable
                onPress={() => setSourceNotesExpanded((prev) => !prev)}
                accessibilityRole="button"
                accessibilityLabel={
                  sourceNotesExpanded
                    ? "Hide source notes"
                    : "Show source notes"
                }
                className="flex-row items-center justify-between"
              >
                <View className="flex-row items-center gap-2">
                  <MessageSquare size={16} color={colors.foreground} />
                  <Text className="text-base font-semibold text-foreground">
                    Source Notes
                  </Text>
                  {notes.length > 0 ? (
                    <Text className="text-sm text-muted-foreground">
                      ({notes.length})
                    </Text>
                  ) : null}
                </View>
                {sourceNotesExpanded ? (
                  <ChevronDown size={18} color={colors.muted.foreground} />
                ) : (
                  <ChevronRight size={18} color={colors.muted.foreground} />
                )}
              </Pressable>

              {sourceNotesExpanded && (
                <View className="mt-3 gap-3">
                  <Text className="text-sm text-muted-foreground">
                    The original notes this report was generated from.
                  </Text>

                  {notes.length > 0 && (
                    <View className="gap-2">
                      {notes.map((note, index) => (
                        <View
                          key={`source-note-${index}`}
                          className="flex-row items-start gap-3 rounded-lg border border-border bg-card p-3"
                        >
                          <View className="min-h-8 min-w-8 items-center justify-center rounded-md bg-secondary px-2 py-1">
                            <Text className="text-sm font-semibold text-foreground">
                              {index + 1}
                            </Text>
                          </View>
                          <Text className="flex-1 text-body text-foreground">
                            {note}
                          </Text>
                        </View>
                      ))}
                    </View>
                  )}

                  <ReportLinkedFiles
                    projectId={projectId}
                    noteRows={noteRows}
                    onOpenFile={(file) => {
                      if (file.mime_type.startsWith("image/")) {
                        setImagePreview({ file });
                      }
                    }}
                  />
                </View>
              )}
            </Card>
          </View>
        )}
      </ScrollView>

      <Modal
        visible={menuVisible}
        animationType="slide"
        transparent
        onRequestClose={() => setMenuVisible(false)}
      >
        <Pressable
          className="flex-1 justify-end bg-black/40"
          onPress={() => setMenuVisible(false)}
          accessible={false}
        >
          <Pressable
            onPress={(e) => e.stopPropagation()}
            className="bg-background pb-10"
            accessible={false}
          >
            <View className="flex-row items-center justify-between border-b border-border px-5 py-4">
              <Text className="text-xl font-bold text-foreground">
                Report Actions
              </Text>
              <Pressable onPress={() => setMenuVisible(false)} hitSlop={12}>
                <X size={20} color={colors.muted.foreground} />
              </Pressable>
            </View>

            <View className="gap-3 px-5 pt-4">
              <Button
                variant="secondary"
                size="lg"
                className="justify-start"
                accessibilityLabel="View report as PDF"
                testID="btn-report-view-pdf"
                onPress={() => {
                  setMenuVisible(false);
                  setPdfPreviewVisible(true);
                }}
              >
                <View className="flex-row items-center gap-3">
                  <Eye size={16} color={colors.foreground} />
                  <Text className="text-base font-semibold text-foreground">
                    View PDF
                  </Text>
                </View>
              </Button>

              <Button
                variant="secondary"
                size="lg"
                className="justify-start"
                accessibilityLabel="Save report PDF"
                testID="btn-report-save-pdf"
                onPress={async () => {
                  setMenuVisible(false);
                  await handleSavePdf();
                }}
                disabled={isSaving || isExporting}
              >
                <View className="flex-row items-center gap-3">
                  <FileDown size={16} color={colors.foreground} />
                  <Text className="text-base font-semibold text-foreground">
                    {isSaving ? "Saving PDF..." : "Save PDF"}
                  </Text>
                </View>
              </Button>

              <Button
                variant="secondary"
                size="lg"
                className="justify-start"
                accessibilityLabel="Share report as PDF"
                testID="btn-report-share-pdf"
                onPress={async () => {
                  setMenuVisible(false);
                  await handleSharePdf();
                }}
                disabled={isExporting || isSaving}
              >
                <View className="flex-row items-center gap-3">
                  <Share2 size={16} color={colors.foreground} />
                  <Text className="text-base font-semibold text-foreground">
                    {isExporting ? "Sharing PDF..." : "Share PDF"}
                  </Text>
                </View>
              </Button>

              <Button
                variant="destructive"
                size="lg"
                className="justify-start"
                accessibilityLabel="Delete report"
                testID="btn-report-delete"
                onPress={() => {
                  setMenuVisible(false);
                  confirmDelete();
                }}
                disabled={isDeleting}
              >
                <View className="flex-row items-center gap-3">
                  <Trash2 size={16} color={colors.danger.text} />
                  <Text className="text-base font-semibold text-danger-text">
                    {isDeleting ? "Deleting..." : "Delete Report"}
                  </Text>
                </View>
              </Button>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

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

      <Modal
        visible={savedReportSheet !== null}
        animationType="slide"
        transparent
        onRequestClose={() => {
          if (canDismissSavedReportSheet) {
            closeSavedReportSheet();
          }
        }}
      >
        <Pressable
          className="flex-1 justify-end bg-black/40"
          accessible={false}
          onPress={() => {
            if (canDismissSavedReportSheet) {
              closeSavedReportSheet();
            }
          }}
        >
          <Pressable
            onPress={(e) => e.stopPropagation()}
            className="bg-background pb-10"
            accessible={false}
          >
            <View className="flex-row items-center justify-between border-b border-border px-5 py-4">
              <Text className="text-xl font-bold text-foreground">
                {isPdfGenerating
                  ? "Preparing PDF…"
                  : isPdfError
                    ? "PDF Failed"
                    : savedReportDetails?.title ?? "PDF Saved"}
              </Text>
              <Pressable
                onPress={closeSavedReportSheet}
                hitSlop={12}
                disabled={!canDismissSavedReportSheet}
              >
                <X size={20} color={colors.muted.foreground} />
              </Pressable>
            </View>

            {isPdfGenerating ? (
              <View className="items-center justify-center gap-3 px-5 py-8">
                <ActivityIndicator size="large" color={colors.foreground} />
                <Text className="text-base text-muted-foreground">
                  Generating PDF for {savedReportSheet?.reportTitle ?? "report"}…
                </Text>
              </View>
            ) : isPdfError ? (
              <View className="gap-4 px-5 pt-4">
                <InlineNotice tone="danger" title="PDF generation failed">
                  {savedReportSheet?.errorMessage ?? "Could not generate PDF."}
                </InlineNotice>
                <Button
                  variant="secondary"
                  size="lg"
                  onPress={() => {
                    closeSavedReportSheet();
                    void handleSavePdf();
                  }}
                >
                  Retry
                </Button>
                <Button
                  variant="quiet"
                  size="lg"
                  onPress={closeSavedReportSheet}
                >
                  Dismiss
                </Button>
              </View>
            ) : savedReportDetails ? (
              <View className="gap-4 px-5 pt-4">
                <InlineNotice tone="success" title="Saved to app documents">
                  {savedReportDetails.locationDescription}
                </InlineNotice>

                <Card className="gap-3">
                  <View className="flex-row items-center gap-2">
                    <FolderOpen size={16} color={colors.foreground} />
                    <Text className="text-sm font-semibold text-foreground">
                      Full path
                    </Text>
                  </View>
                  <Text className="text-sm leading-5 text-muted-foreground">
                    {savedReportDetails.fullPath}
                  </Text>
                </Card>

                <View className="gap-1">
                  <Text className="text-sm font-semibold text-foreground">
                    Open it now or send it somewhere else
                  </Text>
                  <Text className="text-sm leading-5 text-muted-foreground">
                    {savedReportDetails.openHint}
                  </Text>
                  <Text className="text-sm leading-5 text-muted-foreground">
                    {savedReportDetails.shareHint}
                  </Text>
                </View>

                {savedReportSheetError ? (
                  <InlineNotice tone="danger" title="Action failed">
                    {savedReportSheetError}
                  </InlineNotice>
                ) : null}

                <View className="gap-3">
                  <Button
                    variant="default"
                    size="lg"
                    className="justify-start"
                    accessibilityLabel="Open saved PDF"
                    onPress={handleOpenSavedPdf}
                    disabled={isOpeningSavedPdf || isSharingSavedPdf}
                  >
                    <View className="flex-row items-center gap-3">
                      <FileText size={16} color={colors.primary.foreground} />
                      <Text className="text-base font-semibold text-primary-foreground">
                        {isOpeningSavedPdf ? "Opening PDF..." : "Open PDF"}
                      </Text>
                    </View>
                  </Button>

                  <Button
                    variant="secondary"
                    size="lg"
                    className="justify-start"
                    accessibilityLabel="Share saved PDF"
                    onPress={handleShareSavedPdf}
                    disabled={isSharingSavedPdf || isOpeningSavedPdf}
                  >
                    <View className="flex-row items-center gap-3">
                      <Share2 size={16} color={colors.foreground} />
                      <Text className="text-base font-semibold text-foreground">
                        {isSharingSavedPdf ? "Sharing PDF..." : "Share PDF"}
                      </Text>
                    </View>
                  </Button>

                  <Button
                    variant="quiet"
                    size="lg"
                    className="justify-center"
                    accessibilityLabel="Close saved PDF dialog"
                    onPress={closeSavedReportSheet}
                    disabled={isSharingSavedPdf || isOpeningSavedPdf}
                  >
                    Done
                  </Button>
                </View>
              </View>
            ) : null}
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}
