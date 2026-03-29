import { View, Text } from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";
import { HardHat } from "lucide-react-native";
import { Card } from "@/components/ui/Card";
import type { GeneratedReportSiteCondition } from "@/lib/generated-report";

interface SiteConditionsCardProps {
  conditions: readonly GeneratedReportSiteCondition[];
}

export function SiteConditionsCard({ conditions }: SiteConditionsCardProps) {
  if (conditions.length === 0) {
    return null;
  }

  return (
    <Animated.View entering={FadeInDown.duration(150)}>
      <Card>
        <View className="mb-3 flex-row items-center gap-2">
          <View className="h-8 w-8 items-center justify-center border border-border">
            <HardHat size={16} color="#1a1a2e" />
          </View>
          <Text className="text-sm font-semibold uppercase tracking-wider text-foreground">
            Site Conditions
          </Text>
        </View>
        <View className="gap-3">
          {conditions.map((condition, index) => (
            <View key={`${condition.topic}-${index}`} className={index > 0 ? "border-t border-border pt-3" : ""}>
              <Text className="text-xs font-semibold uppercase tracking-wider text-foreground">
                {condition.topic}
              </Text>
              <Text className="mt-1 text-base leading-relaxed text-muted-foreground">
                {condition.details}
              </Text>
            </View>
          ))}
        </View>
      </Card>
    </Animated.View>
  );
}
