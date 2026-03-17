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
      <View className="px-5 pt-4 pb-4">
        <View className="flex-row items-center justify-between">
          <View>
            <Text className="text-base text-muted-foreground">Good morning</Text>
            <Text className="text-2xl font-bold tracking-tight text-foreground">
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
        renderItem={({ item, index }) => (
          <Animated.View entering={FadeInDown.delay(index * 25).duration(150)}>
            <Pressable onPress={() => router.push(`/projects/${item.id}/reports`)}>
              <Card>
                <View className="flex-row items-start justify-between">
                  <Text className="flex-1 text-lg font-semibold text-foreground">
                    {item.name}
                  </Text>
                  <Badge variant={statusVariant[item.status]}>
                    {item.status}
                  </Badge>
                </View>
                <View className="mt-2 flex-row items-center gap-1.5">
                  <MapPin size={14} color="#6e6e77" />
                  <Text className="text-base text-muted-foreground">
                    {item.address}
                  </Text>
                </View>
                <View className="mt-1 flex-row items-center gap-1.5">
                  <Clock size={12} color="#6e6e77" />
                  <Text className="text-sm text-muted-foreground">
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
