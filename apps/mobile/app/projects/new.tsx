import { useState } from "react";
import {
  View,
  Text,
  Pressable,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from "react-native";
import { useRouter } from "expo-router";
import { ArrowLeft } from "lucide-react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Animated, { FadeInDown } from "react-native-reanimated";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";

export default function AddProjectScreen() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [client, setClient] = useState("");

  const handleSubmit = () => {
    router.back();
  };

  return (
    <SafeAreaView className="flex-1 bg-background">
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        className="flex-1"
      >
        <View className="px-5 pt-4 pb-4">
          <Pressable
            onPress={() => router.back()}
            className="mb-5 flex-row items-center gap-2 self-start rounded-full bg-foreground px-4 py-2 active:opacity-75"
          >
            <ArrowLeft size={16} color="#ffffff" />
            <Text className="text-sm font-semibold text-background">Back</Text>
          </Pressable>
          <Text className="text-2xl font-bold tracking-tight text-foreground">
            New Project
          </Text>
          <Text className="mt-1 text-base text-muted-foreground">
            Add a construction site to start logging.
          </Text>
        </View>

        <Animated.View
          entering={FadeInDown.duration(150)}
          className="flex-1"
        >
          <ScrollView
            className="flex-1 px-5"
            contentContainerStyle={{ gap: 20 }}
            keyboardShouldPersistTaps="handled"
          >
            <Input
              label="Project Name"
              placeholder="e.g. Highland Tower Complex"
              value={name}
              onChangeText={setName}
            />
            <Input
              label="Site Address"
              placeholder="e.g. 2400 Highland Ave, Austin TX"
              value={address}
              onChangeText={setAddress}
            />
            <Input
              label="Client Name"
              placeholder="e.g. Acme Construction Co."
              value={client}
              onChangeText={setClient}
            />
          </ScrollView>

          <View className="px-5 py-5">
            <Button variant="hero" size="xl" className="w-full" onPress={handleSubmit}>
              Create Project
            </Button>
          </View>
        </Animated.View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
