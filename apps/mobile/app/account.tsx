import { useState, useEffect } from "react";
import {
  View,
  Text,
  Pressable,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  ActivityIndicator,
} from "react-native";
import { useRouter } from "expo-router";
import { ArrowLeft } from "lucide-react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Animated, { FadeInDown } from "react-native-reanimated";
import { useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { useAuth } from "@/lib/auth";

export default function AccountScreen() {
  const router = useRouter();
  const { profile, updateProfile } = useAuth();

  const [fullName, setFullName] = useState("");
  const [companyName, setCompanyName] = useState("");

  useEffect(() => {
    if (profile) {
      setFullName(profile.full_name ?? "");
      setCompanyName(profile.company_name ?? "");
    }
  }, [profile]);

  const { mutate: save, isPending, error } = useMutation({
    mutationFn: async () => {
      await updateProfile({
        full_name: fullName.trim() || null,
        company_name: companyName.trim() || null,
      });
    },
    onSuccess: () => {
      router.back();
    },
  });

  const errorMessage =
    error instanceof Error ? error.message : error ? "Failed to update profile." : null;

  if (!profile) {
    return (
      <SafeAreaView className="flex-1 bg-background">
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color="#1a1a2e" />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-background">
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        className="flex-1"
      >
        <View className="px-5 py-4">
          <Pressable
            onPress={() => router.back()}
            className="mb-5 flex-row items-center gap-2 self-start border border-foreground px-4 py-2 active:opacity-75"
            accessibilityRole="button"
            accessibilityLabel="Go back"
          >
            <ArrowLeft size={16} color="#1a1a2e" />
            <Text className="text-sm font-semibold uppercase tracking-wider text-foreground">
              Back
            </Text>
          </Pressable>
          <Text className="text-3xl font-bold tracking-tight text-foreground">
            Account Details
          </Text>
          <Text className="mt-1 text-lg text-muted-foreground">
            Update your name and company.
          </Text>
        </View>

        <Animated.View entering={FadeInDown.duration(150)} className="flex-1">
          <ScrollView
            className="flex-1 px-5"
            contentContainerStyle={{ gap: 20 }}
            keyboardShouldPersistTaps="handled"
          >
            <Input
              label="Phone"
              value={profile.phone}
              editable={false}
            />
            <Input
              label="Full Name"
              placeholder="e.g. Mike Torres"
              value={fullName}
              onChangeText={setFullName}
              editable={!isPending}
            />
            <Input
              label="Company Name"
              placeholder="e.g. Torres Construction LLC"
              value={companyName}
              onChangeText={setCompanyName}
              editable={!isPending}
            />
            {errorMessage && (
              <Text className="text-base text-destructive">{errorMessage}</Text>
            )}
          </ScrollView>

          <View className="p-5">
            <Button
              variant="hero"
              size="xl"
              className="w-full"
              onPress={() => save()}
              disabled={isPending}
            >
              {isPending ? "Saving..." : "Save Changes"}
            </Button>
          </View>
        </Animated.View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
