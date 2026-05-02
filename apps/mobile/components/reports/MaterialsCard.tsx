import { View, Text, Pressable } from "react-native";
import { Package, Trash2, Plus } from "lucide-react-native";
import { Card } from "@/components/ui/Card";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { EditableField } from "@/components/reports/EditableField";
import { getItemMeta } from "@/lib/report-helpers";
import type { GeneratedReportMaterial } from "@/lib/generated-report";
import { blankMaterial } from "@/lib/report-edit-helpers";
import { colors } from "@/lib/design-tokens/colors";

interface MaterialsCardProps {
  materials: readonly GeneratedReportMaterial[];
  editable?: boolean;
  /**
   * Whole-array setter (matches `setMaterials` in report-edit-helpers).
   * Not a slice patch.
   */
  onChange?: (next: GeneratedReportMaterial[]) => void;
}

export function MaterialsCard({ materials, editable = false, onChange }: MaterialsCardProps) {
  if (materials.length === 0 && !editable) return null;

  const list = materials as GeneratedReportMaterial[];

  const update = (index: number, patch: Partial<GeneratedReportMaterial>) => {
    onChange?.(list.map((m, i) => (i === index ? { ...m, ...patch } : m)));
  };

  const remove = (index: number) => {
    onChange?.(list.filter((_, i) => i !== index));
  };

  const add = () => {
    onChange?.([...list, blankMaterial()]);
  };

  const nullify = (s: string) => (s.trim() === "" ? null : s);

  return (
    <Card variant="default" padding="lg">
      <SectionHeader
        title="Materials"
        subtitle={`${list.length} material${list.length === 1 ? "" : "s"} recorded.`}
        icon={<Package size={16} color={colors.foreground} />}
      />

      <View className="mt-4 gap-3">
        {list.map((material, index) => {
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
                  {editable ? (
                    <EditableField
                      value={material.name}
                      onChange={(next) => update(index, { name: next })}
                      editable
                      placeholder="Name"
                      emptyDisplay="—"
                      textClassName="text-base font-medium text-foreground"
                      testID={`materials-${index}-name`}
                    />
                  ) : (
                    <Text className="text-base font-medium text-foreground">
                      {material.name}
                    </Text>
                  )}
                </View>
                {editable && (
                  <Pressable
                    testID={`materials-${index}-trash`}
                    onPress={() => remove(index)}
                    accessibilityRole="button"
                    accessibilityLabel="Remove material"
                    hitSlop={8}
                  >
                    <Trash2 size={16} color={colors.muted.foreground} />
                  </Pressable>
                )}
              </View>

              {editable ? (
                <View className="mt-1 gap-1">
                  <View className="flex-row flex-wrap items-center gap-2">
                    <Text className="text-sm text-muted-foreground">Qty:</Text>
                    <EditableField
                      value={material.quantity ?? ""}
                      onChange={(next) => update(index, { quantity: nullify(next) })}
                      editable
                      placeholder="Quantity"
                      emptyDisplay="—"
                      textClassName="text-sm text-muted-foreground"
                      testID={`materials-${index}-quantity`}
                    />
                    <Text className="text-sm text-muted-foreground">Unit:</Text>
                    <EditableField
                      value={material.quantityUnit ?? ""}
                      onChange={(next) => update(index, { quantityUnit: nullify(next) })}
                      editable
                      placeholder="Unit"
                      emptyDisplay="—"
                      textClassName="text-sm text-muted-foreground"
                      testID={`materials-${index}-unit`}
                    />
                  </View>
                  <View className="flex-row flex-wrap items-center gap-2">
                    <Text className="text-sm text-muted-foreground">Status:</Text>
                    <EditableField
                      value={material.status ?? ""}
                      onChange={(next) => update(index, { status: nullify(next) })}
                      editable
                      placeholder="Status"
                      emptyDisplay="—"
                      textClassName="text-sm text-muted-foreground"
                      testID={`materials-${index}-status`}
                    />
                    <Text className="text-sm text-muted-foreground">Condition:</Text>
                    <EditableField
                      value={material.condition ?? ""}
                      onChange={(next) => update(index, { condition: nullify(next) })}
                      editable
                      placeholder="Condition"
                      emptyDisplay="—"
                      textClassName="text-sm text-muted-foreground"
                      testID={`materials-${index}-condition`}
                    />
                  </View>
                  <EditableField
                    value={material.notes ?? ""}
                    onChange={(next) => update(index, { notes: nullify(next) })}
                    editable
                    multiline
                    placeholder="Notes"
                    emptyDisplay="Add notes"
                    textClassName="text-sm text-muted-foreground"
                    testID={`materials-${index}-notes`}
                  />
                </View>
              ) : (
                <>
                  {meta && (
                    <Text className="text-sm text-muted-foreground">{meta}</Text>
                  )}
                  {material.notes && (
                    <Text className="mt-1 text-sm text-muted-foreground">
                      {material.notes}
                    </Text>
                  )}
                </>
              )}
            </View>
          );
        })}

        {editable && (
          <Pressable
            testID="materials-add"
            onPress={add}
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
