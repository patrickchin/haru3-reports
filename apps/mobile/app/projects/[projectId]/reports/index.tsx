import { useState } from "react";
import { View, Text, FlatList, Pressable, ScrollView } from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { ArrowLeft, Plus, FileText, ClipboardList } from "lucide-react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Animated, { FadeInDown } from "react-native-reanimated";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { MOCK_REPORTS, REPORT_FILTERS } from "@/constants/mock-data";

export default function ReportListScreen() {
  const router = useRouter();
  const { projectId } = useLocalSearchParams<{ projectId: string }>();
  const [filter, setFilter] = useState("All");

  const filtered =
    filter === "All"
      ? MOCK_REPORTS
      : MOCK_REPORTS.filter((r) => r.type === filter);

  return (
    <SafeAreaView className="flex bg-background" edges={["top"]}>
      <View className="px-5 pt-4 pb-4">
        <Pressable
          onPress={() => router.back()}
          className="mb-5 flex-row items-center gap-2 self-start rounded-full bg-foreground px-4 py-2 active:opacity-75"
          accessibilityRole="button"
          accessibilityLabel="Go back to projects"
        >
          <ArrowLeft size={16} color="#ffffff" />
          <Text className="text-sm font-semibold text-background">Projects</Text>
        </Pressable>
        <View className="flex-row items-center justify-between">
          <Text className="text-2xl font-bold tracking-tight text-foreground">
            Reports
          </Text>
          <Button
            size="icon"
            onPress={() =>
              router.push(`/projects/${projectId}/reports/generate`)
            }
            accessibilityLabel="Create new report"
          >
            <Plus size={20} color="#ffffff" />
          </Button>
        </View>
      </View>

      {/* Filter pills */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 20, gap: 8, paddingBottom: 16 }}
      >
        {REPORT_FILTERS.map((f) => (
          <Pressable
            key={f}
            onPress={() => setFilter(f)}
            className={`rounded-md px-4 py-2 ${
              filter === f ? "bg-primary" : "bg-secondary"
            }`}
            accessibilityRole="button"
            accessibilityLabel={`Filter by ${f}`}
            accessibilityState={{ selected: filter === f }}
          >
            <Text
              className={`text-base font-medium ${
                filter === f
                  ? "text-primary-foreground"
                  : "text-secondary-foreground"
              }`}
            >
              {f}
            </Text>
          </Pressable>
        ))}
      </ScrollView>

      <FlatList
        data={filtered}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 16, gap: 12 }}
        removeClippedSubviews={true}
        maxToRenderPerBatch={10}
        updateCellsBatchingPeriod={50}
        ListEmptyComponent={
          <View className="items-center justify-center py-20">
            <View className="h-16 w-16 items-center justify-center rounded-2xl bg-secondary">
              <ClipboardList size={28} color="#6e6e77" />
            </View>
            <Text className="mt-4 text-center text-base font-medium text-muted-foreground">
              No reports yet
            </Text>
            <Text className="mt-1 text-center text-sm text-muted-foreground">
              Tap + to generate your first report.
            </Text>
          </View>
        }
        renderItem={({ item, index }) => (
          <Animated.View entering={FadeInDown.duration(150).delay(index * 50)}>
            <Pressable
              onPress={() =>
                router.push(`/projects/${projectId}/reports/${item.id}`)
              }
              accessibilityRole="button"
              accessibilityLabel={`${item.title}, ${item.date}, ${item.status}`}
            >
              <Card className="flex-row items-center justify-between">
                <View className="flex-row items-center gap-3 flex-1">
                  <View className="h-10 w-10 items-center justify-center rounded-md bg-secondary">
                    <FileText size={20} color="#6e6e77" />
                  </View>
                  <View className="flex-1">
                    <Text className="text-base font-semibold text-foreground">
                      {item.title}
                    </Text>
                    <Text className="text-sm text-muted-foreground">
                      {item.date}
                    </Text>
                  </View>
                </View>
                <View className="items-end gap-1.5">
                  <Badge
                    variant={item.status === "Draft" ? "draft" : "final"}
                  >
                    {item.status}
                  </Badge>
                  <View className="rounded-full bg-primary/10 px-2 py-0.5">
                    <Text className="text-xs font-semibold text-primary">
                      {item.confidence}%
                    </Text>
                  </View>
                </View>
              </Card>
            </Pressable>
          </Animated.View>
        )}
      />
    </SafeAreaView>
  );
}
