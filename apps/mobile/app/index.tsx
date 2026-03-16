import { useState } from "react";
import { View, Text, Pressable, KeyboardAvoidingView, Platform } from "react-native";
import { useRouter } from "expo-router";
import { HardHat } from "lucide-react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Animated, { FadeInDown } from "react-native-reanimated";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";

export default function LoginScreen() {
  const router = useRouter();
  const [phone, setPhone] = useState("");

  const handleLogin = () => {
    router.replace("/(tabs)/projects");
  };

  return (
    <SafeAreaView className="flex-1 bg-background">
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        className="flex-1"
      >
        <View className="flex-1 items-center justify-center px-6">
          <Animated.View
            entering={FadeInDown.duration(400).springify()}
            className="w-full max-w-sm"
          >
            <View className="gap-3">
              <View className="flex-row items-center gap-3">
                <View className="h-12 w-12 items-center justify-center rounded-lg bg-primary">
                  <HardHat size={24} color="#ffffff" />
                </View>
                <Text className="text-2xl font-bold tracking-tight text-foreground">
                  SiteLog AI v3
                </Text>
              </View>
              <Text className="text-4xl font-extrabold tracking-tight text-foreground">
                {"Field-First\nReporting."}
              </Text>
              <Text className="text-base text-muted-foreground">
                Capture site data with voice. Let AI structure your reports.
              </Text>
            </View>

            <View className="mt-10 gap-4">
              <Input
                label="Phone Number"
                placeholder="+1 (555) 000-0000"
                value={phone}
                onChangeText={setPhone}
                keyboardType="phone-pad"
                autoComplete="tel"
              />
              <Button variant="hero" size="xl" className="w-full" onPress={handleLogin}>
                Get Started
              </Button>
            </View>

            <Text className="mt-10 text-center text-xs text-muted-foreground">
              By continuing, you agree to our Terms of Service.
            </Text>
          </Animated.View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
