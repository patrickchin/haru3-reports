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

type DraftMenuState =
  | { step: "closed" }
  | { step: "menu"; anchor: MenuAnchor }
  | { step: "confirm" };

export function DeleteDraftButton({
  accessibilityLabel = "Delete draft report",
  isDeleting,
  onConfirmDelete,
  extraActions,
}: DeleteDraftButtonProps) {
  const [menuState, setMenuState] = useState<DraftMenuState>({ step: "closed" });
  const anchorRef = useRef<View>(null);

  const confirmation = getDeleteDraftDialogCopy();
  const menuAnchor = menuState.step === "menu" ? menuState.anchor : null;

  const handleOpenMenu = () => {
    anchorRef.current?.measureInWindow((x, y, width, height) => {
      const screenWidth = Dimensions.get("window").width;
      setMenuState({
        step: "menu",
        anchor: {
          top: y + height + 6,
          right: Math.max(8, screenWidth - (x + width)),
        },
      });
    });
  };

  const closeMenu = () => setMenuState({ step: "closed" });

  const handleSelectDelete = () => {
    setMenuState({ step: "confirm" });
  };

  const handleConfirmDelete = () => {
    setMenuState({ step: "closed" });
    onConfirmDelete();
  };

  return (
    <>
      <View ref={anchorRef} collapsable={false}>
        <Button
          testID="btn-draft-menu"
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
        visible={menuState.step === "menu"}
        transparent
        animationType="fade"
        onRequestClose={closeMenu}
      >
        {/*
         * `accessible={false}` is critical: without it the backdrop
         * Pressable becomes an a11y container and hides the inner
         * menu items (incl. testID="btn-delete-draft") from Maestro
         * and screen readers. Mirrors the pattern used by the report
         * actions sheet in app/projects/[projectId]/reports/[reportId].tsx.
         */}
        <Pressable
          className="flex-1 bg-black/20"
          onPress={closeMenu}
          accessible={false}
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
                    closeMenu();
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
                testID="btn-delete-draft"
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
        visible={menuState.step === "confirm"}
        title={confirmation.title}
        message={confirmation.message}
        noticeTone={confirmation.tone}
        noticeTitle={confirmation.noticeTitle}
        onClose={closeMenu}
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
            onPress: closeMenu,
            accessibilityLabel: "Cancel deleting draft report",
          },
        ]}
      />
    </>
  );
}
