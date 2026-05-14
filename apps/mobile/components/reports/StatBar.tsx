import { View, Text } from "react-native";
import Animated, { FadeIn } from "react-native-reanimated";
import type { GeneratedSiteReport } from "@/lib/generated-report";
import { StatTile } from "@/components/ui/StatTile";
import { getReportStats } from "@/lib/mobile-ui";

interface StatBarProps {
  report: GeneratedSiteReport;
}

export function StatBar({ report }: StatBarProps) {
  const stats = getReportStats(report);

  return (
    <Animated.View entering={FadeIn.duration(250)} className="flex-row gap-3">
      {stats.map((stat, i) => (
        <StatTile
          key={stat.label}
          value={stat.value}
          label={stat.label}
          tone={stat.tone === "warning" && i === 2 ? "warning" : "default"}
          compact
        />
      ))}
    </Animated.View>
  );
}
