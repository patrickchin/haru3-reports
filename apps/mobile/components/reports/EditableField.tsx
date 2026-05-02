import { useEffect, useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";
import { Check, Pencil } from "lucide-react-native";
import { colors } from "@/lib/design-tokens/colors";

export interface EditableFieldProps {
  /** Committed value (controlled by the parent). */
  value: string;
  /**
   * Called with the committed string when the user taps Check or blurs the
   * input. Not called on every keystroke — the field keeps a local draft and
   * only commits on confirm/blur. For numeric mode, the committed value is
   * still the raw string the user typed; the parent decides how to parse it.
   */
  onChange: (next: string) => void;
  /** When false (default), renders as plain Text. */
  editable?: boolean;
  placeholder?: string;
  multiline?: boolean;
  /** Sets keyboardType="number-pad" on the input. Value is still a string. */
  numeric?: boolean;
  /** Tailwind class string applied to both the display Text and the TextInput. */
  textClassName?: string;
  /** Shown when value is "" and we are not editing (e.g. "—"). */
  emptyDisplay?: string;
  /**
   * Applied to the outer Pressable. The TextInput receives `${testID}-input`
   * and the save button receives `${testID}-save`.
   */
  testID?: string;
  accessibilityLabel?: string;
}

const DEFAULT_TEXT_CLASS = "text-base text-foreground";

export function EditableField({
  value,
  onChange,
  editable = false,
  placeholder,
  multiline = false,
  numeric = false,
  textClassName,
  emptyDisplay = "",
  testID,
  accessibilityLabel,
}: EditableFieldProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState(value);

  // Keep draft in sync if the parent updates `value` while we are not editing.
  useEffect(() => {
    if (!isEditing) setDraft(value);
  }, [value, isEditing]);

  const textClass = textClassName ?? DEFAULT_TEXT_CLASS;

  if (!editable) {
    return (
      <Text
        className={textClass}
        testID={testID}
        accessibilityLabel={accessibilityLabel}
      >
        {value === "" ? emptyDisplay : value}
      </Text>
    );
  }

  if (!isEditing) {
    const display = value === "" ? emptyDisplay : value;
    return (
      <Pressable
        testID={testID}
        accessibilityLabel={accessibilityLabel}
        accessibilityRole="button"
        accessibilityHint="Double tap to edit"
        onPress={() => {
          setDraft(value);
          setIsEditing(true);
        }}
        onLongPress={() => {
          setDraft(value);
          setIsEditing(true);
        }}
        className="flex-row items-center gap-2"
      >
        <Text className={textClass}>
          {display}
        </Text>
        <Pencil size={12} color={colors.muted.foreground} />
      </Pressable>
    );
  }

  const commit = () => {
    onChange(draft);
    setIsEditing(false);
  };

  return (
    <View className="flex-row items-start gap-2">
      <TextInput
        testID={testID ? `${testID}-input` : undefined}
        accessibilityLabel={accessibilityLabel}
        value={draft}
        onChangeText={setDraft}
        autoFocus
        multiline={multiline}
        blurOnSubmit={!multiline}
        returnKeyType={multiline ? undefined : "done"}
        keyboardType={numeric ? "number-pad" : "default"}
        placeholder={placeholder}
        placeholderTextColor={colors.muted.foreground}
        onBlur={commit}
        onSubmitEditing={multiline ? undefined : commit}
        className={`${textClass} flex-1 rounded-md border border-border bg-card px-2 py-1`}
      />
      <Pressable
        testID={testID ? `${testID}-save` : undefined}
        onPress={commit}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel="Save"
      >
        <Check size={16} color={colors.foreground} />
      </Pressable>
    </View>
  );
}
