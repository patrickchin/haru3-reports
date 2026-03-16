import { useState } from "react";
import { View, Text, FlatList, Pressable, ScrollView } from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { ArrowLeft, Plus, FileText } from "lucide-react-native";
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
          className="mb-4 flex-row items-center gap-1"
        >
          <ArrowLeft size={16} color="#6e6e77" />
          <Text className="text-sm text-muted-foreground">Projects</Text>
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
          >
            <Text
              className={`text-sm font-medium ${
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
        renderItem={({ item, index }) => (
          <Animated.View entering={FadeInDown.delay(index * 40).duration(250)}>
            <Pressable
              onPress={() =>
                router.push(`/projects/${projectId}/reports/${item.id}`)
              }
            >
              <Card className="flex-row items-center justify-between">
                <View className="flex-row items-center gap-3 flex-1">
                  <View className="h-10 w-10 items-center justify-center rounded-md bg-secondary">
                    <FileText size={20} color="#6e6e77" />
                  </View>
                  <View className="flex-1">
                    <Text className="text-sm font-semibold text-foreground">
                      {item.title}
                    </Text>
                    <Text className="text-xs text-muted-foreground">
                      {item.date}
                    </Text>
                  </View>
                </View>
                <View className="items-end">
                  <Badge
                    variant={item.status === "Draft" ? "draft" : "final"}
                  >
                    {item.status}
                  </Badge>
                  <Text className="mt-1 text-xs text-muted-foreground">
                    {item.confidence}% AI
                  </Text>
                </View>
              </Card>
            </Pressable>
          </Animated.View>
        )}
      />
    </SafeAreaView>
  );
}
