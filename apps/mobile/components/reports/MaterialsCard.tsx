import { View, Text } from "react-native";
import { Package } from "lucide-react-native";
import { Card } from "@/components/ui/Card";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { getItemMeta } from "@/lib/report-helpers";
import type { GeneratedReportMaterial } from "@/lib/generated-report";
import { colors } from "@/lib/design-tokens/colors";

interface MaterialsCardProps {
  materials: readonly GeneratedReportMaterial[];
}

export function MaterialsCard({ materials }: MaterialsCardProps) {
  if (materials.length === 0) return null;

  return (
    <Card variant="default" padding="lg">
        <SectionHeader
          title="Materials"
          subtitle={`${materials.length} material${materials.length === 1 ? "" : "s"} recorded.`}
          icon={<Package size={16} color={colors.foreground} />}
        />

        <View className="mt-4 gap-3">
          {materials.map((material, index) => {
            const meta = getItemMeta([material.quantity, material.quantityUnit, material.status, material.condition]);
            return (
              <View key={`${material.name}-${index}`} className="gap-1 rounded-md bg-surface-muted px-3 py-3">
                <Text className="text-base font-medium text-foreground">
                  {material.name}
                </Text>
                {meta && (
                  <Text className="text-sm text-muted-foreground">
                    {meta}
                  </Text>
                )}
                {material.notes && (
                  <Text className="mt-1 text-sm text-muted-foreground">
                    {material.notes}
                  </Text>
                )}
              </View>
            );
          })}
        </View>
      </Card>
  );
}
