import { View, Text } from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";
import { ClipboardList } from "lucide-react-native";
import { Card } from "@/components/ui/Card";

interface NextStepsCardProps {
  steps: readonly string[];
}

export function NextStepsCard({ steps }: NextStepsCardProps) {
  if (steps.length === 0) return null;

  return (
    <Animated.View entering={FadeInDown.duration(150)}>
      <Card>
        <View className="mb-3 flex-row items-center gap-2">
          <View className="h-8 w-8 items-center justify-center border border-border">
            <ClipboardList size={16} color="#1a1a2e" />
          </View>
          <Text className="text-sm font-semibold uppercase tracking-wider text-foreground">
            Next Steps
          </Text>
        </View>
        <View className="gap-2.5">
          {steps.map((step, index) => (
            <View
              key={`step-${index}`}
              className="flex-row items-start gap-2.5"
            >
              <View className="mt-0.5 h-5 w-5 items-center justify-center border border-foreground">
                <Text className="text-xs font-bold text-foreground">
                  {index + 1}
                </Text>
              </View>
              <Text className="flex-1 text-sm leading-relaxed text-muted-foreground">
                {step}
              </Text>
            </View>
          ))}
        </View>
      </Card>
    </Animated.View>
  );
}
