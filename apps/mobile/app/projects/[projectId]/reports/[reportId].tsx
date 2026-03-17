import { View, Text, ScrollView, Pressable } from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import {
  ArrowLeft,
  Cloud,
  Users,
  TrendingUp,
  AlertTriangle,
  Calendar,
  MapPin,
} from "lucide-react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Animated, { FadeInDown } from "react-native-reanimated";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { MOCK_REPORT_DETAIL } from "@/constants/mock-data";

const SECTION_ICONS: Record<string, React.ComponentType<{ size: number; color: string }>> = {
  Weather: Cloud,
  Manpower: Users,
  Progress: TrendingUp,
  Issues: AlertTriangle,
};

export default function ReportDetailScreen() {
  const router = useRouter();
  const { projectId } = useLocalSearchParams<{ projectId: string }>();

  return (
    <SafeAreaView className="flex-1 bg-background" edges={["top"]}>
      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingBottom: 32 }}
      >
        <View className="px-5 pt-4 pb-4">
          <Pressable
            onPress={() => router.back()}
            className="mb-5 flex-row items-center gap-2 self-start rounded-full bg-foreground px-4 py-2 active:opacity-75"
          >
            <ArrowLeft size={16} color="#ffffff" />
            <Text className="text-sm font-semibold text-background">Reports</Text>
          </Pressable>

          <View className="flex-row items-start justify-between">
            <Text className="flex-1 text-2xl font-bold tracking-tight text-foreground">
              {MOCK_REPORT_DETAIL.title}
            </Text>
            <Badge variant="final">{MOCK_REPORT_DETAIL.status}</Badge>
          </View>

          <View className="mt-3 flex-row flex-wrap gap-3">
            <View className="flex-row items-center gap-1">
              <Calendar size={14} color="#6e6e77" />
              <Text className="text-sm text-muted-foreground">
                {MOCK_REPORT_DETAIL.date}
              </Text>
            </View>
            <View className="flex-row items-center gap-1">
              <MapPin size={14} color="#6e6e77" />
              <Text className="text-sm text-muted-foreground">
                {MOCK_REPORT_DETAIL.project}
              </Text>
            </View>
            <Text className="text-sm text-muted-foreground">
              {MOCK_REPORT_DETAIL.confidence}% AI confidence
            </Text>
          </View>
        </View>

        <View className="gap-3 px-5">
          {MOCK_REPORT_DETAIL.sections.map((block, i) => {
            const Icon = SECTION_ICONS[block.section] || Cloud;
            return (
              <Animated.View
                key={block.section}
                entering={FadeInDown.delay(i * 30).duration(150)}
              >
                <Card>
                  <View className="mb-2 flex-row items-center gap-2">
                    <View className="h-8 w-8 items-center justify-center rounded-md bg-primary/10">
                      <Icon size={16} color="#f47316" />
                    </View>
                    <Text className="text-base font-semibold text-foreground">
                      {block.section}
                    </Text>
                  </View>
                  <Text className="text-base leading-relaxed text-muted-foreground">
                    {block.content}
                  </Text>
                </Card>
              </Animated.View>
            );
          })}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
