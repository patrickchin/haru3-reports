import { View, Text, Pressable, ScrollView } from "react-native";
import { useRouter } from "expo-router";
import { User, Bell, Wifi, LogOut, ChevronRight } from "lucide-react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Animated, { FadeInDown } from "react-native-reanimated";
import { Card } from "@/components/ui/Card";

const SECTIONS = [
  { label: "Account Details", Icon: User, desc: "Name, phone, company" },
  { label: "Notifications", Icon: Bell, desc: "Alerts & reminders" },
  { label: "Offline Data", Icon: Wifi, desc: "Manage cached reports" },
];

export default function ProfileScreen() {
  const router = useRouter();

  return (
    <SafeAreaView className="flex-1 bg-background" edges={["top"]}>
      <ScrollView className="flex-1" contentContainerStyle={{ paddingBottom: 32 }}>
        <View className="px-5 pt-4 pb-6">
          <View className="flex-row items-center gap-4">
            <View className="h-14 w-14 items-center justify-center rounded-full bg-secondary border border-border">
              <User size={24} color="#0a0a0b" />
            </View>
            <View>
              <Text className="text-xl font-bold text-foreground">
                John Foreman
              </Text>
              <Text className="text-sm text-muted-foreground">
                +1 (555) 000-0000
              </Text>
            </View>
          </View>
        </View>

        <View className="gap-2 px-5">
          {SECTIONS.map((item, i) => (
            <Animated.View
              key={item.label}
              entering={FadeInDown.delay(i * 50).duration(250)}
            >
              <Pressable>
                <Card className="flex-row items-center gap-4">
                  <View className="h-10 w-10 items-center justify-center rounded-md bg-secondary">
                    <item.Icon size={20} color="#6e6e77" />
                  </View>
                  <View className="flex-1">
                    <Text className="text-sm font-semibold text-foreground">
                      {item.label}
                    </Text>
                    <Text className="text-xs text-muted-foreground">
                      {item.desc}
                    </Text>
                  </View>
                  <ChevronRight size={16} color="#6e6e77" />
                </Card>
              </Pressable>
            </Animated.View>
          ))}
        </View>

        <View className="mt-8 px-5">
          <Pressable
            onPress={() => router.replace("/")}
            className="flex-row items-center justify-center gap-2 rounded-lg bg-secondary p-4"
          >
            <LogOut size={16} color="#e5383b" />
            <Text className="text-sm font-medium text-destructive">
              Sign Out
            </Text>
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
