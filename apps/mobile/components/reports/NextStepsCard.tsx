import { View, Text, Pressable } from "react-native";
import { ClipboardList, Trash2, Plus } from "lucide-react-native";
import { Card } from "@/components/ui/Card";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { colors } from "@/lib/design-tokens/colors";

interface NextStepsCardProps {
  steps: readonly string[];
  editable?: boolean;
  /** Whole-array setter — parent feeds it through `setNextSteps(report, next)`. */
  onChange?: (next: string[]) => void;
}

export function NextStepsCard({ steps, editable = false, onChange }: NextStepsCardProps) {
  if (steps.length === 0 && !editable) return null;

  const list = steps as string[];

  const handleRemove = (index: number) => {
    onChange?.(list.filter((_, i) => i !== index));
  };

  const handleAdd = () => {
    onChange?.([...list, ""]);
  };

  const subtitle =
    steps.length === 0
      ? "No follow-up actions yet."
      : steps.length === 1
        ? "1 follow-up action."
        : `${steps.length} follow-up actions.`;

  return (
    <Card variant="default" padding="lg">
      <SectionHeader
        title="Next Steps"
        subtitle={subtitle}
        icon={<ClipboardList size={16} color={colors.foreground} />}
      />
      <View className="mt-4 gap-3">
        {list.map((step, index) => (
          <View
            key={`step-${index}`}
            className="flex-row items-start gap-3"
          >
            <Text className="min-w-[18px] text-base font-semibold text-foreground">
              {index + 1}.
            </Text>
            <View className="flex-1">
              <Text
                className="text-base leading-relaxed text-muted-foreground"
                testID={editable ? `next-step-${index}` : undefined}
              >
                {step || (editable ? "Add step" : step)}
              </Text>
            </View>
            {editable && (
              <Pressable
                testID={`next-step-${index}-trash`}
                onPress={() => handleRemove(index)}
                accessibilityRole="button"
                accessibilityLabel="Remove step"
                hitSlop={8}
              >
                <Trash2 size={16} color={colors.muted.foreground} />
              </Pressable>
            )}
          </View>
        ))}

        {editable && (
          <Pressable
            testID="next-step-add"
            onPress={handleAdd}
            accessibilityRole="button"
            accessibilityLabel="Add step"
            className="flex-row items-center gap-2 self-start rounded-md border border-border px-3 py-2"
          >
            <Plus size={14} color={colors.foreground} />
            <Text className="text-sm text-foreground">Add step</Text>
          </Pressable>
        )}
      </View>
    </Card>
  );
}
