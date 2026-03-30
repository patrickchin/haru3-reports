import { View, Text } from "react-native";
import Animated, { FadeIn } from "react-native-reanimated";
import type { GeneratedSiteReport } from "@/lib/generated-report";

interface StatBarProps {
  report: GeneratedSiteReport;
}

export function StatBar({ report }: StatBarProps) {
  const workers = report.report.manpower?.totalWorkers ?? 0;
  const activities = report.report.activities.length;
  const issues = report.report.issues.length;

  const stats = [
    {
      value: workers,
      label: "Workers",
    },
    {
      value: activities,
      label: activities === 1 ? "Activity" : "Activities",
    },
    {
      value: issues,
      label: issues === 1 ? "Issue" : "Issues",
    },
  ];

  return (
    <Animated.View entering={FadeIn.duration(200)} className="flex-row">
      {stats.map((stat, i) => (
        <View
          key={stat.label}
          className={`flex-1 items-center border border-border bg-card py-3 ${i > 0 ? "-ml-px" : ""}`}
        >
          <Text className="text-3xl font-bold text-foreground">
            {stat.value}
          </Text>
          <Text className="mt-0.5 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            {stat.label}
          </Text>
        </View>
      ))}
    </Animated.View>
  );
}
