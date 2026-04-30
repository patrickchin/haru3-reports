import { type ReactNode } from "react";
import { Modal, Pressable, Text, View } from "react-native";
import { X } from "lucide-react-native";
import { Button } from "@/components/ui/Button";
import { InlineNotice, type InlineNoticeTone } from "@/components/ui/InlineNotice";
import type { AppDialogActionVariant } from "@/lib/app-dialog-copy";

interface AppDialogAction {
  label: string;
  onPress: () => void;
  variant?: AppDialogActionVariant;
  disabled?: boolean;
  accessibilityLabel?: string;
  align?: "start" | "center";
}

interface AppDialogSheetProps {
  visible: boolean;
  title: string;
  message?: string;
  noticeTone?: InlineNoticeTone;
  noticeTitle?: string;
  onClose: () => void;
  canDismiss?: boolean;
  actions: AppDialogAction[];
  children?: ReactNode;
}

export function AppDialogSheet({
  visible,
  title,
  message,
  noticeTone = "danger",
  noticeTitle,
  onClose,
  canDismiss = true,
  actions,
  children,
}: AppDialogSheetProps) {
  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={() => {
        if (canDismiss) {
          onClose();
        }
      }}
    >
      <Pressable
        className="flex-1 justify-end bg-black/40"
        onPress={() => {
          if (canDismiss) {
            onClose();
          }
        }}
      >
        <Pressable
          onPress={(e) => e.stopPropagation()}
          className="bg-background pb-10"
          testID="dialog-sheet"
        >
          <View className="flex-row items-center justify-between border-b border-border px-5 py-4">
            <Text className="text-xl font-bold text-foreground">{title}</Text>
            <Pressable onPress={onClose} hitSlop={12} disabled={!canDismiss}>
              <X size={20} color="#5c5c6e" />
            </Pressable>
          </View>

          <View className="gap-4 px-5 pt-4">
            {message ? (
              <InlineNotice tone={noticeTone} title={noticeTitle}>
                {message}
              </InlineNotice>
            ) : null}

            {children ? <View>{children}</View> : null}

            <View className="gap-3">
              {actions.map((action, index) => (
                <Button
                  key={action.label}
                  variant={action.variant ?? "secondary"}
                  size="lg"
                  className={action.align === "start" ? "justify-start" : "justify-center"}
                  accessibilityLabel={action.accessibilityLabel}
                  testID={`dialog-action-${index}`}
                  onPress={action.onPress}
                  disabled={action.disabled}
                >
                  {action.label}
                </Button>
              ))}
            </View>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
