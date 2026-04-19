import { useState, useEffect } from "react";
import { View, Text, KeyboardAvoidingView, Platform, ScrollView } from "react-native";
import { HardHat } from "lucide-react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Animated, { FadeInDown } from "react-native-reanimated";
import { useRouter } from "expo-router";
import { useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { useAuth } from "@/lib/auth";

export default function OnboardingScreen() {
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

  useEffect(() => {
    if (profile?.full_name && profile?.company_name) {
      router.replace("/(tabs)/projects");
    }
  }, [profile]);

  const {
    mutate: save,
    isPending,
    error,
  } = useMutation({
    mutationFn: async () => {
      const trimmedName = fullName.trim();
      const trimmedCompany = companyName.trim();

      if (trimmedName.length < 2) {
        throw new Error("Please enter your full name.");
      }
      if (trimmedCompany.length < 2) {
        throw new Error("Please enter your company name.");
      }

      await updateProfile({
        full_name: trimmedName,
        company_name: trimmedCompany,
      });
    },
    onSuccess: () => {
      router.replace("/(tabs)/projects");
    },
  });

  const errorMessage =
    error instanceof Error ? error.message : error ? "Failed to save profile." : null;

  return (
    <SafeAreaView className="flex-1 bg-background">
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        className="flex-1"
      >
        <ScrollView
          className="flex-1"
          contentContainerClassName="grow items-center justify-center px-6"
          keyboardShouldPersistTaps="handled"
        >
          <Animated.View
            entering={FadeInDown.duration(200).springify()}
            className="w-full max-w-sm"
          >
            <View className="flex-row items-center gap-3">
              <View className="h-12 w-12 items-center justify-center bg-primary">
                <HardHat size={24} color="#f8f6f1" />
              </View>
              <View>
                <Text className="text-3xl font-bold tracking-tight text-foreground">
                  Welcome
                </Text>
                <Text className="text-base text-muted-foreground">
                  Complete your profile to get started
                </Text>
              </View>
            </View>

            <View className="mt-10 gap-4">
              <Input
                label="Full Name"
                placeholder="John Smith"
                value={fullName}
                onChangeText={setFullName}
                autoComplete="name"
                autoCapitalize="words"
                editable={!isPending}
                autoFocus
              />
              <Input
                label="Company Name"
                placeholder="Smith Construction LLC"
                value={companyName}
                onChangeText={setCompanyName}
                autoComplete="organization"
                autoCapitalize="words"
                editable={!isPending}
              />

              {errorMessage && (
                <Text className="text-base text-destructive">
                  {errorMessage}
                </Text>
              )}

              <Button
                variant="hero"
                size="xl"
                className="w-full"
                onPress={() => save()}
                disabled={isPending}
              >
                {isPending ? "Saving..." : "Get Started"}
              </Button>
            </View>
          </Animated.View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
