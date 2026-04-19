import { View, Text } from "react-native";
import { Cloud, Thermometer, Wind } from "lucide-react-native";
import { Card } from "@/components/ui/Card";
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
    <Card variant="default" className="gap-3">
      <View className="flex-row flex-wrap items-center gap-2">
        {items.map((item) => (
          <View
            key={item.text}
            className="flex-row items-center gap-1.5 rounded-md bg-surface-muted px-3 py-2"
          >
          <item.icon size={14} color="#5c5c6e" />
            <Text className="text-sm font-medium text-foreground">{item.text}</Text>
          </View>
        ))}
      </View>
      {weather.impact ? (
        <Text className="text-sm text-muted-foreground">
          Impact: {weather.impact}
        </Text>
      ) : null}
    </Card>
  );
}
