import { useState, useEffect } from "react";
import {
  View,
  Text,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  ActivityIndicator,
  Alert,
} from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { Trash2 } from "lucide-react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Animated, { FadeInDown } from "react-native-reanimated";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { InlineNotice } from "@/components/ui/InlineNotice";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
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

  const { mutate: deleteProject, isPending: isDeletePending } = useMutation({
    mutationFn: async () => {
      const { error } = await backend.from("projects").delete().eq("id", projectId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["projects"] });
      router.dismissAll();
      router.replace("/(tabs)/projects");
    },
    onError: (err) => {
      Alert.alert(
        "Delete Failed",
        err instanceof Error ? err.message : "Failed to delete site.",
      );
    },
  });

  const confirmDelete = () => {
    Alert.alert(
      "Delete Site",
      "This site and all its reports will be permanently deleted. This cannot be undone.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => deleteProject(),
        },
      ],
    );
  };

  const handleSubmit = () => {
    if (!name.trim()) {
      setValidationError("Site name is required.");
      return;
    }
    setValidationError(null);
    updateProject();
  };

  const errorMessage =
    validationError ??
    (mutationError instanceof Error ? mutationError.message : mutationError ? "Failed to update site." : null);

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
        <View className="px-5 py-4">
          <ScreenHeader
            title="Edit Site"
            onBack={() => router.back()}
            backLabel="Reports"
          />
        </View>

        <Animated.View entering={FadeInDown.duration(150)} className="flex-1">
          <ScrollView
            className="flex-1 px-5"
            contentContainerStyle={{ gap: 20, paddingBottom: 28 }}
            automaticallyAdjustKeyboardInsets
            keyboardDismissMode="interactive"
            keyboardShouldPersistTaps="handled"
          >
            <Input
              label="Site Name"
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
              <InlineNotice tone="danger">{errorMessage}</InlineNotice>
            )}

            <InlineNotice tone="warning" title="Use delete carefully">
              Deleting a site permanently removes the site and all its reports. Save normal detail changes with the primary action below.
            </InlineNotice>

            <Button
              variant="destructive"
              size="default"
              className="self-start"
              onPress={confirmDelete}
              disabled={isDeletePending}
            >
              <View className="flex-row items-center gap-2">
                <Trash2 size={16} color="#8f1d18" />
                <Text className="text-base font-semibold text-danger-text">
                  {isDeletePending ? "Deleting..." : "Delete Site"}
                </Text>
              </View>
            </Button>
            <Button
              variant="hero"
              size="xl"
              className="w-full"
              onPress={handleSubmit}
              disabled={isPending}
            >
              {isPending ? "Saving..." : "Save Changes"}
            </Button>
          </ScrollView>
        </Animated.View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
