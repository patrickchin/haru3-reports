import { useState } from "react";
import {
  View,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import Animated, { FadeInDown } from "react-native-reanimated";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { InlineNotice } from "@/components/ui/InlineNotice";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
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
      setValidationError("Site name is required.");
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
          <ScreenHeader
            title="New Site"
            subtitle="Add a jobsite so daily notes and reports have a home."
            onBack={() => router.back()}
            backLabel="Sites"
          />
        </View>

        <Animated.View
          entering={FadeInDown.duration(150)}
          className="flex-1"
        >
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
              hint="Use the site name your team uses on-site."
            />
            <Input
              label="Site Address"
              placeholder="e.g. 2400 Highland Ave, Austin TX"
              value={address}
              onChangeText={setAddress}
              editable={!isPending}
              hint="Optional, but helpful for exported reports and navigation context."
            />
            <Input
              label="Client Name"
              placeholder="e.g. Acme Construction Co."
              value={client}
              onChangeText={setClient}
              editable={!isPending}
              hint="Optional. Include it when the client name should appear in report context."
            />
            {(validationError ?? (error instanceof Error ? error.message : error ? "Failed to create site." : null)) ? (
              <InlineNotice tone="danger">
                {validationError ?? (error instanceof Error ? error.message : "Failed to create site.")}
              </InlineNotice>
            ) : null}
            <Button variant="hero" size="xl" className="w-full" onPress={handleSubmit} disabled={isPending}>
              {isPending ? "Creating..." : "Create Site"}
            </Button>
          </ScrollView>
        </Animated.View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
