import { View, Text } from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";
import { Users } from "lucide-react-native";
import { Card } from "@/components/ui/Card";
import type { GeneratedReportManpower } from "@/lib/generated-report";

interface ManpowerCardProps {
  manpower: GeneratedReportManpower | null;
}

export function ManpowerCard({ manpower }: ManpowerCardProps) {
  if (!manpower) return null;

  const hasRoles = manpower.roles.length > 0;
  const maxCount = Math.max(...manpower.roles.map((r) => r.count ?? 0), 1);

  return (
    <Animated.View entering={FadeInDown.duration(150)}>
      <Card>
        <View className="mb-3 flex-row items-center justify-between">
          <View className="flex-row items-center gap-2">
            <View className="h-8 w-8 items-center justify-center border border-border">
              <Users size={16} color="#1a1a2e" />
            </View>
            <Text className="text-sm font-semibold uppercase tracking-wider text-foreground">
              Manpower
            </Text>
          </View>
          {manpower.totalWorkers !== null && (
            <Text className="text-sm font-semibold text-foreground">
              {manpower.totalWorkers} on site
            </Text>
          )}
        </View>

        {hasRoles && (
          <View className="gap-2.5">
            {manpower.roles.map((role, index) => {
              const count = role.count ?? 0;
              const pct = Math.round((count / maxCount) * 100);
              return (
                <View key={`${role.role}-${index}`} className="gap-1">
                  <View className="flex-row items-center justify-between">
                    <Text className="text-sm text-foreground">
                      {role.role}
                    </Text>
                    <Text className="text-sm font-medium text-muted-foreground">
                      {count}
                    </Text>
                  </View>
                  <View className="h-2 bg-secondary">
                    <View
                      className="h-2 bg-foreground"
                      style={{ width: `${pct}%` }}
                    />
                  </View>
                </View>
              );
            })}
          </View>
        )}

        {manpower.workerHours ? (
          <Text className="mt-3 text-sm text-muted-foreground">
            Hours: {manpower.workerHours}
          </Text>
        ) : null}
        {manpower.notes ? (
          <Text className="mt-1 text-sm text-muted-foreground">
            {manpower.notes}
          </Text>
        ) : null}
      </Card>
    </Animated.View>
  );
}
