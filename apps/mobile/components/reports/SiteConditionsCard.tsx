import { View, Text } from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";
import { HardHat } from "lucide-react-native";
import { Card } from "@/components/ui/Card";
import { SectionHeader } from "@/components/ui/SectionHeader";
import type { GeneratedReportSiteCondition } from "@/lib/generated-report";

interface SiteConditionsCardProps {
  conditions: readonly GeneratedReportSiteCondition[];
}

export function SiteConditionsCard({ conditions }: SiteConditionsCardProps) {
  if (conditions.length === 0) {
    return null;
  }

  return (
    <Animated.View entering={FadeInDown.duration(100)}>
      <Card variant="default" padding="lg">
        <SectionHeader
          title="Site Conditions"
          subtitle={conditions.length === 1 ? "1 condition noted." : `${conditions.length} conditions noted.`}
          icon={<HardHat size={16} color="#1a1a2e" />}
        />
        <View className="mt-4 gap-3">
          {conditions.map((condition, index) => (
            <View
              key={`${condition.topic}-${index}`}
              className="rounded-md bg-surface-muted px-4 py-3"
            >
              <Text className="text-sm font-semibold uppercase tracking-wider text-foreground">
                {condition.topic}
              </Text>
              <Text className="mt-2 text-base leading-relaxed text-muted-foreground">
                {condition.details}
              </Text>
            </View>
          ))}
        </View>
      </Card>
    </Animated.View>
  );
}
