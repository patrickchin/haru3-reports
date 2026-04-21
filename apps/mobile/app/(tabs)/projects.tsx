import { View, Text, FlatList, Pressable, ActivityIndicator } from "react-native";
import { useRouter } from "expo-router";
import { Plus, MapPin, Clock } from "lucide-react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Animated, { FadeInDown } from "react-native-reanimated";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { backend } from "@/lib/backend";
import { formatDate } from "@/lib/report-helpers";

type Project = {
  id: string;
  name: string;
  address: string | null;
  updated_at: string;
};

export default function ProjectsScreen() {
  const router = useRouter();

  const { data: projects = [], isLoading } = useQuery<Project[]>({
    queryKey: ["projects"],
    queryFn: async () => {
      const { data, error } = await backend
        .from("projects")
        .select("id, name, address, updated_at")
        .order("updated_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  return (
    <SafeAreaView className="flex-1 bg-background" edges={["top"]}>
      <View className="px-5 py-4">
        <ScreenHeader
          title="Your Sites"
          trailing={
            <Button
              testID="btn-new-project"
              onPress={() => router.push("/projects/new")}
              className="flex-row items-center gap-1.5"
            >
              <Plus size={18} color="#ffffff" />
              <Text className="text-sm font-semibold text-primary-foreground">New Site</Text>
            </Button>
          }
        />
      </View>

      {isLoading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color="#1a1a2e" />
        </View>
      ) : (
        <FlatList
          data={projects}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 16, paddingBottom: 16, gap: 12 }}
          removeClippedSubviews={true}
          maxToRenderPerBatch={10}
          updateCellsBatchingPeriod={50}
          ListEmptyComponent={
            <EmptyState
              icon={<Plus size={28} color="#5c5c6e" />}
              title="No sites yet"
              description="Create your first site so field notes and daily reports have a clear destination."
            />
          }
          renderItem={({ item, index }) => (
            <Animated.View entering={FadeInDown.duration(70)}>
              <Pressable onPress={() => router.push(`/projects/${item.id}`)}>
                <Card variant="emphasis" className="gap-3">
                  <Text className="text-title-sm text-foreground">
                    {item.name}
                  </Text>
                  {item.address && (
                    <View className="flex-row items-center gap-1.5">
                      <MapPin size={14} color="#5c5c6e" />
                      <Text className="text-body text-muted-foreground">
                        {item.address}
                      </Text>
                    </View>
                  )}
                  <View className="flex-row items-center gap-1.5">
                    <Clock size={12} color="#5c5c6e" />
                    <Text className="text-sm text-muted-foreground">
                      Updated: {formatDate(item.updated_at)}
                    </Text>
                  </View>
                </Card>
              </Pressable>
            </Animated.View>
          )}
        />
      )}
    </SafeAreaView>
  );
}
