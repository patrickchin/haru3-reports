import { useState } from "react";
import { colors } from "@/lib/design-tokens/colors";
import {
  View,
  Text,
  ScrollView,
  Pressable,
  ActivityIndicator,
  RefreshControl,
} from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Zap, ChevronDown, ChevronUp, BarChart3, DollarSign, Cpu } from "lucide-react-native";
import { Card } from "@/components/ui/Card";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { StatTile } from "@/components/ui/StatTile";
import { InlineNotice } from "@/components/ui/InlineNotice";
import { UsageBarChart, type BarDatum } from "@/components/ui/UsageBarChart";
import {
  useTokenUsageHistory,
  useTokenUsageEvents,
  useTokenUsageByModel,
  type MonthlyUsageRow,
} from "@/hooks/useTokenUsageHistory";
import { useRefresh } from "@/hooks/useRefresh";

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
        <Chevron size={18} color={colors.muted.foreground} />
      </Pressable>

      {isExpanded && (
        <View>
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
        </View>
      )}
    </Card>
  );
}

function EventList({ monthIso }: { monthIso: string }) {
  const { data: events, isLoading } = useTokenUsageEvents(monthIso);

  if (isLoading) {
    return (
      <View className="mt-3 items-center py-3">
        <ActivityIndicator size="small" color={colors.foreground} />
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
              <Text className="text-sm text-foreground" selectable>
                {formatDate(ev.created_at)}
              </Text>
              <Text className="text-xs text-muted-foreground" selectable>
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

function PricingRow({
  provider,
  model,
  input,
  output,
}: {
  provider: string;
  model: string;
  input: string;
  output: string;
}) {
  return (
    <View className="flex-row items-center justify-between">
      <View className="flex-1 gap-0.5">
        <Text className="text-sm font-medium text-foreground">{model}</Text>
        <Text className="text-xs text-muted-foreground">{provider}</Text>
      </View>
      <View className="flex-row gap-4">
        <View className="items-end">
          <Text className="text-sm text-foreground">{input}</Text>
          <Text className="text-xs text-muted-foreground">in</Text>
        </View>
        <View className="items-end">
          <Text className="text-sm text-foreground">{output}</Text>
          <Text className="text-xs text-muted-foreground">out</Text>
        </View>
      </View>
    </View>
  );
}

export default function UsageScreen() {
  const router = useRouter();
  const { data: history, isLoading, refetch: refetchHistory } = useTokenUsageHistory();
  const { data: modelUsage, refetch: refetchModelUsage } = useTokenUsageByModel();
  const [expandedMonth, setExpandedMonth] = useState<string | null>(null);
  const { refreshing, onRefresh } = useRefresh([refetchHistory, refetchModelUsage]);

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
            <ActivityIndicator size="large" color={colors.foreground} />
          </View>
        ) : !history?.length ? (
          <View className="flex-1 items-center justify-center px-5">
            <InlineNotice tone="info">
              No usage data yet. Generate your first report to see stats here.
            </InlineNotice>
          </View>
        ) : (
          <View className="flex-1">
            <ScrollView
              className="flex-1"
              contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 40, gap: 16 }}
              refreshControl={
                <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
              }
            >
              {/* All-time summary */}
              <SectionHeader
                title="All-Time Summary"
                icon={<Zap size={18} color={colors.foreground} />}
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
                    icon={<BarChart3 size={18} color={colors.foreground} />}
                  />
                  <Card className="items-center py-5">
                    <UsageBarChart data={tokenChartData} unit="tokens / month" />
                  </Card>
                </>
              )}

              {/* Per-model breakdown */}
              {modelUsage && modelUsage.length > 0 && (
                <>
                  <SectionHeader
                    title="Usage by Model"
                    subtitle="All-time tokens per model"
                    icon={<Cpu size={18} color={colors.foreground} />}
                  />
                  {modelUsage.map((m, i) => {
                    const total = m.input_tokens + m.output_tokens;
                    return (
                      <View
                        key={`${m.provider}::${m.model}`}
                      >
                        <Card className="gap-1">
                          <View className="flex-row items-center justify-between">
                            <View className="flex-1 gap-0.5">
                              <Text className="text-sm font-medium text-foreground" numberOfLines={1}>
                                {m.model}
                              </Text>
                              <Text className="text-xs text-muted-foreground">
                                {m.provider} · {m.generation_count} generation{m.generation_count !== 1 ? "s" : ""}
                              </Text>
                            </View>
                            <Text className="text-sm font-medium text-foreground">
                              {formatTokenCount(total)}
                            </Text>
                          </View>
                          <View className="mt-1 flex-row gap-4">
                            <Text className="text-xs text-muted-foreground">
                              In {formatTokenCount(m.input_tokens)}
                            </Text>
                            <Text className="text-xs text-muted-foreground">
                              Out {formatTokenCount(m.output_tokens)}
                            </Text>
                            <Text className="text-xs text-muted-foreground">
                              Cached {formatTokenCount(m.cached_tokens)}
                            </Text>
                          </View>
                        </Card>
                      </View>
                    );
                  })}
                </>
              )}

              {/* Monthly breakdown */}
              <SectionHeader
                title="Monthly Breakdown"
                subtitle="Tap a month to see individual generations"
              />
              {history.map((row, i) => (
                <View
                  key={row.month}
                >
                  <MonthCard
                    row={row}
                    isExpanded={expandedMonth === row.month}
                    onToggle={() => handleToggle(row.month)}
                  />
                </View>
              ))}

              {/* Pricing reference */}
              <SectionHeader
                title="Token Pricing Reference"
                subtitle="Cost per 1M tokens (USD)"
                icon={<DollarSign size={18} color={colors.foreground} />}
              />
              <Card className="gap-3">
                <PricingRow provider="OpenAI" model="GPT-4o Mini" input="$0.15" output="$0.60" />
                <PricingRow provider="OpenAI" model="GPT-4o" input="$2.50" output="$10.00" />
                <PricingRow provider="Anthropic" model="Claude Sonnet" input="$3.00" output="$15.00" />
                <PricingRow provider="Anthropic" model="Claude Haiku" input="$0.25" output="$1.25" />
                <PricingRow provider="Google" model="Gemini 2.0 Flash" input="$0.10" output="$0.40" />
                <PricingRow provider="Kimi" model="Moonshot" input="$0.14" output="$0.28" />
                <PricingRow provider="Kimi" model="K2" input="$0.55" output="$2.19" />
                <PricingRow provider="DeepSeek" model="DeepSeek-V3" input="$0.27" output="$1.10" />
                <PricingRow provider="DeepSeek" model="DeepSeek-R1" input="$0.55" output="$2.19" />
                <PricingRow provider="Qwen (Alibaba)" model="Qwen-Max" input="$1.60" output="$6.40" />
                <PricingRow provider="Qwen (Alibaba)" model="Qwen-Plus" input="$0.40" output="$1.20" />
                <PricingRow provider="Qwen (Alibaba)" model="Qwen-Turbo" input="$0.05" output="$0.20" />
                <PricingRow provider="Zhipu AI" model="GLM-4" input="$1.40" output="$1.40" />
                <PricingRow provider="Baichuan" model="Baichuan-4" input="$1.40" output="$1.40" />
                <PricingRow provider="01.AI" model="Yi-Large" input="$0.40" output="$0.40" />
              </Card>
              <InlineNotice tone="info">
                Prices are approximate and may change. Check each provider's site for current rates.
              </InlineNotice>
            </ScrollView>
          </View>
        )}
      </View>
    </SafeAreaView>
  );
}
