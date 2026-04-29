import {
  View,
  Text,
  ScrollView,
  ActivityIndicator,
  Modal,
  Pressable,
  RefreshControl,
} from "react-native";
import { useState } from "react";
import { useRouter, useLocalSearchParams } from "expo-router";
import {
  Calendar,
  ChevronDown,
  ChevronRight,
  Eye,
  MessageSquare,
  Trash2,
  FileDown,
  FileText,
  FolderOpen,
  Share2,
  MoreHorizontal,
  X,
} from "lucide-react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Animated, { FadeIn } from "react-native-reanimated";
import { useQueryClient } from "@tanstack/react-query";
import { AppDialogSheet } from "@/components/ui/AppDialogSheet";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { InlineNotice } from "@/components/ui/InlineNotice";
import { ReportView } from "@/components/reports/ReportView";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { VoiceNoteList } from "@/components/voice-notes/VoiceNoteList";
import { FileList } from "@/components/files/FileList";
import { toTitleCase } from "@/lib/report-helpers";
import {
  normalizeGeneratedReportPayload,
  type GeneratedSiteReport,
} from "@/lib/generated-report";
import { useLocalProject } from "@/hooks/useLocalProjects";
import {
  useLocalReport,
  useLocalReportMutations,
  reportKey,
  reportsKey,
} from "@/hooks/useLocalReports";
import { useRefresh } from "@/hooks/useRefresh";
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
import { ConnectionBanner } from "@/components/sync/ConnectionBanner";
import { ConflictBanner } from "@/components/sync/ConflictBanner";
import { type FileMetadataRow } from "@/lib/file-upload";

interface SavedReportSheetState {
  locationDescription: string;
  pdfUri: string;
  reportTitle: string;
}

interface ReportDialogSheetState extends AppDialogCopy {
  kind: "error" | "confirm-delete";
}

