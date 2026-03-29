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
    <View className="flex-row flex-wrap items-center gap-x-4 gap-y-1 rounded-lg bg-sky-50 px-3 py-2.5">
      {items.map((item) => (
        <View key={item.text} className="flex-row items-center gap-1.5">
          <item.icon size={14} color="#0284c7" />
          <Text className="text-sm text-sky-700">{item.text}</Text>
        </View>
      ))}
      {weather.impact ? (
        <Text className="w-full text-xs text-sky-600">
          Impact: {weather.impact}
        </Text>
      ) : null}
    </View>
  );
}
