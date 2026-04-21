import { View, Text } from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";
import { Users } from "lucide-react-native";
import { Card } from "@/components/ui/Card";
import { SectionHeader } from "@/components/ui/SectionHeader";
import type { GeneratedReportManpower } from "@/lib/generated-report";

interface ManpowerCardProps {
  manpower: GeneratedReportManpower | null;
}

export function ManpowerCard({ manpower }: ManpowerCardProps) {
  if (!manpower) return null;

  const hasRoles = manpower.roles.length > 0;
  const maxCount = Math.max(...manpower.roles.map((r) => r.count ?? 0), 1);

  return (
    <Animated.View entering={FadeInDown.duration(100)}>
      <Card variant="default" padding="lg">
        <SectionHeader
          title="Manpower"
          subtitle={manpower.totalWorkers !== null ? `${manpower.totalWorkers} on site.` : "Crew breakdown recorded."}
          icon={<Users size={16} color="#1a1a2e" />}
        />

        {hasRoles && (
          <View className="mt-4 gap-3">
            {manpower.roles.map((role, index) => {
              const count = role.count ?? 0;
              const pct = Math.round((count / maxCount) * 100);
              return (
                <View key={`${role.role}-${index}`} className="gap-1.5 rounded-md bg-surface-muted px-3 py-3">
                  <View className="flex-row items-center justify-between">
                    <Text className="text-base text-foreground">
                      {role.role}
                    </Text>
                    <Text className="text-base font-medium text-muted-foreground">
                      {count}
                    </Text>
                  </View>
                  <View className="h-2 overflow-hidden rounded-full bg-secondary">
                    <View
                      className="h-2 rounded-full bg-foreground"
                      style={{ width: `${pct}%` }}
                    />
                  </View>
                </View>
              );
            })}
          </View>
        )}

        {manpower.workerHours ? (
          <Text className="mt-4 text-base text-muted-foreground">
            Hours: {manpower.workerHours}
          </Text>
        ) : null}
        {manpower.notes ? (
          <Text className="mt-2 text-base text-muted-foreground">
            {manpower.notes}
          </Text>
        ) : null}
      </Card>
    </Animated.View>
  );
}
