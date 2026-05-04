import { useEffect, useState } from "react";
import { View, Text, TextInput, Pressable } from "react-native";
import { Package, Trash2, Plus } from "lucide-react-native";
import { Card } from "@/components/ui/Card";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { CardEditButtons } from "@/components/reports/CardEditButtons";
import { getItemMeta } from "@/lib/report-helpers";
import type { GeneratedReportMaterial } from "@/lib/generated-report";
import { blankMaterial } from "@/lib/report-edit-helpers";
import { colors } from "@/lib/design-tokens/colors";

interface MaterialsCardProps {
  materials: readonly GeneratedReportMaterial[];
  editable?: boolean;
  /**
   * Whole-array setter (matches `setMaterials` in report-edit-helpers).
   */
  onChange?: (next: GeneratedReportMaterial[]) => void;
}

function trimOrNull(v: string): string | null {
  return v.trim() === "" ? null : v;
}

function toDraft(
  list: readonly GeneratedReportMaterial[],
): GeneratedReportMaterial[] {
  return list.map((m) => ({ ...m }));
}

export function MaterialsCard({ materials, editable = false, onChange }: MaterialsCardProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState<GeneratedReportMaterial[]>(() =>
    toDraft(materials),
  );

  useEffect(() => {
    if (!isEditing) setDraft(toDraft(materials));
  }, [materials, isEditing]);

  if (materials.length === 0 && !editable) return null;

  const list = materials as GeneratedReportMaterial[];

  const handleEdit = () => {
    setDraft(toDraft(materials));
    setIsEditing(true);
  };

  const handleCancel = () => {
    setDraft(toDraft(materials));
    setIsEditing(false);
  };

  const handleSave = () => {
    const cleaned = draft.map((m) => ({
      ...m,
      name: m.name,
      quantity: typeof m.quantity === "string" ? trimOrNull(m.quantity) : m.quantity,
      quantityUnit:
        typeof m.quantityUnit === "string"
          ? trimOrNull(m.quantityUnit)
          : m.quantityUnit,
      notes: typeof m.notes === "string" ? trimOrNull(m.notes) : m.notes,
    }));
    onChange?.(cleaned);
    setIsEditing(false);
  };

  const updateField = (
    index: number,
    patch: Partial<GeneratedReportMaterial>,
  ) => {
    setDraft((d) => d.map((m, i) => (i === index ? { ...m, ...patch } : m)));
  };

  const addMaterial = () => {
    setDraft((d) => [...d, blankMaterial()]);
  };

  const removeMaterial = (index: number) => {
    setDraft((d) => d.filter((_, i) => i !== index));
  };

  const trailing = editable ? (
    <CardEditButtons
      testID="materials"
      isEditing={isEditing}
      onEdit={handleEdit}
      onSave={handleSave}
      onCancel={handleCancel}
    />
  ) : undefined;

  const displayList = isEditing ? draft : list;

  return (
    <Card variant="default" padding="lg">
      <SectionHeader
        title="Materials"
        subtitle={`${displayList.length} material${displayList.length === 1 ? "" : "s"} recorded.`}
        icon={<Package size={16} color={colors.foreground} />}
        trailing={trailing}
      />

      <View className="mt-4 gap-3">
        {displayList.map((material, index) => {
          if (isEditing) {
            return (
              <View
                key={`material-${index}`}
                className="gap-2 rounded-md bg-surface-muted px-3 py-3"
              >
                <View className="flex-row items-start justify-between gap-2">
                  <TextInput
                    testID={`materials-${index}-name-input`}
                    value={material.name}
                    onChangeText={(next) => updateField(index, { name: next })}
                    placeholder="Name"
                    placeholderTextColor={colors.muted.foreground}
                    className="flex-1 rounded-md border border-border bg-card px-2 py-1 text-base font-medium text-foreground"
                  />
                  <Pressable
                    testID={`materials-${index}-trash`}
                    onPress={() => removeMaterial(index)}
                    accessibilityRole="button"
                    accessibilityLabel="Remove material"
                    hitSlop={8}
                  >
                    <Trash2 size={16} color={colors.muted.foreground} />
                  </Pressable>
                </View>
                <View className="flex-row items-center gap-2">
                  <TextInput
                    testID={`materials-${index}-quantity-input`}
                    value={material.quantity ?? ""}
                    onChangeText={(next) =>
                      updateField(index, { quantity: next })
                    }
                    placeholder="Qty"
                    placeholderTextColor={colors.muted.foreground}
                    className="w-20 rounded-md border border-border bg-card px-2 py-1 text-sm text-foreground"
                  />
                  <TextInput
                    testID={`materials-${index}-unit-input`}
                    value={material.quantityUnit ?? ""}
                    onChangeText={(next) =>
                      updateField(index, { quantityUnit: next })
                    }
                    placeholder="Unit"
                    placeholderTextColor={colors.muted.foreground}
                    className="flex-1 rounded-md border border-border bg-card px-2 py-1 text-sm text-foreground"
                  />
                </View>
                <TextInput
                  testID={`materials-${index}-notes-input`}
                  value={material.notes ?? ""}
                  onChangeText={(next) => updateField(index, { notes: next })}
                  multiline
                  placeholder="Notes"
                  placeholderTextColor={colors.muted.foreground}
                  className="rounded-md border border-border bg-card px-2 py-1 text-sm text-muted-foreground"
                />
              </View>
            );
          }

          const meta = getItemMeta([
            material.quantity,
            material.quantityUnit,
            material.status,
            material.condition,
          ]);
          return (
            <View
              key={`material-${index}`}
              className="gap-1 rounded-md bg-surface-muted px-3 py-3"
            >
              <View className="flex-row items-start justify-between gap-2">
                <View className="flex-1">
                  <Text className="text-base font-medium text-foreground">
                    {material.name}
                  </Text>
                </View>
              </View>

              {meta && (
                <Text className="text-sm text-muted-foreground">{meta}</Text>
              )}
              {material.notes && (
                <Text className="mt-1 text-sm text-muted-foreground">
                  {material.notes}
                </Text>
              )}
            </View>
          );
        })}

        {isEditing && (
          <Pressable
            testID="materials-add"
            onPress={addMaterial}
            accessibilityRole="button"
            accessibilityLabel="Add material"
            className="flex-row items-center gap-2 self-start rounded-md border border-border px-3 py-2"
          >
            <Plus size={14} color={colors.foreground} />
            <Text className="text-sm text-foreground">Add material</Text>
          </Pressable>
        )}
      </View>
    </Card>
  );
}
