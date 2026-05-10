/**
 * Generic array editor — handles add/remove/update for array-based form sections.
 *
 * Minimal props: value, onChange, renderItem. Component owns all editing logic.
 */
import type { ReactNode } from "react";
import { View, Text, TextInput, Pressable, type TextInputProps } from "react-native";
import { Plus, Trash2 } from "lucide-react-native";
import { Button } from "@/shared/components/Button";

type ArrayEditorProps<T> = {
  items: T[];
  onChange: (next: T[]) => void;
  renderItem: (item: T, updateItem: (updated: T) => void) => ReactNode;
  blankItem: () => T;
  addButtonLabel: string;
  addButtonTestID?: string;
};

const INPUT_CLASS = "rounded-md border border-gray-300 bg-white px-3 py-2 text-base text-gray-900";
const LABEL_CLASS = "text-sm font-medium text-gray-600 mb-1";

/** Labeled text input field — reduces boilerplate in renderItem */
export function LabeledInput({
  label,
  ...inputProps
}: { label: string } & TextInputProps) {
  return (
    <View>
      <Text className={LABEL_CLASS}>{label}</Text>
      <TextInput className={INPUT_CLASS} {...inputProps} />
    </View>
  );
}

export function ArrayEditor<T>({
  items,
  onChange,
  renderItem,
  blankItem,
  addButtonLabel,
  addButtonTestID,
}: ArrayEditorProps<T>) {
  const updateItem = (index: number, updated: T) => {
    const next = [...items];
    next[index] = updated;
    onChange(next);
  };

  const removeItem = (index: number) => {
    onChange(items.filter((_, idx) => idx !== index));
  };

  const addItem = () => {
    onChange([...items, blankItem()]);
  };

  return (
    <View>
      {items.map((item, i) => (
        <View
          key={i}
          className="gap-2 rounded-md border border-gray-200 bg-gray-50 p-3 mb-2"
        >
          {renderItem(item, (updated) => updateItem(i, updated))}
          <Pressable
            onPress={() => removeItem(i)}
            className="flex-row items-center gap-2"
          >
            <Trash2 size={16} color="#dc2626" />
            <Text className="text-red-600 text-sm">Remove</Text>
          </Pressable>
        </View>
      ))}
      <Button
        variant="secondary"
        onPress={addItem}
        testID={addButtonTestID}
      >
        <Plus size={16} color="#374151" />
        <Text className="text-gray-700 ml-2">{addButtonLabel}</Text>
      </Button>
    </View>
  );
}
