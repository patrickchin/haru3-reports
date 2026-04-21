import { useRef, useState } from "react";
import { Dimensions, Modal, Pressable, Text, View } from "react-native";
import { MoreVertical, Trash2 } from "lucide-react-native";
import { AppDialogSheet } from "@/components/ui/AppDialogSheet";
import { Button } from "@/components/ui/Button";
import { getDeleteDraftDialogCopy } from "@/lib/app-dialog-copy";

type DeleteDraftButtonProps = {
  accessibilityLabel?: string;
  isDeleting: boolean;
  onConfirmDelete: () => void;
};

type MenuAnchor = { top: number; right: number };

export function DeleteDraftButton({
  accessibilityLabel = "Delete draft report",
  isDeleting,
  onConfirmDelete,
}: DeleteDraftButtonProps) {
  const [isMenuVisible, setIsMenuVisible] = useState(false);
  const [isConfirmVisible, setIsConfirmVisible] = useState(false);
  const [menuAnchor, setMenuAnchor] = useState<MenuAnchor | null>(null);
  const anchorRef = useRef<View>(null);

  const confirmation = getDeleteDraftDialogCopy();

  const handleOpenMenu = () => {
    anchorRef.current?.measureInWindow((x, y, width, height) => {
      const screenWidth = Dimensions.get("window").width;
      setMenuAnchor({
        top: y + height + 6,
        right: Math.max(8, screenWidth - (x + width)),
      });
      setIsMenuVisible(true);
    });
  };

  const handleCloseMenu = () => setIsMenuVisible(false);

  const handleSelectDelete = () => {
    setIsMenuVisible(false);
    setIsConfirmVisible(true);
  };

  const handleConfirmDelete = () => {
    setIsConfirmVisible(false);
    onConfirmDelete();
  };

  return (
    <>
      <View ref={anchorRef} collapsable={false}>
        <Button
          variant="outline"
          size="default"
          className="px-4"
          accessibilityLabel="More options"
          onPress={handleOpenMenu}
          disabled={isDeleting}
        >
          <View className="items-center justify-center">
            <MoreVertical size={16} color="#1a1a2e" />
          </View>
        </Button>
      </View>

      <Modal
        visible={isMenuVisible}
        transparent
        animationType="fade"
        onRequestClose={handleCloseMenu}
      >
        <Pressable
          className="flex-1 bg-black/20"
          onPress={handleCloseMenu}
          accessibilityLabel="Close menu"
        >
          {menuAnchor ? (
            <View
              className="min-w-[180px] overflow-hidden rounded-lg border border-border bg-card shadow-lg"
              style={{
                position: "absolute",
                top: menuAnchor.top,
                right: menuAnchor.right,
              }}
            >
              <Pressable
                onPress={handleSelectDelete}
                accessibilityRole="button"
                accessibilityLabel={accessibilityLabel}
                disabled={isDeleting}
                className="flex-row items-center gap-2 px-4 py-3 active:bg-muted"
              >
                <Trash2 size={16} color="#e5383b" />
                <Text className="text-base font-semibold text-destructive">
                  {isDeleting ? "Deleting..." : "Delete Draft"}
                </Text>
              </Pressable>
            </View>
          ) : null}
        </Pressable>
      </Modal>

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
