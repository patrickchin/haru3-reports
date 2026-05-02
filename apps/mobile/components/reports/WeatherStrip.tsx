import { View, Text, Pressable } from "react-native";
import { Cloud, Thermometer, Wind, X } from "lucide-react-native";
import { Card } from "@/components/ui/Card";
import { EditableField } from "@/components/reports/EditableField";
import type {
  GeneratedSiteReport,
  GeneratedReportWeather,
} from "@/lib/generated-report";
import { colors } from "@/lib/design-tokens/colors";

interface WeatherStripProps {
  report: GeneratedSiteReport;
  editable?: boolean;
  /**
   * Slice patch — parent feeds it through `updateWeather(report, patch)`.
   * `null` clears the slice entirely.
   */
  onChange?: (patch: Partial<GeneratedReportWeather> | null) => void;
}

export function WeatherStrip({ report, editable = false, onChange }: WeatherStripProps) {
  const weather = report.report.weather;

  if (!editable) {
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
      <Card variant="default" padding="md" className="gap-3">
        {items[0] ? (() => {
          const CondIcon = items[0].icon;
          return (
            <View className="flex-row items-start gap-1.5">
              <CondIcon size={14} color={colors.muted.foreground} style={{ marginTop: 2 }} />
              <Text className="flex-1 text-sm font-medium text-foreground">
                {items[0].text}
              </Text>
            </View>
          );
        })() : null}
        {items.length > 1 ? (
          <View className="flex-row flex-wrap items-center gap-2">
            {items.slice(1).map((item) => {
              const Icon = item.icon;
              return (
                <View
                  key={item.text}
                  className="flex-row items-center gap-1.5 rounded-md bg-surface-muted px-3 py-2"
                >
                  <Icon size={14} color={colors.muted.foreground} />
                  <Text className="text-sm font-medium text-foreground">{item.text}</Text>
                </View>
              );
            })}
          </View>
        ) : null}
        {weather.impact ? (
          <Text className="text-sm text-muted-foreground">
            Impact: {weather.impact}
          </Text>
        ) : null}
      </Card>
    );
  }

  // Editable mode: always render so the user can populate from scratch.
  const safe: GeneratedReportWeather = weather ?? {
    conditions: null,
    temperature: null,
    wind: null,
    impact: null,
  };

  const patch = (p: Partial<GeneratedReportWeather>) => onChange?.(p);
  const trimOrNull = (v: string) => (v.trim() === "" ? null : v);

  return (
    <Card variant="default" padding="md" className="gap-3">
      <View className="flex-row items-center gap-2">
        <Thermometer size={14} color={colors.muted.foreground} />
        <Text className="text-sm text-muted-foreground">Temp:</Text>
        <EditableField
          value={safe.temperature ?? ""}
          onChange={(next) => patch({ temperature: trimOrNull(next) })}
          editable
          numeric
          emptyDisplay="—"
          placeholder="Temperature"
          textClassName="text-sm font-medium text-foreground"
          testID="weather-temperature"
        />
      </View>
      <View className="flex-row items-center gap-2">
        <Cloud size={14} color={colors.muted.foreground} />
        <Text className="text-sm text-muted-foreground">Conditions:</Text>
        <EditableField
          value={safe.conditions ?? ""}
          onChange={(next) => patch({ conditions: trimOrNull(next) })}
          editable
          emptyDisplay="—"
          placeholder="Conditions"
          textClassName="text-sm font-medium text-foreground"
          testID="weather-conditions"
        />
      </View>
      <View className="flex-row items-center gap-2">
        <Wind size={14} color={colors.muted.foreground} />
        <Text className="text-sm text-muted-foreground">Wind:</Text>
        <EditableField
          value={safe.wind ?? ""}
          onChange={(next) => patch({ wind: trimOrNull(next) })}
          editable
          emptyDisplay="—"
          placeholder="Wind"
          textClassName="text-sm font-medium text-foreground"
          testID="weather-wind"
        />
      </View>
      <EditableField
        value={safe.impact ?? ""}
        onChange={(next) => patch({ impact: trimOrNull(next) })}
        editable
        multiline
        emptyDisplay="Add impact notes"
        placeholder="Impact notes"
        textClassName="text-sm text-muted-foreground"
        testID="weather-impact"
      />
      <Pressable
        testID="weather-clear"
        onPress={() => onChange?.(null)}
        accessibilityRole="button"
        accessibilityLabel="Clear weather"
        className="flex-row items-center gap-2 self-start rounded-md border border-border px-3 py-2"
      >
        <X size={14} color={colors.foreground} />
        <Text className="text-sm text-foreground">Clear weather</Text>
      </Pressable>
    </Card>
  );
}
