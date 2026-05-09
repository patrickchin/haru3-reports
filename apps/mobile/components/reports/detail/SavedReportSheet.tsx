import { View, Text, ActivityIndicator, Modal, Pressable } from "react-native";
import {
  FileText,
  FolderOpen,
  Share2,
  X,
} from "lucide-react-native";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { InlineNotice } from "@/components/ui/InlineNotice";
import { colors } from "@/lib/design-tokens/colors";
import { getSavedReportDetails } from "@/lib/export-report-pdf";
import type { SavedReportSheetState } from "@/hooks/useReportPdfActions";

type SavedReportDetails = ReturnType<typeof getSavedReportDetails>;

interface SavedReportSheetProps {
  state: SavedReportSheetState | null;
  details: SavedReportDetails | null;
  errorMessage: string | null;
  isOpening: boolean;
  isSharing: boolean;
  onClose: () => void;
  onOpen: () => void;
  onShare: () => void;
  onRetrySave: () => void;
}

export function SavedReportSheet({
  state,
  details,
  errorMessage,
  isOpening,
  isSharing,
  onClose,
  onOpen,
  onShare,
  onRetrySave,
}: SavedReportSheetProps) {
  const canDismiss = !isOpening && !isSharing;
  const isGenerating = state?.status === "generating";
  const isError = state?.status === "error";

  return (
    <Modal
      visible={state !== null}
      animationType="slide"
      transparent
      onRequestClose={() => {
        if (canDismiss) onClose();
      }}
    >
      <Pressable
        className="flex-1 justify-end bg-black/40"
        accessible={false}
        onPress={() => {
          if (canDismiss) onClose();
        }}
      >
        <Pressable
          onPress={(e) => e.stopPropagation()}
          className="bg-background pb-10"
          accessible={false}
        >
          <View className="flex-row items-center justify-between border-b border-border px-5 py-4">
            <Text className="text-xl font-bold text-foreground">
              {isGenerating
                ? "Preparing PDF…"
                : isError
                  ? "PDF Failed"
                  : details?.title ?? "PDF Saved"}
            </Text>
            <Pressable onPress={onClose} hitSlop={12} disabled={!canDismiss}>
              <X size={20} color={colors.muted.foreground} />
            </Pressable>
          </View>

          {isGenerating ? (
            <View className="items-center justify-center gap-3 px-5 py-8">
              <ActivityIndicator size="large" color={colors.foreground} />
              <Text className="text-base text-muted-foreground">
                Generating PDF for {state?.reportTitle ?? "report"}…
              </Text>
            </View>
          ) : isError ? (
            <View className="gap-4 px-5 pt-4">
              <InlineNotice tone="danger" title="PDF generation failed">
                {state?.errorMessage ?? "Could not generate PDF."}
              </InlineNotice>
              <Button variant="secondary" size="lg" onPress={onRetrySave}>
                Retry
              </Button>
              <Button variant="quiet" size="lg" onPress={onClose}>
                Dismiss
              </Button>
            </View>
          ) : details ? (
            <View className="gap-4 px-5 pt-4">
              <InlineNotice tone="success" title="Saved to app documents">
                {details.locationDescription}
              </InlineNotice>

              <Card className="gap-3">
                <View className="flex-row items-center gap-2">
                  <FolderOpen size={16} color={colors.foreground} />
                  <Text className="text-sm font-semibold text-foreground">
                    Full path
                  </Text>
                </View>
                <Text className="text-sm leading-5 text-muted-foreground">
                  {details.fullPath}
                </Text>
              </Card>

              <View className="gap-1">
                <Text className="text-sm font-semibold text-foreground">
                  Open it now or send it somewhere else
                </Text>
                <Text className="text-sm leading-5 text-muted-foreground">
                  {details.openHint}
                </Text>
                <Text className="text-sm leading-5 text-muted-foreground">
                  {details.shareHint}
                </Text>
              </View>

              {errorMessage ? (
                <InlineNotice tone="danger" title="Action failed">
                  {errorMessage}
                </InlineNotice>
              ) : null}

              <View className="gap-3">
                <Button
                  variant="default"
                  size="lg"
                  className="justify-start"
                  accessibilityLabel="Open saved PDF"
                  onPress={onOpen}
                  disabled={isOpening || isSharing}
                >
                  <View className="flex-row items-center gap-3">
                    <FileText size={16} color={colors.primary.foreground} />
                    <Text className="text-base font-semibold text-primary-foreground">
                      {isOpening ? "Opening PDF..." : "Open PDF"}
                    </Text>
                  </View>
                </Button>

                <Button
                  variant="secondary"
                  size="lg"
                  className="justify-start"
                  accessibilityLabel="Share saved PDF"
                  onPress={onShare}
                  disabled={isSharing || isOpening}
                >
                  <View className="flex-row items-center gap-3">
                    <Share2 size={16} color={colors.foreground} />
                    <Text className="text-base font-semibold text-foreground">
                      {isSharing ? "Sharing PDF..." : "Share PDF"}
                    </Text>
                  </View>
                </Button>

                <Button
                  variant="quiet"
                  size="lg"
                  className="justify-center"
                  accessibilityLabel="Close saved PDF dialog"
                  onPress={onClose}
                  disabled={isSharing || isOpening}
                >
                  Done
                </Button>
              </View>
            </View>
          ) : null}
        </Pressable>
      </Pressable>
    </Modal>
  );
}
