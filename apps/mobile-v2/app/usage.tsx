import { View, Text, ScrollView, ActivityIndicator } from "react-native";
import { useRouter } from "expo-router";
import { ArrowLeft } from "lucide-react-native";
import { Screen } from "@/shared/components/Screen";
import { Button } from "@/shared/components/Button";
import { UsageSummary } from "@/features/account/usage-summary";
import { UsageHistoryList } from "@/features/account/usage-history-list";
import { useTokenUsage, useTokenUsageEvents } from "@/features/account/queries";
import { colors } from "@/design-tokens/colors";
import { testIds } from "@/infra/test-ids";

export default function UsageScreen() {
  const router = useRouter();
  const { data: monthlyUsage, isLoading: isLoadingUsage } = useTokenUsage();
  const { data: events = [], isLoading: isLoadingEvents } = useTokenUsageEvents(30);

  return (
    <Screen testID={testIds.usage.screen}>
      <View className="flex-1">
        <View className="px-6 py-4">
          <Button variant="ghost" onPress={() => router.back()}>
            <View className="flex-row items-center gap-2">
              <ArrowLeft size={20} color={colors.foreground} />
              <Text className="text-body text-foreground">Back</Text>
            </View>
          </Button>
        </View>

        <ScrollView className="flex-1 px-6">
          <Text className="text-title text-foreground mb-6">
            Usage & Billing
          </Text>

          <View className="mb-6">
            <UsageSummary data={monthlyUsage} isLoading={isLoadingUsage} />
          </View>

          <Text className="text-body text-foreground font-semibold mb-3">
            Recent Activity (30 days)
          </Text>

          {isLoadingEvents ? (
            <View className="items-center py-8">
              <ActivityIndicator color={colors.foreground} />
            </View>
          ) : (
            <UsageHistoryList events={events} />
          )}
        </ScrollView>
      </View>
    </Screen>
  );
}
