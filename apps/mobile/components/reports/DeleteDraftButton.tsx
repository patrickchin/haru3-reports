import { useState } from "react";
import { Text, View } from "react-native";
import { Trash2 } from "lucide-react-native";
import { AppDialogSheet } from "@/components/ui/AppDialogSheet";
import { Button } from "@/components/ui/Button";
import { getDeleteDraftDialogCopy } from "@/lib/app-dialog-copy";

type DeleteDraftButtonProps = {
  accessibilityLabel?: string;
  isDeleting: boolean;
  onConfirmDelete: () => void;
};

export function DeleteDraftButton({
  accessibilityLabel = "Delete draft report",
  isDeleting,
  onConfirmDelete,
}: DeleteDraftButtonProps) {
  const [isConfirmVisible, setIsConfirmVisible] = useState(false);

  const handlePress = () => {
    setIsConfirmVisible(true);
  };

  const confirmation = getDeleteDraftDialogCopy();

  const handleConfirmDelete = () => {
    setIsConfirmVisible(false);
    onConfirmDelete();
  };

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        className="self-start border-destructive"
        accessibilityLabel={accessibilityLabel}
        onPress={handlePress}
        disabled={isDeleting}
      >
        <View className="flex-row items-center gap-1.5">
          <Trash2 size={14} color="#e5383b" />
          <Text className="text-base font-semibold text-destructive">
            {isDeleting ? "Deleting..." : "Delete Draft"}
          </Text>
        </View>
      </Button>

      <AppDialogSheet
        visible={isConfirmVisible}
        title={confirmation.title}
        message={confirmation.message}
        noticeTone={confirmation.tone}
        noticeTitle={confirmation.noticeTitle}
        onClose={() => setIsConfirmVisible(false)}
        actions={[
          {
            label: confirmation.confirmLabel,
            variant: confirmation.confirmVariant,
            onPress: handleConfirmDelete,
            accessibilityLabel: accessibilityLabel,
            align: "start",
          },
          {
            label: confirmation.cancelLabel ?? "Cancel",
            variant: "quiet",
            onPress: () => setIsConfirmVisible(false),
            accessibilityLabel: "Cancel deleting draft report",
          },
        ]}
      />
    </>
  );
}
