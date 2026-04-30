import { View, Text, Pressable, ScrollView, ActivityIndicator, Modal, RefreshControl } from "react-native";
import { useState } from "react";
import { useNavigation, useRouter } from "expo-router";
import { User, Bell, Wifi, LogOut, ChevronRight, ChevronLeft, Bot, Check, Zap, X } from "lucide-react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { StatTile } from "@/components/ui/StatTile";
import { useAuth } from "@/lib/auth";
import { useAiProvider, useAvailableProviders, AI_PROVIDERS, PROVIDER_MODELS } from "@/hooks/useAiProvider";
import { useTokenUsage } from "@/hooks/useTokenUsage";
import { useCopyToClipboard } from "@/hooks/useCopyToClipboard";
import { useRefresh } from "@/hooks/useRefresh";
import { buildInfo } from "@/lib/build-info";
import { colors } from "@/lib/design-tokens/colors";

const SECTIONS = [
  { label: "Account Details", Icon: User, route: "/account" as const },
  { label: "Notifications", Icon: Bell, route: null },
  { label: "Offline Data", Icon: Wifi, route: null },
];

export default function ProfileScreen() {
  const router = useRouter();
  const navigation = useNavigation();
  const { user, profile, isLoading, signOut } = useAuth();
  const { provider, setProvider, model, setModel } = useAiProvider();
  const { data: availableProviders, refetch: refetchProviders } = useAvailableProviders();
  const { data: monthlyUsage, isLoading: usageLoading, refetch: refetchUsage } = useTokenUsage();
  const { copy } = useCopyToClipboard();
  const { refreshing, onRefresh } = useRefresh([refetchProviders, refetchUsage]);
  const [modalVisible, setModalVisible] = useState(false);
  const [modalStep, setModalStep] = useState<"provider" | "model">("provider");

  const selectedProvider = AI_PROVIDERS.find((p) => p.key === provider);
  const providerModels = PROVIDER_MODELS[provider] ?? [];
  const selectedModel = providerModels.find((m) => m.id === model) ?? providerModels[0];

  const handleBack = () => {
    // Profile lives inside the (tabs) navigator, so router.back() can drop the
    // user onto the Projects tab instead of the screen they were on. Prefer the
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
  const hasRealName = Boolean(profile?.full_name?.trim());
  const hasRealCompany = Boolean(profile?.company_name?.trim());
  const hasRealPhone = Boolean(profile?.phone || user?.phone);

  return (
    <SafeAreaView className="flex-1 bg-background" edges={["top"]}>
      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingBottom: 32 }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        <View className="px-5 pt-4 pb-6 gap-5">
          <ScreenHeader
            title="Profile"
            onBack={handleBack}
          />

          <Card variant="emphasis" className="flex-row items-center gap-4">
            <View className="h-14 w-14 items-center justify-center rounded-xl border border-border bg-card">
              <User size={24} color={colors.foreground} />
            </View>
            <View className="flex-1 gap-0.5">
              <Pressable
                onPress={() =>
                  hasRealName && copy(displayName, { toast: "Name copied" })
                }
                disabled={!hasRealName}
                accessibilityRole={hasRealName ? "button" : undefined}
                accessibilityLabel={hasRealName ? `Copy name: ${displayName}` : undefined}
                hitSlop={4}
              >
                <Text testID="profile-display-name" className="text-title text-foreground">
                  {displayName}
                </Text>
              </Pressable>
              <Pressable
                onPress={() =>
                  hasRealPhone && copy(phoneNumber, { toast: "Phone copied" })
                }
                disabled={!hasRealPhone}
                accessibilityRole={hasRealPhone ? "button" : undefined}
                accessibilityLabel={hasRealPhone ? `Copy phone: ${phoneNumber}` : undefined}
                hitSlop={4}
              >
                <Text testID="profile-phone" className="text-body text-muted-foreground">
                  {phoneNumber}
                </Text>
              </Pressable>
              <Pressable
                onPress={() =>
                  hasRealCompany && copy(companyName, { toast: "Company copied" })
                }
                disabled={!hasRealCompany}
                accessibilityRole={hasRealCompany ? "button" : undefined}
                accessibilityLabel={hasRealCompany ? `Copy company: ${companyName}` : undefined}
                hitSlop={4}
              >
                <Text testID="profile-company-name" className="text-sm text-muted-foreground">
                </Text>
              </Pressable>
            </View>
          </Card>
        </View>

        {isLoading && (
          <View className="px-5 pb-4">
            <Card className="flex-row items-center gap-3">
              <ActivityIndicator color={colors.foreground} />
              <Text className="text-base text-muted-foreground">
                Loading your account details...
              </Text>
            </Card>
          </View>
        )}

        <View className="gap-2 px-5">
          {/* Usage stats card */}
          <View>
            <Pressable testID="btn-open-usage" onPress={() => router.push("/usage")}>
              <Card className="gap-3">
                <View className="flex-row items-center justify-between">
                  <View className="flex-row items-center gap-2">
                    <Zap size={18} color={colors.foreground} />
                    <Text className="text-title-sm text-foreground">
                      Usage This Month
                    </Text>
                  </View>
                  <ChevronRight size={16} color={colors.muted.foreground} />
                </View>
                {usageLoading ? (
                  <View className="h-[84px] flex-row items-center justify-center">
                    <ActivityIndicator size="small" color={colors.foreground} />
                  </View>
                ) : monthlyUsage ? (
                  <View className="flex-row flex-wrap gap-3">
                    <StatTile value={monthlyUsage.generation_count} label="Reports" compact className="min-w-[29%] flex-1" />
                    <StatTile value={formatTokenCount(monthlyUsage.input_tokens)} label="Input" compact className="min-w-[29%] flex-1" />
                    <StatTile value={formatTokenCount(monthlyUsage.output_tokens)} label="Output" compact className="min-w-[29%] flex-1" />
                  </View>
                ) : (
                  <View testID="usage-empty-state" className="h-[84px] flex-row items-center justify-center">
                    <Text accessible accessibilityLabel="No reports generated yet this month" className="text-base text-muted-foreground">
                      No reports generated yet this month.
                    </Text>
                  </View>
                )}
              </Card>
            </Pressable>
          </View>

          {SECTIONS.map((item, i) => {
            const disabled = !item.route;
            return (
              <View key={item.label}>
                <Pressable
                  onPress={item.route ? () => router.push(item.route) : undefined}
                  disabled={disabled}
                >
                  <Card className="flex-row items-center gap-4">
                    <View className="h-10 w-10 items-center justify-center rounded-md border border-border bg-card">
                      <item.Icon size={20} color={disabled ? colors.muted.disabled : colors.muted.foreground} />
                    </View>
                    <View className="flex-1">
                      <Text className={disabled ? "text-title-sm text-muted-foreground" : "text-title-sm text-foreground"}>
                        {item.label}
                      </Text>
                    </View>
                    <ChevronRight size={16} color={disabled ? colors.muted.disabled : colors.muted.foreground} />
                  </Card>
                </Pressable>
              </View>
            );
          })}
        </View>

        <View className="mt-6 px-5">
          <View>
            <View className="mb-2 flex-row items-center gap-2">
              <Bot size={16} color={colors.muted.foreground} />
              <Text className="text-label text-muted-foreground">
                AI Model
              </Text>
            </View>
            <Pressable
              onPress={() => {
                setModalStep("provider");
                setModalVisible(true);
              }}
            >
              <Card className="flex-row items-center gap-3">
                <View className="flex-1">
                  <Text className="text-title-sm text-foreground" selectable>
                    {selectedProvider?.label ?? "Select provider"}
                    {selectedModel ? ` · ${selectedModel.label}` : ""}
                  </Text>
                  <Text className="text-body text-muted-foreground" numberOfLines={1} selectable>
                    {selectedModel?.id ?? selectedProvider?.desc ?? ""}
                  </Text>
                </View>
                <ChevronRight size={16} color={colors.muted.foreground} />
              </Card>
            </Pressable>
          </View>
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
                <View className="flex-row items-center gap-2 flex-1">
                  {modalStep === "model" && (
                    <Pressable onPress={() => setModalStep("provider")} hitSlop={12}>
                      <ChevronLeft size={22} color={colors.muted.foreground} />
                    </Pressable>
                  )}
                  <Text className="text-xl font-bold text-foreground">
                    {modalStep === "provider"
                      ? "Select AI Provider"
                      : `Select Model · ${selectedProvider?.label ?? provider}`}
                  </Text>
                </View>
                <Pressable onPress={() => setModalVisible(false)} hitSlop={12}>
                  <X size={20} color={colors.muted.foreground} />
                </Pressable>
              </View>
              {modalStep === "provider" ? (
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
                          setModalStep("model");
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
                          {isSelected && <Check size={18} color={colors.foreground} />}
                          <ChevronRight size={16} color={colors.muted.foreground} />
                        </Card>
                      </Pressable>
                    );
                  })}
                </View>
              ) : (
                <View className="px-5 pt-3 gap-2">
                  {providerModels.map((m) => {
                    const isSelected = model === m.id;
                    return (
                      <Pressable
                        key={m.id}
                        onPress={() => {
                          setModel(m.id);
                          setModalVisible(false);
                        }}
                      >
                        <Card
                          className={`flex-row items-center gap-3 ${
                            isSelected ? "border-primary" : ""
                          }`}
                        >
                          <View className="flex-1">
                            <Text className="text-lg font-semibold text-foreground" selectable>
                              {m.label}
                            </Text>
                            <Text className="text-base text-muted-foreground" selectable>
                              {m.id}
                            </Text>
                          </View>
                          {isSelected && <Check size={18} color={colors.foreground} />}
                        </Card>
                      </Pressable>
                    );
                  })}
                </View>
              )}
            </Pressable>
          </Pressable>
        </Modal>

        <View className="mt-8 px-5">
          <Button
            testID="btn-sign-out"
            onPress={() => {
              void signOut().then(() => {
                router.dismissAll();
                router.replace("/");
              });
            }}
            variant="destructive"
            size="lg"
            className="w-full"
          >
            <View className="flex-row items-center justify-center gap-2">
              <LogOut size={16} color={colors.danger.text} />
              <Text className="text-base font-semibold text-danger-text">
                Sign Out
              </Text>
            </View>
          </Button>
        </View>

        <View className="mt-6 px-5 items-center gap-1">
          <Text
            testID="build-info"
            className="text-xs text-muted-foreground"
            selectable
          >
            v{buildInfo.displayVersion}
          </Text>
          <Text
            testID="server-info"
            className="text-xs text-muted-foreground"
            selectable
          >
            Server: {buildInfo.serverLabel}
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
