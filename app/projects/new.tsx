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
            className="mb-4 flex-row items-center gap-1"
          >
            <ArrowLeft size={16} color="#6e6e77" />
            <Text className="text-sm text-muted-foreground">Back</Text>
          </Pressable>
          <Text className="text-2xl font-bold tracking-tight text-foreground">
            New Project
          </Text>
          <Text className="mt-1 text-sm text-muted-foreground">
            Add a construction site to start logging.
          </Text>
        </View>

        <Animated.View
          entering={FadeInDown.duration(300)}
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
