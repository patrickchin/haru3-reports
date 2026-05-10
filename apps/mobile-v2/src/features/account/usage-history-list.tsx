import { View, Text } from "react-native";
import { Card } from "@/shared/components/Card";
import { EmptyState } from "@/shared/components/EmptyState";
import { testIds } from "@/infra/test-ids";
import type { TokenUsage } from "@/infra/db-types";

type UsageHistoryListProps = {
  events: TokenUsage[];
};

function formatDate(iso: string): string {
  const date = new Date(iso);
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatTokenCount(count: number): string {
  if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1)}M`;
  if (count >= 1_000) return `${(count / 1_000).toFixed(1)}K`;
  return String(count);
}

export function UsageHistoryList({ events }: UsageHistoryListProps) {
  if (events.length === 0) {
    return (
      <EmptyState
        title="No Recent Usage"
        message="Your recent report generations will appear here."
      />
    );
  }

  return (
    <View className="gap-2" testID={testIds.usage.history}>
      {events.map((event) => {
        const totalTokens = event.input_tokens + event.output_tokens;
        return (
          <Card key={event.id} className="flex-row items-center justify-between">
            <View className="flex-1 gap-1">
              <Text className="text-body text-foreground">
                {formatDate(event.created_at)}
              </Text>
              <Text className="text-sm text-muted-foreground">
                {event.provider} / {event.model}
              </Text>
            </View>
            <Text className="text-body text-foreground font-semibold">
              {formatTokenCount(totalTokens)}
            </Text>
          </Card>
        );
      })}
    </View>
  );
}
