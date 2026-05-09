import { View, Text, Modal, Pressable } from "react-native";
import {
  Eye,
  FileDown,
  Share2,
  Trash2,
  X,
} from "lucide-react-native";
import { Button } from "@/components/ui/Button";
import { colors } from "@/lib/design-tokens/colors";

interface ReportActionsMenuProps {
  visible: boolean;
  onClose: () => void;
  onViewPdf: () => void;
  onSavePdf: () => void;
  onSharePdf: () => void;
  onDelete: () => void;
  isSaving: boolean;
  isExporting: boolean;
  isDeleting: boolean;
}

export function ReportActionsMenu({
  visible,
  onClose,
  onViewPdf,
  onSavePdf,
  onSharePdf,
  onDelete,
  isSaving,
  isExporting,
  isDeleting,
}: ReportActionsMenuProps) {
  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onClose}
    >
      <Pressable
        className="flex-1 justify-end bg-black/40"
        onPress={onClose}
        accessible={false}
      >
        <Pressable
          onPress={(e) => e.stopPropagation()}
          className="bg-background pb-10"
          accessible={false}
        >
          <View className="flex-row items-center justify-between border-b border-border px-5 py-4">
            <Text className="text-xl font-bold text-foreground">Report Actions</Text>
            <Pressable onPress={onClose} hitSlop={12}>
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
              onPress={onViewPdf}
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
              onPress={onSavePdf}
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
              onPress={onSharePdf}
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
              onPress={onDelete}
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
  );
}
