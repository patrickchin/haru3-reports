import { useRef, useState, type ReactNode } from "react";
import { Dimensions, Modal, Pressable, Text, View } from "react-native";
import { MoreVertical, Trash2 } from "lucide-react-native";
import { AppDialogSheet } from "@/components/ui/AppDialogSheet";
import { Button } from "@/components/ui/Button";
import { getDeleteDraftDialogCopy } from "@/lib/app-dialog-copy";
import { colors } from "@/lib/design-tokens/colors";

export type DraftMenuAction = {
  key: string;
  label: string;
  icon: ReactNode;
  onPress: () => void;
  disabled?: boolean;
  destructive?: boolean;
  accessibilityLabel?: string;
  testID?: string;
};

type DeleteDraftButtonProps = {
  accessibilityLabel?: string;
  isDeleting: boolean;
  onConfirmDelete: () => void;
  /**
   * Extra menu items rendered above the Delete Draft entry. Each item closes
   * the menu before invoking its `onPress`.
   */
  extraActions?: readonly DraftMenuAction[];
};

type MenuAnchor = { top: number; right: number };

export function DeleteDraftButton({
  accessibilityLabel = "Delete draft report",
  isDeleting,
  onConfirmDelete,
  extraActions,
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
            <MoreVertical size={16} color={colors.foreground} />
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
              className="min-w-[200px] overflow-hidden rounded-lg border border-border bg-card shadow-lg"
              style={{
                position: "absolute",
                top: menuAnchor.top,
                right: menuAnchor.right,
              }}
            >
              {extraActions?.map((action) => (
                <Pressable
                  key={action.key}
                  onPress={() => {
                    setIsMenuVisible(false);
                    action.onPress();
                  }}
                  accessibilityRole="button"
                  accessibilityLabel={action.accessibilityLabel ?? action.label}
                  testID={action.testID}
                  disabled={action.disabled}
                  className="flex-row items-center gap-2 border-b border-border px-4 py-3 active:bg-muted"
                >
                  {action.icon}
                  <Text
                    className={`text-base font-semibold ${
                      action.destructive
                        ? "text-destructive"
                        : action.disabled
                          ? "text-muted-foreground"
                          : "text-foreground"
                    }`}
                  >
                    {action.label}
                  </Text>
                </Pressable>
              ))}
              <Pressable
                onPress={handleSelectDelete}
                accessibilityRole="button"
                accessibilityLabel={accessibilityLabel}
                disabled={isDeleting}
                className="flex-row items-center gap-2 px-4 py-3 active:bg-muted"
              >
                <Trash2 size={16} color={colors.danger.DEFAULT} />
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
