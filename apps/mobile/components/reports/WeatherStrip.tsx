import { View, Text } from "react-native";
import { Cloud, Thermometer, Wind } from "lucide-react-native";
import type { GeneratedSiteReport } from "@/lib/generated-report";

interface WeatherStripProps {
  report: GeneratedSiteReport;
}

export function WeatherStrip({ report }: WeatherStripProps) {
  const weather = report.report.weather;
  if (!weather) return null;

  const items = [
    weather.conditions ? { icon: Cloud, text: weather.conditions } : null,
    weather.temperature
      ? { icon: Thermometer, text: weather.temperature }
      : null,
    weather.wind ? { icon: Wind, text: weather.wind } : null,
  ].filter(Boolean) as Array<{ icon: typeof Cloud; text: string }>;

  if (items.length === 0) return null;

  return (
    <View className="flex-row flex-wrap items-center gap-x-4 gap-y-1 border border-border bg-card px-3 py-3">
      {items.map((item) => (
        <View key={item.text} className="flex-row items-center gap-1.5">
          <item.icon size={14} color="#5c5c6e" />
          <Text className="text-base text-foreground">{item.text}</Text>
        </View>
      ))}
      {weather.impact ? (
        <Text className="w-full text-sm text-muted-foreground">
          Impact: {weather.impact}
        </Text>
      ) : null}
    </View>
  );
}
