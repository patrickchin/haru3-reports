import { useState } from "react";
import {
  View,
  Text,
  ScrollView,
  Pressable,
  ActivityIndicator,
} from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import Animated, { FadeInDown } from "react-native-reanimated";
import { Zap, ChevronDown, ChevronUp, BarChart3 } from "lucide-react-native";
import { Card } from "@/components/ui/Card";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { StatTile } from "@/components/ui/StatTile";
import { InlineNotice } from "@/components/ui/InlineNotice";
import { UsageBarChart, type BarDatum } from "@/components/ui/UsageBarChart";
import {
  useTokenUsageHistory,
  useTokenUsageEvents,
  type MonthlyUsageRow,
} from "@/hooks/useTokenUsageHistory";

function formatTokenCount(count: number) {
  if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1)}M`;
  if (count >= 1_000) return `${(count / 1_000).toFixed(1)}K`;
  return String(count);
}

function formatMonth(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

function formatMonthShort(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", { month: "short" });
}

function formatDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function MonthCard({
  row,
  isExpanded,
  onToggle,
}: {
  row: MonthlyUsageRow;
  isExpanded: boolean;
  onToggle: () => void;
}) {
  const totalTokens = row.input_tokens + row.output_tokens;
  const Chevron = isExpanded ? ChevronUp : ChevronDown;

  return (
    <Card className="gap-3">
      <Pressable
        onPress={onToggle}
        className="flex-row items-center justify-between"
        accessibilityRole="button"
        accessibilityLabel={`${formatMonth(row.month)}, ${isExpanded ? "collapse" : "expand"}`}
      >
        <View className="flex-1">
          <Text className="text-title-sm text-foreground">
            {formatMonth(row.month)}
          </Text>
          <Text className="mt-0.5 text-sm text-muted-foreground">
            {row.generation_count} report{row.generation_count !== 1 ? "s" : ""} · {formatTokenCount(totalTokens)} tokens
          </Text>
        </View>
        <Chevron size={18} color="#5c5c6e" />
      </Pressable>

      {isExpanded && (
        <Animated.View entering={FadeInDown.duration(100)}>
          <View className="flex-row flex-wrap gap-3">
            <StatTile
              value={row.generation_count}
              label="Reports"
              compact
              className="min-w-[46%]"
            />
            <StatTile
              value={formatTokenCount(row.input_tokens)}
              label="Input"
              compact
              className="min-w-[46%]"
            />
            <StatTile
              value={formatTokenCount(row.output_tokens)}
              label="Output"
              compact
              className="min-w-[46%]"
            />
            <StatTile
              value={formatTokenCount(row.cached_tokens)}
              label="Cached"
              compact
              className="min-w-[46%]"
            />
          </View>

          <EventList monthIso={row.month} />
        </Animated.View>
      )}
    </Card>
  );
}

function EventList({ monthIso }: { monthIso: string }) {
  const { data: events, isLoading } = useTokenUsageEvents(monthIso);

  if (isLoading) {
    return (
      <View className="mt-3 items-center py-3">
        <ActivityIndicator size="small" color="#1a1a2e" />
      </View>
    );
  }

  if (!events?.length) {
    return (
      <Text className="mt-3 text-sm text-muted-foreground">
        No individual events recorded.
      </Text>
    );
  }

  return (
    <View className="mt-3 gap-2">
      <Text className="text-label text-muted-foreground">Generations</Text>
      {events.map((ev) => {
        const total = ev.input_tokens + ev.output_tokens;
        return (
          <View
            key={ev.id}
            className="flex-row items-center justify-between rounded-md border border-border bg-card px-3 py-2.5"
          >
            <View className="flex-1 gap-0.5">
              <Text className="text-sm text-foreground">
                {formatDate(ev.created_at)}
              </Text>
              <Text className="text-xs text-muted-foreground">
                {ev.provider} / {ev.model}
              </Text>
            </View>
            <Text className="text-sm font-medium text-foreground">
              {formatTokenCount(total)}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

export default function UsageScreen() {
  const router = useRouter();
  const { data: history, isLoading } = useTokenUsageHistory();
  const [expandedMonth, setExpandedMonth] = useState<string | null>(null);

  const handleToggle = (month: string) => {
    setExpandedMonth((prev) => (prev === month ? null : month));
  };

  // Compute all-time totals
  const totals = (history ?? []).reduce(
    (acc, row) => ({
      input: acc.input + row.input_tokens,
      output: acc.output + row.output_tokens,
      cached: acc.cached + row.cached_tokens,
      reports: acc.reports + row.generation_count,
    }),
    { input: 0, output: 0, cached: 0, reports: 0 },
  );

  // Build chart data from history (newest first → reverse for chronological)
  const tokenChartData: BarDatum[] = (history ?? []).map((row) => ({
    label: formatMonthShort(row.month),
    value: row.input_tokens + row.output_tokens,
  }));

  return (
    <SafeAreaView className="flex-1 bg-background" edges={["top"]}>
      <View className="flex-1">
        <View className="px-5 py-4">
          <ScreenHeader
            title="Usage History"
            onBack={() => router.back()}
            backLabel="Profile"
          />
        </View>

        {isLoading ? (
          <View className="flex-1 items-center justify-center">
            <ActivityIndicator size="large" color="#1a1a2e" />
          </View>
        ) : !history?.length ? (
          <View className="flex-1 items-center justify-center px-5">
            <InlineNotice tone="info">
              No usage data yet. Generate your first report to see stats here.
            </InlineNotice>
          </View>
        ) : (
          <Animated.View entering={FadeInDown.duration(100)} className="flex-1">
            <ScrollView
              className="flex-1"
              contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 40, gap: 16 }}
            >
              {/* All-time summary */}
              <SectionHeader
                title="All-Time Summary"
                icon={<Zap size={18} color="#1a1a2e" />}
              />
              <View className="flex-row flex-wrap gap-3">
                <StatTile
                  value={totals.reports}
                  label="Reports"
                  compact
                  className="min-w-[46%]"
                />
                <StatTile
                  value={formatTokenCount(totals.input)}
                  label="Input"
                  compact
                  className="min-w-[46%]"
                />
                <StatTile
                  value={formatTokenCount(totals.output)}
                  label="Output"
                  compact
                  className="min-w-[46%]"
                />
                <StatTile
                  value={formatTokenCount(totals.cached)}
                  label="Cached"
                  compact
                  className="min-w-[46%]"
                />
              </View>

              {/* Timeline charts */}
              {tokenChartData.length > 1 && (
                <>
                  <SectionHeader
                    title="Token Usage Over Time"
                    icon={<BarChart3 size={18} color="#1a1a2e" />}
                  />
                  <Card className="items-center py-5">
                    <UsageBarChart data={tokenChartData} unit="tokens / month" />
                  </Card>
                </>
              )}

              {/* Monthly breakdown */}
              <SectionHeader
                title="Monthly Breakdown"
                subtitle="Tap a month to see individual generations"
              />
              {history.map((row, i) => (
                <Animated.View
                  key={row.month}
                  entering={FadeInDown.delay(i * 25).duration(80)}
                >
                  <MonthCard
                    row={row}
                    isExpanded={expandedMonth === row.month}
                    onToggle={() => handleToggle(row.month)}
                  />
                </Animated.View>
              ))}
            </ScrollView>
          </Animated.View>
        )}
      </View>
    </SafeAreaView>
  );
}
