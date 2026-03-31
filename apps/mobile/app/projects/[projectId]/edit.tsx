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
import { useRouter, useLocalSearchParams } from "expo-router";
import { ArrowLeft } from "lucide-react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Animated, { FadeInDown } from "react-native-reanimated";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { backend } from "@/lib/backend";

export default function EditProjectScreen() {
  const router = useRouter();
  const { projectId } = useLocalSearchParams<{ projectId: string }>();
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["project", projectId],
    queryFn: async () => {
      const { data, error } = await backend
        .from("projects")
        .select("name, address, client_name")
        .eq("id", projectId)
        .single();
      if (error) throw error;
      return data;
    },
  });

  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [client, setClient] = useState("");
  const [validationError, setValidationError] = useState<string | null>(null);

  useEffect(() => {
    if (data) {
      setName(data.name ?? "");
      setAddress(data.address ?? "");
      setClient(data.client_name ?? "");
    }
  }, [data]);

  const { mutate: updateProject, isPending, error: mutationError } = useMutation({
    mutationFn: async () => {
      const { error } = await backend
        .from("projects")
        .update({
          name: name.trim(),
          address: address.trim() || null,
          client_name: client.trim() || null,
        })
        .eq("id", projectId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["projects"] });
      queryClient.invalidateQueries({ queryKey: ["project", projectId] });
      router.back();
    },
  });

  const handleSubmit = () => {
    if (!name.trim()) {
      setValidationError("Project name is required.");
      return;
    }
    setValidationError(null);
    updateProject();
  };

  const errorMessage =
    validationError ??
    (mutationError instanceof Error ? mutationError.message : mutationError ? "Failed to update project." : null);

  if (isLoading) {
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
        <View className="px-5 pt-4 pb-4">
          <Pressable
            onPress={() => router.back()}
            className="mb-5 flex-row items-center gap-2 self-start border border-foreground px-4 py-2 active:opacity-75"
            accessibilityRole="button"
            accessibilityLabel="Go back"
          >
            <ArrowLeft size={16} color="#1a1a2e" />
            <Text className="text-sm font-semibold uppercase tracking-wider text-foreground">Back</Text>
          </Pressable>
          <Text className="text-3xl font-bold tracking-tight text-foreground">
            Edit Project
          </Text>
          <Text className="mt-1 text-lg text-muted-foreground">
            Update project details.
          </Text>
        </View>

        <Animated.View entering={FadeInDown.duration(150)} className="flex-1">
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
            {errorMessage && (
              <Text className="text-base text-destructive">{errorMessage}</Text>
            )}
          </ScrollView>

          <View className="px-5 py-5">
            <Button
              variant="hero"
              size="xl"
              className="w-full"
              onPress={handleSubmit}
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
