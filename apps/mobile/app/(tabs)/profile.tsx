import { View, Text, Pressable, ScrollView, ActivityIndicator } from "react-native";
import { useRouter } from "expo-router";
import { User, Bell, Wifi, LogOut, ChevronRight } from "lucide-react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Animated, { FadeInDown } from "react-native-reanimated";
import { Card } from "@/components/ui/Card";
import { useAuth } from "@/lib/auth";

const SECTIONS = [
  { label: "Account Details", Icon: User, desc: "Name, phone, company" },
  { label: "Notifications", Icon: Bell, desc: "Alerts & reminders" },
  { label: "Offline Data", Icon: Wifi, desc: "Manage cached reports" },
];

export default function ProfileScreen() {
  const router = useRouter();
  const { user, profile, isLoading, signOut } = useAuth();

  const displayName = profile?.full_name?.trim() || "New User";
  const companyName = profile?.company_name?.trim() || "Add your company details";
  const phoneNumber = profile?.phone || user?.phone || "No phone number on file";

  return (
    <SafeAreaView className="flex-1 bg-background" edges={["top"]}>
      <ScrollView className="flex-1" contentContainerStyle={{ paddingBottom: 32 }}>
        <View className="px-5 pt-4 pb-6">
          <View className="flex-row items-center gap-4">
            <View className="h-14 w-14 items-center justify-center border border-border bg-card">
              <User size={24} color="#1a1a2e" />
            </View>
            <View>
              <Text className="text-2xl font-bold text-foreground">
                {displayName}
              </Text>
              <Text className="text-lg text-muted-foreground">
                {phoneNumber}
              </Text>
              <Text className="text-base text-muted-foreground">{companyName}</Text>
            </View>
          </View>
        </View>

        {isLoading && (
          <View className="px-5 pb-4">
            <Card className="flex-row items-center gap-3">
              <ActivityIndicator color="#1a1a2e" />
              <Text className="text-base text-muted-foreground">
                Loading your account details...
              </Text>
            </Card>
          </View>
        )}

        <View className="gap-2 px-5">
          {SECTIONS.map((item, i) => (
            <Animated.View
              key={item.label}
              entering={FadeInDown.delay(i * 25).duration(120)}
            >
              <Pressable>
                <Card className="flex-row items-center gap-4">
                  <View className="h-10 w-10 items-center justify-center border border-border">
                    <item.Icon size={20} color="#5c5c6e" />
                  </View>
                  <View className="flex-1">
                    <Text className="text-lg font-semibold text-foreground">
                      {item.label}
                    </Text>
                    <Text className="text-base text-muted-foreground">
                      {item.desc}
                    </Text>
                  </View>
                  <ChevronRight size={16} color="#5c5c6e" />
                </Card>
              </Pressable>
            </Animated.View>
          ))}
        </View>

        <View className="mt-8 px-5">
          <Pressable
            onPress={() => {
              void signOut().then(() => router.replace("/"));
            }}
            className="flex-row items-center justify-center gap-2 border border-destructive bg-card p-4"
          >
            <LogOut size={16} color="#e5383b" />
            <Text className="text-lg font-medium text-destructive">
              Sign Out
            </Text>
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
