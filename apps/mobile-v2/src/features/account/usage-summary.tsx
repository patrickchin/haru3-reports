import { View, Text, ActivityIndicator } from "react-native";
import { Card } from "@/shared/components/Card";
import { EmptyState } from "@/shared/components/EmptyState";
import { colors } from "@/design-tokens/colors";
import { testIds } from "@/infra/test-ids";
import type { TokenUsageMonthly } from "@/infra/db-types";

type UsageSummaryProps = {
  data: TokenUsageMonthly | null | undefined;
  isLoading: boolean;
};

function formatTokenCount(count: number): string {
  if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1)}M`;
  if (count >= 1_000) return `${(count / 1_000).toFixed(1)}K`;
  return String(count);
}

export function UsageSummary({ data, isLoading }: UsageSummaryProps) {
  if (isLoading) {
    return (
      <Card testID={testIds.usage.summary}>
        <View className="items-center py-8">
          <ActivityIndicator color={colors.foreground} />
        </View>
      </Card>
    );
  }

  if (!data) {
    return (
      <Card testID={testIds.usage.summary}>
        <EmptyState
          title="No Usage This Month"
          description="Generate your first report to see usage data here."
          testID={testIds.usage.emptyState}
        />
      </Card>
    );
  }

  return (
    <Card testID={testIds.usage.summary} className="gap-3">
      <Text className="text-title-sm text-foreground">This Month</Text>
      <View className="flex-row flex-wrap gap-3">
        <Card
          className="min-w-[46%] flex-1"
          testID={testIds.usage.summaryReports}
        >
          <Text className="text-sm text-muted-foreground mb-1">Reports</Text>
          <Text className="text-title text-foreground">
            {data.generation_count}
          </Text>
        </Card>
        <Card
          className="min-w-[46%] flex-1"
          testID={testIds.usage.summaryInputTokens}
        >
          <Text className="text-sm text-muted-foreground mb-1">
            Input Tokens
          </Text>
          <Text className="text-title text-foreground">
            {formatTokenCount(data.input_tokens)}
          </Text>
        </Card>
        <Card
          className="min-w-[46%] flex-1"
          testID={testIds.usage.summaryOutputTokens}
        >
          <Text className="text-sm text-muted-foreground mb-1">
            Output Tokens
          </Text>
          <Text className="text-title text-foreground">
            {formatTokenCount(data.output_tokens)}
          </Text>
        </Card>
        <Card className="min-w-[46%] flex-1">
          <Text className="text-sm text-muted-foreground mb-1">
            Cached Tokens
          </Text>
          <Text className="text-title text-foreground">
            {formatTokenCount(data.cached_tokens)}
          </Text>
        </Card>
      </View>
    </Card>
  );
}
