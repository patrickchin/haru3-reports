import { View, Text, Pressable, ScrollView, ActivityIndicator, Modal } from "react-native";
import { useState } from "react";
import { useNavigation, useRouter } from "expo-router";
import { User, Bell, Wifi, LogOut, ChevronRight, Bot, Check, Zap, X } from "lucide-react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Animated, { FadeInDown } from "react-native-reanimated";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { InlineNotice } from "@/components/ui/InlineNotice";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { StatTile } from "@/components/ui/StatTile";
import { useAuth } from "@/lib/auth";
import { useAiProvider, useAvailableProviders, AI_PROVIDERS } from "@/hooks/useAiProvider";
import { useTokenUsage } from "@/hooks/useTokenUsage";

const SECTIONS = [
  { label: "Account Details", Icon: User, route: "/account" as const },
  { label: "Notifications", Icon: Bell, route: null },
  { label: "Offline Data", Icon: Wifi, route: null },
];

export default function ProfileScreen() {
  const router = useRouter();
  const navigation = useNavigation();
  const { user, profile, isLoading, signOut } = useAuth();
  const { provider, setProvider } = useAiProvider();
  const { data: availableProviders } = useAvailableProviders();
  const { data: monthlyUsage, isLoading: usageLoading } = useTokenUsage();
  const [modalVisible, setModalVisible] = useState(false);

  const selectedProvider = AI_PROVIDERS.find((p) => p.key === provider);
  const showProviderSettings = __DEV__;

  const handleBack = () => {
    // Profile lives inside the (tabs) navigator, so router.back() can drop the
    // user onto the Sites tab instead of the screen they were on. Prefer the
    // parent stack navigator when available so we pop the route that pushed us.
    const parent = navigation.getParent();
    if (parent?.canGoBack()) {
      parent.goBack();
      return;
    }
    if (router.canGoBack()) {
      router.back();
      return;
    }
    router.replace("/(tabs)/projects");
  };

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
        <View className="px-5 pt-4 pb-6 gap-5">
          <ScreenHeader
            title="Profile"
            onBack={handleBack}
          />

          <Card variant="emphasis" className="flex-row items-center gap-4">
            <View className="h-14 w-14 items-center justify-center rounded-xl border border-border bg-card">
              <User size={24} color="#1a1a2e" />
            </View>
            <View className="flex-1">
              <Text className="text-title text-foreground">
                {displayName}
              </Text>
              <Text className="text-body text-muted-foreground">
                {phoneNumber}
              </Text>
              <Text className="text-sm text-muted-foreground">{companyName}</Text>
            </View>
          </Card>
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
          <Animated.View entering={FadeInDown.duration(80)}>
            <Pressable onPress={() => router.push("/usage")}>
              <Card className="gap-3">
                <View className="flex-row items-center justify-between">
                  <View className="flex-row items-center gap-2">
                    <Zap size={18} color="#1a1a2e" />
                    <Text className="text-title-sm text-foreground">
                      Usage This Month
                    </Text>
                  </View>
                  <ChevronRight size={16} color="#5c5c6e" />
                </View>
                {usageLoading ? (
                  <ActivityIndicator size="small" color="#1a1a2e" />
                ) : monthlyUsage ? (
                  <View className="flex-row flex-wrap gap-3">
                    <StatTile value={monthlyUsage.generation_count} label="Reports" compact className="min-w-[46%]" />
                    <StatTile value={formatTokenCount(monthlyUsage.input_tokens)} label="Input" compact className="min-w-[46%]" />
                    <StatTile value={formatTokenCount(monthlyUsage.output_tokens)} label="Output" compact className="min-w-[46%]" />
                    <StatTile value={formatTokenCount(monthlyUsage.cached_tokens)} label="Cached" compact className="min-w-[46%]" />
                  </View>
                ) : (
                  <Text className="text-base text-muted-foreground">
                    No reports generated yet this month.
                  </Text>
                )}
              </Card>
            </Pressable>
          </Animated.View>

          {SECTIONS.map((item, i) => (
            <Animated.View
              key={item.label}
              entering={FadeInDown.delay(i * 15).duration(80)}
            >
              <Pressable
                onPress={item.route ? () => router.push(item.route) : undefined}
                disabled={!item.route}
                style={!item.route ? { opacity: 0.5 } : undefined}
              >
                <Card className="flex-row items-center gap-4">
                  <View className="h-10 w-10 items-center justify-center rounded-md border border-border bg-card">
                    <item.Icon size={20} color="#5c5c6e" />
                  </View>
                  <View className="flex-1">
                    <Text className="text-title-sm text-foreground">
                      {item.label}
                    </Text>
                  </View>
                  <ChevronRight size={16} color="#5c5c6e" />
                </Card>
              </Pressable>
            </Animated.View>
          ))}
        </View>

        {showProviderSettings && (
          <View className="mt-6 px-5">
            <Animated.View entering={FadeInDown.delay(SECTIONS.length * 15 + 15).duration(80)}>
              <InlineNotice tone="info" title="Developer Setting">
                AI provider selection is visible in development so model behavior can be compared during testing.
              </InlineNotice>
              <View className="mb-2 mt-4 flex-row items-center gap-2">
                <Bot size={16} color="#5c5c6e" />
                <Text className="text-label text-muted-foreground">
                  AI Provider
                </Text>
              </View>
              <Pressable onPress={() => setModalVisible(true)}>
                <Card className="flex-row items-center gap-3">
                  <View className="flex-1">
                    <Text className="text-title-sm text-foreground">
                      {selectedProvider?.label ?? "Select provider"}
                    </Text>
                    <Text className="text-body text-muted-foreground">
                      {selectedProvider?.desc}
                    </Text>
                  </View>
                  <ChevronRight size={16} color="#5c5c6e" />
                </Card>
              </Pressable>
            </Animated.View>
          </View>
        )}

        <Modal
          visible={showProviderSettings && modalVisible}
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
          <Button
            testID="btn-sign-out"
            onPress={() => {
              void signOut().then(() => router.replace("/"));
            }}
            variant="destructive"
            size="lg"
            className="w-full"
          >
            <View className="flex-row items-center justify-center gap-2">
              <LogOut size={16} color="#8f1d18" />
              <Text className="text-base font-semibold text-danger-text">
                Sign Out
              </Text>
            </View>
          </Button>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