export default function ReportDetailScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [isExporting, setIsExporting] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isOpeningSavedPdf, setIsOpeningSavedPdf] = useState(false);
  const [isSharingSavedPdf, setIsSharingSavedPdf] = useState(false);
  const [menuVisible, setMenuVisible] = useState(false);
  const [reportDialogSheet, setReportDialogSheet] =
    useState<ReportDialogSheetState | null>(null);
  const [savedReportSheet, setSavedReportSheet] = useState<SavedReportSheetState | null>(
    null,
  );
  const [savedReportSheetError, setSavedReportSheetError] = useState<string | null>(
    null,
  );
  const [pdfPreviewVisible, setPdfPreviewVisible] = useState(false);
  const [imagePreview, setImagePreview] = useState<{ uri: string; title: string } | null>(null);
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

  const { refreshing, onRefresh } = useRefresh([refetch]);

  const reportData = (() => {
    if (!rawReport) return undefined;
    const parsed = normalizeGeneratedReportPayload(rawReport.report_data);
    if (!parsed) return undefined;
    return { report: parsed, notes: rawReport.notes };
  })();

  const report = reportData?.report;
  const notes = reportData?.notes ?? [];
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
    if (!report) return;
    setIsSaving(true);
    setSavedReportSheetError(null);
    try {
      const saveOptions = {
        siteName: project?.name ?? null,
      };
      const result = await saveReportPdf(report, saveOptions);

      setSavedReportSheet({
        locationDescription:
          result.locationDescription ?? `Saved as ${result.pdfFilename}.`,
        pdfUri: result.pdfUri,
        reportTitle: report.report.meta.title,
      });
    } catch (e) {
      setSavedReportSheet(null);
      setReportDialogSheet({
        kind: "error",
        ...getActionErrorDialogCopy({
          title: "Save Failed",
          fallbackMessage: "Could not generate PDF.",
          message: e instanceof Error ? e.message : "Could not generate PDF.",
        }),
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleOpenSavedPdf = async () => {
    if (!savedReportSheet) return;
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
    if (!savedReportSheet) return;
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
    if (!report) return;
    setIsExporting(true);
    setSavedReportSheetError(null);
    try {
      const result = await exportReportPdf(report, {
        siteName: project?.name ?? null,
      });

      if (result.shareErrorMessage) {
        setSavedReportSheet({
          locationDescription:
            result.locationDescription ?? `Saved as ${result.pdfFilename}.`,
          pdfUri: result.pdfUri,
          reportTitle: report.report.meta.title,
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

  const savedReportDetails = savedReportSheet
    ? getSavedReportDetails({
        locationDescription: savedReportSheet.locationDescription,
        pdfUri: savedReportSheet.pdfUri,
      })
    : null;
  const canDismissReportDialogSheet =
    reportDialogSheet?.kind !== "confirm-delete" || !isDeleting;
  const canDismissSavedReportSheet = !isOpeningSavedPdf && !isSharingSavedPdf;

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
      <ConnectionBanner />
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
            title={report.report.meta.title}
            eyebrow={toTitleCase(report.report.meta.reportType)}
            onBack={() => router.back()}
            backLabel="Reports"
          />

          <View className="mt-3 flex-row items-center justify-between">
            <View className="flex-row items-center gap-2">
              {report.report.meta.visitDate ? (
                <View className="flex-row items-center gap-1 rounded-md border border-border bg-card px-3 py-2">
                  <Calendar size={14} color="#5c5c6e" />
                  <Text className="text-sm font-semibold text-muted-foreground">
                    {report.report.meta.visitDate}
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
                <MoreHorizontal size={16} color="#1a1a2e" />
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

        {/* Report sections */}
        <Animated.View entering={FadeIn.duration(250)} className="px-5">
          <ReportView report={report} />
        </Animated.View>

        {/* Voice notes & attached files for this report */}
        {hasValidRouteParams ? (
          <View className="mt-4 gap-3 px-5">
            <VoiceNoteList projectId={projectId} reportId={reportId} readOnly />
            <FileList
              projectId={projectId}
              reportId={reportId}
              excludeCategory="voice-note"
              emptyMessage=""
              readOnly
              onOpen={(url, file) => {
                if (file.mime_type.startsWith("image/")) {
                  setImagePreview({ uri: url, title: file.filename });
                }
              }}
            />
          </View>
        ) : null}

        {/* Source notes — the raw notes that generated this report */}
        {notes.length > 0 && (
          <View className="mt-3 px-5">
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
                  <MessageSquare size={16} color="#1a1a2e" />
                  <Text className="text-base font-semibold text-foreground">
                    Source Notes
                  </Text>
                  <Text className="text-sm text-muted-foreground">
                    ({notes.length})
                  </Text>
                </View>
                {sourceNotesExpanded ? (
                  <ChevronDown size={18} color="#5c5c6e" />
                ) : (
                  <ChevronRight size={18} color="#5c5c6e" />
                )}
              </Pressable>

              {sourceNotesExpanded && (
                <View className="mt-3 gap-2">
                  <Text className="text-sm text-muted-foreground">
                    The original notes this report was generated from.
                  </Text>
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
                      <Text
                       
                        className="flex-1 text-body text-foreground"
                      >
                        {note}
                      </Text>
                    </View>
                  ))}
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
                <X size={20} color="#5c5c6e" />
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
                  <Eye size={16} color="#1a1a2e" />
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
                  <FileDown size={16} color="#1a1a2e" />
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
                  <Share2 size={16} color="#1a1a2e" />
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
                  <Trash2 size={16} color="#8f1d18" />
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
        report={report}
        siteName={project?.name ?? null}
        onClose={() => setPdfPreviewVisible(false)}
      />

      <ImagePreviewModal
        visible={imagePreview !== null}
        uri={imagePreview?.uri ?? null}
        title={imagePreview?.title}
        onClose={() => setImagePreview(null)}
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
                {savedReportDetails?.title ?? "PDF Saved"}
              </Text>
              <Pressable
                onPress={closeSavedReportSheet}
                hitSlop={12}
                disabled={!canDismissSavedReportSheet}
              >
                <X size={20} color="#5c5c6e" />
              </Pressable>
            </View>

            {savedReportDetails ? (
              <View className="gap-4 px-5 pt-4">
                <InlineNotice tone="success" title="Saved to app documents">
                  {savedReportDetails.locationDescription}
                </InlineNotice>

                <Card className="gap-3">
                  <View className="flex-row items-center gap-2">
                    <FolderOpen size={16} color="#1a1a2e" />
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
                      <FileText size={16} color="#f8f5ee" />
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
                      <Share2 size={16} color="#1a1a2e" />
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
