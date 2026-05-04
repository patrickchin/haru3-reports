import { useEffect, useState } from "react";
import { View, Text, TextInput, Pressable } from "react-native";
import { Cloud, Thermometer, Wind, X } from "lucide-react-native";
import { Card } from "@/components/ui/Card";
import { CardEditButtons } from "@/components/reports/CardEditButtons";
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

interface WeatherDraft {
  conditions: string;
  temperature: string;
  wind: string;
  impact: string;
}

const EMPTY_DRAFT: WeatherDraft = {
  conditions: "",
  temperature: "",
  wind: "",
  impact: "",
};

function toDraft(w: GeneratedReportWeather | null | undefined): WeatherDraft {
  if (!w) return EMPTY_DRAFT;
  return {
    conditions: w.conditions ?? "",
    temperature: w.temperature ?? "",
    wind: w.wind ?? "",
    impact: w.impact ?? "",
  };
}

function trimOrNull(v: string): string | null {
  return v.trim() === "" ? null : v;
}

export function WeatherStrip({ report, editable = false, onChange }: WeatherStripProps) {
  const weather = report.report.weather;
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState<WeatherDraft>(() => toDraft(weather));

  // Keep draft synced to upstream when not editing.
  useEffect(() => {
    if (!isEditing) setDraft(toDraft(weather));
  }, [weather, isEditing]);

  const renderReadOnly = () => {
    if (!weather) return null;
    const items = [
      weather.conditions ? { icon: Cloud, text: weather.conditions } : null,
      weather.temperature
        ? { icon: Thermometer, text: weather.temperature }
        : null,
      weather.wind ? { icon: Wind, text: weather.wind } : null,
    ].filter(Boolean) as Array<{ icon: typeof Cloud; text: string }>;

    if (items.length === 0 && !weather.impact) return null;

    return (
      <>
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
      </>
    );
  };

  if (!editable) {
    const body = renderReadOnly();
    if (!body) return null;
    return (
      <Card variant="default" padding="md" className="gap-3">
        {body}
      </Card>
    );
  }

  // Editable mode: show header with CardEditButtons.
  const handleEdit = () => {
    setDraft(toDraft(weather));
    setIsEditing(true);
  };

  const handleCancel = () => {
    setDraft(toDraft(weather));
    setIsEditing(false);
  };

  const handleSave = () => {
    const patch: Partial<GeneratedReportWeather> = {
      conditions: trimOrNull(draft.conditions),
      temperature: trimOrNull(draft.temperature),
      wind: trimOrNull(draft.wind),
      impact: trimOrNull(draft.impact),
    };
    onChange?.(patch);
    setIsEditing(false);
  };

  return (
    <Card variant="default" padding="md" className="gap-3">
      <View className="flex-row items-center justify-between">
        <Text className="text-sm font-semibold text-foreground">Weather</Text>
        <CardEditButtons
          testID="weather"
          isEditing={isEditing}
          onEdit={handleEdit}
          onSave={handleSave}
          onCancel={handleCancel}
        />
      </View>

      {isEditing ? (
        <>
          <View className="flex-row items-center gap-2">
            <Thermometer size={14} color={colors.muted.foreground} />
            <Text className="text-sm text-muted-foreground">Temp:</Text>
            <TextInput
              testID="weather-temperature-input"
              value={draft.temperature}
              onChangeText={(next) =>
                setDraft((d) => ({ ...d, temperature: next }))
              }
              keyboardType="number-pad"
              placeholder="Temperature"
              placeholderTextColor={colors.muted.foreground}
              className="flex-1 rounded-md border border-border bg-card px-2 py-1 text-sm font-medium text-foreground"
            />
          </View>
          <View className="flex-row items-center gap-2">
            <Cloud size={14} color={colors.muted.foreground} />
            <Text className="text-sm text-muted-foreground">Conditions:</Text>
            <TextInput
              testID="weather-conditions-input"
              value={draft.conditions}
              onChangeText={(next) =>
                setDraft((d) => ({ ...d, conditions: next }))
              }
              placeholder="Conditions"
              placeholderTextColor={colors.muted.foreground}
              className="flex-1 rounded-md border border-border bg-card px-2 py-1 text-sm font-medium text-foreground"
            />
          </View>
          <View className="flex-row items-center gap-2">
            <Wind size={14} color={colors.muted.foreground} />
            <Text className="text-sm text-muted-foreground">Wind:</Text>
            <TextInput
              testID="weather-wind-input"
              value={draft.wind}
              onChangeText={(next) => setDraft((d) => ({ ...d, wind: next }))}
              placeholder="Wind"
              placeholderTextColor={colors.muted.foreground}
              className="flex-1 rounded-md border border-border bg-card px-2 py-1 text-sm font-medium text-foreground"
            />
          </View>
          <TextInput
            testID="weather-impact-input"
            value={draft.impact}
            onChangeText={(next) => setDraft((d) => ({ ...d, impact: next }))}
            multiline
            placeholder="Impact notes"
            placeholderTextColor={colors.muted.foreground}
            className="rounded-md border border-border bg-card px-2 py-1 text-sm text-muted-foreground"
          />
          <Pressable
            testID="weather-clear"
            onPress={() => {
              onChange?.(null);
              setDraft(EMPTY_DRAFT);
              setIsEditing(false);
            }}
            accessibilityRole="button"
            accessibilityLabel="Clear weather"
            className="flex-row items-center gap-2 self-start rounded-md border border-border px-3 py-2"
          >
            <X size={14} color={colors.foreground} />
            <Text className="text-sm text-foreground">Clear weather</Text>
          </Pressable>
        </>
      ) : (
        renderReadOnly() ?? (
          <Text className="text-sm text-muted-foreground">No weather recorded</Text>
        )
      )}
    </Card>
  );
}
