import { useEffect, useState } from "react";
import { View, Text, TextInput, Pressable } from "react-native";
import { ClipboardList, Trash2, Plus } from "lucide-react-native";
import { Card } from "@/components/ui/Card";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { CardEditButtons } from "@/components/reports/CardEditButtons";
import { colors } from "@/lib/design-tokens/colors";

interface NextStepsCardProps {
  steps: readonly string[];
  editable?: boolean;
  /** Whole-array setter — parent feeds it through `setNextSteps(report, next)`. */
  onChange?: (next: string[]) => void;
}

function toDraft(steps: readonly string[]): string[] {
  return [...steps];
}

export function NextStepsCard({ steps, editable = false, onChange }: NextStepsCardProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState<string[]>(() => toDraft(steps));

  useEffect(() => {
    if (!isEditing) setDraft(toDraft(steps));
  }, [steps, isEditing]);

  if (steps.length === 0 && !editable) return null;

  const handleEdit = () => {
    setDraft(toDraft(steps));
    setIsEditing(true);
  };

  const handleCancel = () => {
    setDraft(toDraft(steps));
    setIsEditing(false);
  };

  const handleSave = () => {
    onChange?.([...draft]);
    setIsEditing(false);
  };

  const updateStep = (index: number, value: string) => {
    setDraft((d) => d.map((s, i) => (i === index ? value : s)));
  };

  const addStep = () => {
    setDraft((d) => [...d, ""]);
  };

  const removeStep = (index: number) => {
    setDraft((d) => d.filter((_, i) => i !== index));
  };

  const subtitle =
    steps.length === 0
      ? "No follow-up actions yet."
      : steps.length === 1
        ? "1 follow-up action."
        : `${steps.length} follow-up actions.`;

  const trailing = editable ? (
    <CardEditButtons
      testID="next-steps"
      isEditing={isEditing}
      onEdit={handleEdit}
      onSave={handleSave}
      onCancel={handleCancel}
    />
  ) : undefined;

  const list = isEditing ? draft : (steps as string[]);

  return (
    <Card variant="default" padding="lg">
      <SectionHeader
        title="Next Steps"
        subtitle={subtitle}
        icon={<ClipboardList size={16} color={colors.foreground} />}
        trailing={trailing}
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
              {isEditing ? (
                <TextInput
                  testID={`next-step-${index}-input`}
                  value={step}
                  onChangeText={(next) => updateStep(index, next)}
                  multiline
                  placeholder="Step"
                  placeholderTextColor={colors.muted.foreground}
                  className="rounded-md border border-border bg-card px-2 py-1 text-base text-foreground"
                />
              ) : (
                <Text
                  className="text-base leading-relaxed text-muted-foreground"
                  testID={editable ? `next-step-${index}` : undefined}
                >
                  {step}
                </Text>
              )}
            </View>
            {isEditing && (
              <Pressable
                testID={`next-step-${index}-trash`}
                onPress={() => removeStep(index)}
                accessibilityRole="button"
                accessibilityLabel="Remove step"
                hitSlop={8}
              >
                <Trash2 size={16} color={colors.muted.foreground} />
              </Pressable>
            )}
          </View>
        ))}

        {isEditing && (
          <Pressable
            testID="next-step-add"
            onPress={addStep}
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
