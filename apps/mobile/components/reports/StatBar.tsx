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
      color: "bg-indigo-50",
      textColor: "text-indigo-700",
    },
    {
      value: activities,
      label: activities === 1 ? "Activity" : "Activities",
      color: "bg-emerald-50",
      textColor: "text-emerald-700",
    },
    {
      value: issues,
      label: issues === 1 ? "Issue" : "Issues",
      color: issues > 0 ? "bg-amber-50" : "bg-gray-50",
      textColor: issues > 0 ? "text-amber-700" : "text-gray-500",
    },
  ];

  return (
    <Animated.View entering={FadeIn.duration(200)} className="flex-row gap-2">
      {stats.map((stat) => (
        <View
          key={stat.label}
          className={`flex-1 items-center rounded-xl ${stat.color} py-3`}
        >
          <Text className={`text-2xl font-bold ${stat.textColor}`}>
            {stat.value}
          </Text>
          <Text className="mt-0.5 text-xs font-medium text-muted-foreground">
            {stat.label}
          </Text>
        </View>
      ))}
    </Animated.View>
  );
}
