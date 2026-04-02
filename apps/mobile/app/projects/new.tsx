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
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { backend } from "@/lib/backend";
import { useAuth } from "@/lib/auth";

export default function AddProjectScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [client, setClient] = useState("");
  const [validationError, setValidationError] = useState<string | null>(null);

  const { mutate: createProject, isPending, error } = useMutation({
    mutationFn: async () => {
      const { data, error } = await backend
        .from("projects")
        .insert({
          name: name.trim(),
          address: address.trim() || null,
          client_name: client.trim() || null,
          owner_id: user!.id,
        })
        .select("id")
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["projects"] });
      router.replace("/(tabs)/projects");
    },
  });

  const handleSubmit = () => {
    if (!name.trim()) {
      setValidationError("Project name is required.");
      return;
    }
    setValidationError(null);
    createProject();
  };

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
          >
            <ArrowLeft size={16} color="#1a1a2e" />
            <Text className="text-sm font-semibold uppercase tracking-wider text-foreground">Back</Text>
          </Pressable>
          <Text className="text-3xl font-bold tracking-tight text-foreground">
            New Project
          </Text>
          <Text className="mt-1 text-lg text-muted-foreground">
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
              onChangeText={(v) => { setName(v); setValidationError(null); }}
              editable={!isPending}
            />
            <Input
              label="Site Address"
              placeholder="e.g. 2400 Highland Ave, Austin TX"
              value={address}
              onChangeText={setAddress}
              editable={!isPending}
            />
            <Input
              label="Client Name"
              placeholder="e.g. Acme Construction Co."
              value={client}
              onChangeText={setClient}
              editable={!isPending}
            />
            {(validationError ?? (error instanceof Error ? error.message : error ? "Failed to create project." : null)) ? (
              <Text className="text-base text-destructive">
                {validationError ?? (error instanceof Error ? error.message : "Failed to create project.")}
              </Text>
            ) : null}
          </ScrollView>

          <View className="p-5">
            <Button variant="hero" size="xl" className="w-full" onPress={handleSubmit} disabled={isPending}>
              {isPending ? "Creating..." : "Create Project"}
            </Button>
          </View>
        </Animated.View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
