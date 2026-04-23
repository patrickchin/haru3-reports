import { View, Text, Modal, ActivityIndicator, Platform } from "react-native";
import { useState, useEffect } from "react";
import { WebView } from "react-native-webview";
import {
  SafeAreaProvider,
  SafeAreaView,
} from "react-native-safe-area-context";
import { Share2 } from "lucide-react-native";
import { Button } from "@/components/ui/Button";
import { InlineNotice } from "@/components/ui/InlineNotice";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import {
  saveReportPdf,
  shareSavedReportPdf,
  openSavedReportPdf,
  type ExportedReport,
} from "@/lib/export-report-pdf";
import type { GeneratedSiteReport } from "@/lib/generated-report";

interface PdfPreviewModalProps {
  visible: boolean;
  report: GeneratedSiteReport | undefined;
  siteName?: string | null;
  onClose: () => void;
}

export function PdfPreviewModal({
  visible,
  report,
  siteName,
  onClose,
}: PdfPreviewModalProps) {
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSharing, setIsSharing] = useState(false);
  const [pdfResult, setPdfResult] = useState<ExportedReport | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) {
      setPdfResult(null);
      setErrorMessage(null);
      setIsGenerating(false);
      setIsSharing(false);
      return;
    }

    if (!report) return;

    let cancelled = false;
    setIsGenerating(true);
    setErrorMessage(null);

    saveReportPdf(report, { siteName })
      .then((result) => {
        if (!cancelled) {
          setPdfResult(result);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setErrorMessage(
            err instanceof Error ? err.message : "Could not generate PDF.",
          );
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsGenerating(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [visible, report, siteName]);

  const handleShare = async () => {
    if (!pdfResult || !report) return;
    setIsSharing(true);
    try {
      await shareSavedReportPdf({
        pdfUri: pdfResult.pdfUri,
        reportTitle: report.report.meta.title,
      });
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : "Could not share the PDF.",
      );
    } finally {
      setIsSharing(false);
    }
  };

  // On Android, WebView can't render local PDFs directly.
  // We auto-open the PDF in an external viewer when it's ready.
  useEffect(() => {
    if (Platform.OS !== "android" || !pdfResult || isGenerating) return;

    openSavedReportPdf(pdfResult.pdfUri).catch((err) => {
      setErrorMessage(
        err instanceof Error ? err.message : "Could not open the PDF.",
      );
    });
  }, [pdfResult, isGenerating]);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={onClose}
    >
      <SafeAreaProvider>
        <SafeAreaView className="flex-1 bg-background" edges={["top", "bottom"]}>
        <View className="px-5 pb-2 pt-2">
          <ScreenHeader
            title="PDF Preview"
            onBack={onClose}
            backLabel="Close"
            trailing={
              pdfResult ? (
                <Button
                  variant="secondary"
                  size="default"
                  accessibilityLabel="Share PDF"
                  onPress={handleShare}
                  disabled={isSharing}
                >
                  <View className="flex-row items-center gap-1.5">
                    <Share2 size={14} color="#1a1a2e" />
                    <Text className="text-sm font-semibold text-foreground">
                      {isSharing ? "Sharing..." : "Share"}
                    </Text>
                  </View>
                </Button>
              ) : null
            }
          />
        </View>

        {isGenerating ? (
          <View className="flex-1 items-center justify-center gap-3">
            <ActivityIndicator size="large" color="#1a1a2e" />
            <Text className="text-base text-muted-foreground">
              Generating PDF...
            </Text>
          </View>
        ) : errorMessage ? (
          <View className="flex-1 items-center justify-center px-5">
            <InlineNotice tone="danger" title="PDF generation failed">
              {errorMessage}
            </InlineNotice>
            <Button
              variant="secondary"
              size="default"
              className="mt-4"
              onPress={onClose}
            >
              Close
            </Button>
          </View>
        ) : pdfResult ? (
          Platform.OS === "ios" ? (
            <WebView
              source={{ uri: pdfResult.pdfUri }}
              style={{ flex: 1 }}
              originWhitelist={["file://*"]}
              allowFileAccess
              startInLoadingState
              renderLoading={() => (
                <View className="absolute inset-0 items-center justify-center bg-background">
                  <ActivityIndicator size="large" color="#1a1a2e" />
                </View>
              )}
            />
          ) : (
            <View className="flex-1 items-center justify-center gap-4 px-5">
              <Text className="text-center text-base text-muted-foreground">
                The PDF has been opened in your device's PDF viewer.
              </Text>
              <Button variant="secondary" size="default" onPress={onClose}>
                Close
              </Button>
            </View>
          )
        ) : null}
        </SafeAreaView>
      </SafeAreaProvider>
    </Modal>
  );
}
