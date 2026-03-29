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
          <View className="h-8 w-8 items-center justify-center rounded-md bg-primary/10">
            <HardHat size={16} color="#f47316" />
          </View>
          <Text className="text-base font-semibold text-foreground">
            Site Conditions
          </Text>
        </View>
        <View className="gap-3">
          {conditions.map((condition, index) => (
            <View key={`${condition.topic}-${index}`}>
              <Text className="text-sm font-semibold uppercase tracking-wide text-foreground">
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
