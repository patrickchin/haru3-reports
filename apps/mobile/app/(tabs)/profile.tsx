import { View, Text, Pressable, ScrollView, ActivityIndicator, Modal } from "react-native";
import { useState } from "react";
import { useRouter } from "expo-router";
import { User, Bell, Wifi, LogOut, ChevronRight, Bot, Check, Zap, X } from "lucide-react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Animated, { FadeInDown } from "react-native-reanimated";
import { Card } from "@/components/ui/Card";
import { useAuth } from "@/lib/auth";
import { useAiProvider, useAvailableProviders, AI_PROVIDERS } from "@/hooks/useAiProvider";
import { useTokenUsage } from "@/hooks/useTokenUsage";

const SECTIONS = [
  { label: "Account Details", Icon: User, desc: "Name, phone, company", route: "/account" as const },
  { label: "Notifications", Icon: Bell, desc: "Alerts & reminders", route: null },
  { label: "Offline Data", Icon: Wifi, desc: "Manage cached reports", route: null },
];

export default function ProfileScreen() {
  const router = useRouter();
  const { user, profile, isLoading, signOut } = useAuth();
  const { provider, setProvider } = useAiProvider();
  const { data: availableProviders } = useAvailableProviders();
  const { data: monthlyUsage, isLoading: usageLoading } = useTokenUsage();
  const [modalVisible, setModalVisible] = useState(false);

  const selectedProvider = AI_PROVIDERS.find((p) => p.key === provider);

  const formatTokenCount = (count: number) => {
    if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1)}M`;
    if (count >= 1_000) return `${(count / 1_000).toFixed(1)}K`;
    return String(count);
  };

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
          {/* Usage stats card */}
          <Animated.View entering={FadeInDown.duration(120)}>
            <Card className="gap-3">
              <View className="flex-row items-center gap-2">
                <Zap size={18} color="#1a1a2e" />
                <Text className="text-lg font-semibold text-foreground">
                  Usage This Month
                </Text>
              </View>
              {usageLoading ? (
                <ActivityIndicator size="small" color="#1a1a2e" />
              ) : monthlyUsage ? (
                <View className="flex-row justify-between">
                  <View className="items-center">
                    <Text className="text-2xl font-bold text-foreground">
                      {monthlyUsage.generation_count}
                    </Text>
                    <Text className="text-sm text-muted-foreground">Reports</Text>
                  </View>
                  <View className="items-center">
                    <Text className="text-2xl font-bold text-foreground">
                      {formatTokenCount(monthlyUsage.input_tokens)}
                    </Text>
                    <Text className="text-sm text-muted-foreground">Input</Text>
                  </View>
                  <View className="items-center">
                    <Text className="text-2xl font-bold text-foreground">
                      {formatTokenCount(monthlyUsage.output_tokens)}
                    </Text>
                    <Text className="text-sm text-muted-foreground">Output</Text>
                  </View>
                  <View className="items-center">
                    <Text className="text-2xl font-bold text-foreground">
                      {formatTokenCount(monthlyUsage.cached_tokens)}
                    </Text>
                    <Text className="text-sm text-muted-foreground">Cached</Text>
                  </View>
                </View>
              ) : (
                <Text className="text-base text-muted-foreground">
                  No reports generated yet this month.
                </Text>
              )}
            </Card>
          </Animated.View>

          {SECTIONS.map((item, i) => (
            <Animated.View
              key={item.label}
              entering={FadeInDown.delay(i * 25).duration(120)}
            >
              <Pressable
                onPress={item.route ? () => router.push(item.route) : undefined}
                disabled={!item.route}
                style={!item.route ? { opacity: 0.5 } : undefined}
              >
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

        <View className="mt-6 px-5">
          <Animated.View entering={FadeInDown.delay(SECTIONS.length * 25 + 25).duration(120)}>
            <View className="mb-2 flex-row items-center gap-2">
              <Bot size={16} color="#5c5c6e" />
              <Text className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                AI Provider
              </Text>
            </View>
            <Pressable onPress={() => setModalVisible(true)}>
              <Card className="flex-row items-center gap-3">
                <View className="flex-1">
                  <Text className="text-lg font-semibold text-foreground">
                    {selectedProvider?.label ?? "Select provider"}
                  </Text>
                  <Text className="text-base text-muted-foreground">
                    {selectedProvider?.desc}
                  </Text>
                </View>
                <ChevronRight size={16} color="#5c5c6e" />
              </Card>
            </Pressable>
          </Animated.View>
        </View>

        <Modal
          visible={modalVisible}
          animationType="slide"
          transparent
          onRequestClose={() => setModalVisible(false)}
        >
          <Pressable
            className="flex-1 justify-end bg-black/40"
            onPress={() => setModalVisible(false)}
          >
            <Pressable
              onPress={(e) => e.stopPropagation()}
              className="bg-background pb-10"
            >
              <View className="flex-row items-center justify-between border-b border-border px-5 py-4">
                <Text className="text-xl font-bold text-foreground">
                  Select AI Provider
                </Text>
                <Pressable onPress={() => setModalVisible(false)} hitSlop={12}>
                  <X size={20} color="#5c5c6e" />
                </Pressable>
              </View>
              <View className="px-5 pt-3 gap-2">
                {AI_PROVIDERS.map((p) => {
                  const isAvailable = !availableProviders || availableProviders.includes(p.key);
                  const isSelected = provider === p.key;
                  return (
                    <Pressable
                      key={p.key}
                      onPress={() => {
                        if (!isAvailable) return;
                        setProvider(p.key);
                        setModalVisible(false);
                      }}
                      disabled={!isAvailable}
                    >
                      <Card
                        className={`flex-row items-center gap-3 ${
                          isSelected ? "border-primary" : ""
                        }`}
                        style={!isAvailable ? { opacity: 0.35 } : undefined}
                      >
                        <View className="flex-1">
                          <Text className="text-lg font-semibold text-foreground">
                            {p.label}
                          </Text>
                          <Text className="text-base text-muted-foreground">
                            {isAvailable ? p.desc : "No API key configured"}
                          </Text>
                        </View>
                        {isSelected && <Check size={18} color="#1a1a2e" />}
                      </Card>
                    </Pressable>
                  );
                })}
              </View>
            </Pressable>
          </Pressable>
        </Modal>

        <View className="mt-8 px-5">
          <Pressable
            testID="btn-sign-out"
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
