import { useState } from "react";
import {
  View,
  KeyboardAvoidingView,
  ScrollView,
} from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import Animated, { FadeInDown } from "react-native-reanimated";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { InlineNotice } from "@/components/ui/InlineNotice";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { useLocalProjectMutations } from "@/hooks/useLocalProjects";

export default function AddProjectScreen() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [client, setClient] = useState("");
  const [validationError, setValidationError] = useState<string | null>(null);

  const { create } = useLocalProjectMutations();
  const isPending = create.isPending;
  const error = create.error;

  const handleSubmit = () => {
    if (!name.trim()) {
      setValidationError("Project name is required.");
      return;
    }
    setValidationError(null);
    create.mutate(
      {
        name: name.trim(),
        address: address.trim() || null,
        clientName: client.trim() || null,
      },
      {
        onSuccess: () => {
          router.replace("/(tabs)/projects");
        },
      },
    );
  };

  return (
    <SafeAreaView className="flex-1 bg-background">
      <KeyboardAvoidingView
        behavior="padding"
        className="flex-1"
      >
        <View className="px-5 py-4">
          <ScreenHeader
            title="New Project"
            onBack={() => router.back()}
            backLabel="Projects"
          />
        </View>

        <Animated.View
          entering={FadeInDown.duration(200)}
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
              testID="input-project-name"
              label="Project Name"
              placeholder="e.g. Highland Tower Complex"
              value={name}
              onChangeText={(v) => { setName(v); setValidationError(null); }}
              editable={!isPending}
            />
            <Input
              testID="input-project-address"
              label="Project Address"
              placeholder="e.g. 2400 Highland Ave, Austin TX"
              value={address}
              onChangeText={setAddress}
              editable={!isPending}
            />
            <Input
              testID="input-client-name"
              label="Client Name"
              placeholder="e.g. Acme Construction Co."
              value={client}
              onChangeText={setClient}
              editable={!isPending}
            />
            {(validationError ?? (error instanceof Error ? error.message : error ? "Failed to create project." : null)) ? (
              <InlineNotice tone="danger">
                {validationError ?? (error instanceof Error ? error.message : "Failed to create project.")}
              </InlineNotice>
            ) : null}
            <Button testID="btn-submit-project" variant="hero" size="xl" className="w-full" onPress={handleSubmit} disabled={isPending}>
              {isPending ? "Creating..." : "Create Project"}
            </Button>
          </ScrollView>
        </Animated.View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
