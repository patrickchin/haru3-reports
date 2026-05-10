import { useState } from "react";
import { View, Text, Pressable, ScrollView } from "react-native";
import { useRouter } from "expo-router";
import Constants from "expo-constants";
import { User, ChevronRight, LogOut, Trash2, Info } from "lucide-react-native";
import { Screen } from "@/shared/components/Screen";
import { Card } from "@/shared/components/Card";
import { Button } from "@/shared/components/Button";
import { useAuth } from "@/features/auth";
import { useClearLocalCache } from "@/features/account/mutations";
import { SignOutSheet } from "@/features/account/sign-out-sheet";
import { ClearCacheSheet } from "@/features/account/clear-cache-sheet";
import { colors } from "@/design-tokens/colors";
import { testIds } from "@/infra/test-ids";

export default function AccountScreen() {
  const router = useRouter();
  const { profile, signOut } = useAuth();
  const clearCache = useClearLocalCache();
  const [signOutSheetVisible, setSignOutSheetVisible] = useState(false);
  const [clearCacheSheetVisible, setClearCacheSheetVisible] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);

  const handleSignOut = async () => {
    setIsSigningOut(true);
    try {
      await signOut();
      router.replace("/sign-in");
    } catch (error) {
      console.error("Failed to sign out", error);
    } finally {
      setIsSigningOut(false);
      setSignOutSheetVisible(false);
    }
  };

  const handleClearCache = async () => {
    try {
      await clearCache.mutateAsync();
      setClearCacheSheetVisible(false);
    } catch (error) {
      console.error("Failed to clear cache", error);
    }
  };

  const appVersion = Constants.expoConfig?.version ?? "unknown";
  const buildNumber = Constants.expoConfig?.ios?.buildNumber ?? "unknown";
  const env = process.env.EXPO_PUBLIC_SUPABASE_URL?.includes("localhost")
    ? "local"
    : process.env.EXPO_PUBLIC_SUPABASE_URL?.includes("staging")
      ? "staging"
      : "production";

  return (
    <Screen testID={testIds.account.screen}>
      <ScrollView className="flex-1 px-6 py-8">
        <Text className="text-title text-foreground mb-6">Account</Text>

        {/* User Info Card */}
        <Card className="mb-4" testID="account-avatar">
          <View className="flex-row items-center gap-4">
            <View className="h-14 w-14 items-center justify-center rounded-full bg-primary">
              <User size={28} color={colors.primary.foreground} />
            </View>
            <View className="flex-1">
              <Text
                className="text-body text-foreground font-semibold mb-0.5"
                testID={testIds.account.name}
              >
                {profile?.full_name ?? "User"}
              </Text>
              <Text
                className="text-body text-muted-foreground"
                testID={testIds.account.email}
              >
                {profile?.phone ?? "No phone"}
              </Text>
              {profile?.company_name && (
                <Text
                  className="text-sm text-muted-foreground"
                  testID={testIds.account.company}
                >
                  {profile.company_name}
                </Text>
              )}
            </View>
          </View>
        </Card>

        {/* Navigation Links */}
        <View className="gap-2 mb-6">
          <Pressable
            onPress={() => router.push("/profile")}
            testID={testIds.account.linkProfile}
          >
            <Card className="flex-row items-center justify-between">
              <Text className="text-body text-foreground">Edit Profile</Text>
              <ChevronRight size={20} color={colors.muted.foreground} />
            </Card>
          </Pressable>

          <Pressable
            onPress={() => router.push("/usage")}
            testID={testIds.account.linkUsage}
          >
            <Card className="flex-row items-center justify-between">
              <Text className="text-body text-foreground">Usage & Billing</Text>
              <ChevronRight size={20} color={colors.muted.foreground} />
            </Card>
          </Pressable>
        </View>

        {/* App Info Section */}
        <Card className="mb-6">
          <View className="flex-row items-center gap-2 mb-3">
            <Info size={18} color={colors.foreground} />
            <Text className="text-body text-foreground font-semibold">
              App Information
            </Text>
          </View>
          <View className="gap-2">
            <View className="flex-row justify-between">
              <Text className="text-sm text-muted-foreground">Version</Text>
              <Text
                className="text-sm text-foreground"
                testID="build-info"
              >
                {appVersion}
              </Text>
            </View>
            <View className="flex-row justify-between">
              <Text className="text-sm text-muted-foreground">Build</Text>
              <Text
                className="text-sm text-foreground"
                testID="build-info"
              >
                {buildNumber}
              </Text>
            </View>
            <View className="flex-row justify-between">
              <Text className="text-sm text-muted-foreground">Environment</Text>
              <Text
                className="text-sm text-foreground"
                testID="server-info"
              >
                {env}
              </Text>
            </View>
          </View>
        </Card>

        {/* Actions */}
        <View className="gap-3">
          <Button
            variant="ghost"
            onPress={() => setClearCacheSheetVisible(true)}
            testID={testIds.account.btnClearCache}
          >
            <View className="flex-row items-center gap-2">
              <Trash2 size={18} color={colors.foreground} />
              <Text className="text-body text-foreground font-semibold">
                Clear Cache
              </Text>
            </View>
          </Button>

          <Button
            variant="destructive"
            onPress={() => setSignOutSheetVisible(true)}
            testID={testIds.account.btnSignOut}
          >
            <View className="flex-row items-center gap-2">
              <LogOut size={18} color={colors.primary.foreground} />
              <Text className="text-body text-primary-foreground font-semibold">
                Sign Out
              </Text>
            </View>
          </Button>
        </View>
      </ScrollView>

      <SignOutSheet
        visible={signOutSheetVisible}
        onClose={() => setSignOutSheetVisible(false)}
        onConfirm={handleSignOut}
        loading={isSigningOut}
      />

      <ClearCacheSheet
        visible={clearCacheSheetVisible}
        onClose={() => setClearCacheSheetVisible(false)}
        onConfirm={handleClearCache}
        loading={clearCache.isPending}
      />
    </Screen>
  );
}

