import { Pressable, View } from "react-native";
import { Check, Pencil, X } from "lucide-react-native";
import { colors } from "@/lib/design-tokens/colors";

export interface CardEditButtonsProps {
  isEditing: boolean;
  onEdit: () => void;
  onSave: () => void;
  onCancel: () => void;
  disabled?: boolean;
  /**
   * Optional testID prefix. When provided, the rendered buttons get
   * `${testID}-edit`, `${testID}-save`, `${testID}-cancel` respectively.
   */
  testID?: string;
}

/**
 * Card-level edit affordance: a single Pencil button that toggles into a
 * Check (save) + X (cancel) pair. Pure presentation — the parent card owns
 * the `isEditing` and `draft` state.
 */
export function CardEditButtons({
  isEditing,
  onEdit,
  onSave,
  onCancel,
  disabled = false,
  testID,
}: CardEditButtonsProps) {
  if (!isEditing) {
    return (
      <Pressable
        testID={testID ? `${testID}-edit` : undefined}
        onPress={onEdit}
        disabled={disabled}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel="Edit"
        accessibilityState={{ disabled }}
        className="p-1"
      >
        <Pencil size={16} color={colors.muted.foreground} />
      </Pressable>
    );
  }

  return (
    <View className="flex-row items-center gap-2">
      <Pressable
        testID={testID ? `${testID}-save` : undefined}
        onPress={onSave}
        disabled={disabled}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel="Save"
        accessibilityState={{ disabled }}
        className="p-1"
      >
        <Check size={18} color={colors.success.DEFAULT} />
      </Pressable>
      <Pressable
        testID={testID ? `${testID}-cancel` : undefined}
        onPress={onCancel}
        disabled={disabled}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel="Cancel"
        accessibilityState={{ disabled }}
        className="p-1"
      >
        <X size={18} color={colors.destructive.DEFAULT} />
      </Pressable>
    </View>
  );
}
