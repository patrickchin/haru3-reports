import { View, Text, FlatList, Pressable } from "react-native";
import { useRouter } from "expo-router";
import { Plus, MapPin, Clock } from "lucide-react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Animated, { FadeInDown } from "react-native-reanimated";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { MOCK_PROJECTS } from "@/constants/mock-data";

const statusVariant = {
  Active: "active" as const,
  Delayed: "delayed" as const,
  Completed: "completed" as const,
};

export default function ProjectsScreen() {
  const router = useRouter();

  return (
    <SafeAreaView className="flex-1 bg-background" edges={["top"]}>
      <View className="border-b border-border px-5 pt-4 pb-4">
        <View className="flex-row items-center justify-between">
          <View>
            <Text className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Good morning</Text>
            <Text className="text-3xl font-bold tracking-tight text-foreground">
              Your Sites
            </Text>
          </View>
          <Button
            size="icon"
            onPress={() => router.push("/projects/new")}
          >
            <Plus size={20} color="#ffffff" />
          </Button>
        </View>
      </View>

      <FlatList
        data={MOCK_PROJECTS}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 16, gap: 12 }}
        removeClippedSubviews={true}
        maxToRenderPerBatch={10}
        updateCellsBatchingPeriod={50}
        renderItem={({ item, index }) => (
          <Animated.View entering={FadeInDown.duration(100)}>
            <Pressable onPress={() => router.push(`/projects/${item.id}/reports`)}>
              <Card>
                <View className="flex-row items-start justify-between">
                  <Text className="flex-1 text-xl font-semibold text-foreground">
                    {item.name}
                  </Text>
                  <Badge variant={statusVariant[item.status]}>
                    {item.status}
                  </Badge>
                </View>
                <View className="mt-2 flex-row items-center gap-1.5">
                  <MapPin size={14} color="#5c5c6e" />
                  <Text className="text-lg text-muted-foreground">
                    {item.address}
                  </Text>
                </View>
                <View className="mt-1 flex-row items-center gap-1.5">
                  <Clock size={12} color="#5c5c6e" />
                  <Text className="text-base text-muted-foreground">
                    Last report: {item.lastReport}
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
