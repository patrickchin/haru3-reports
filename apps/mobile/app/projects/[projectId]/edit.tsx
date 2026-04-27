import { useState, useEffect } from "react";
import {
  View,
  Text,
  KeyboardAvoidingView,
  ScrollView,
  ActivityIndicator,
} from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { Trash2 } from "lucide-react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Animated, { FadeInDown } from "react-native-reanimated";
import { AppDialogSheet } from "@/components/ui/AppDialogSheet";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { InlineNotice } from "@/components/ui/InlineNotice";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { type AppDialogCopy, getActionErrorDialogCopy, getDeleteProjectDialogCopy } from "@/lib/app-dialog-copy";
import { useLocalProject, useLocalProjectMutations } from "@/hooks/useLocalProjects";

interface ProjectDialogSheetState extends AppDialogCopy {
  kind: "error" | "confirm-delete";
}

export default function EditProjectScreen() {
  const router = useRouter();
  const { projectId } = useLocalSearchParams<{ projectId: string }>();

  const { data, isLoading } = useLocalProject(projectId);

  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [client, setClient] = useState("");
  const [validationError, setValidationError] = useState<string | null>(null);
  const [dialogSheet, setDialogSheet] = useState<ProjectDialogSheetState | null>(null);

  useEffect(() => {
    if (data) {
      setName(data.name ?? "");
      setAddress(data.address ?? "");
      setClient(data.client_name ?? "");
    }
  }, [data]);

  const { update, remove } = useLocalProjectMutations();
  const isPending = update.isPending;
  const mutationError = update.error;
  const isDeletePending = remove.isPending;

  const updateProject = () =>
    update.mutate(
      {
        id: projectId,
        fields: {
          name: name.trim(),
          address: address.trim() || null,
          client_name: client.trim() || null,
        },
      },
      {
        onSuccess: () => {
          router.back();
        },
      },
    );

  const deleteProject = () =>
    remove.mutate(projectId, {
      onSuccess: () => {
        router.dismissAll();
        router.replace("/(tabs)/projects");
      },
      onError: (err) => {
        setDialogSheet({
          kind: "error",
          ...getActionErrorDialogCopy({
            title: "Delete Failed",
            fallbackMessage: "Failed to delete project.",
            message:
              err instanceof Error ? err.message : "Failed to delete project.",
          }),
        });
      },
    });

  const confirmDelete = () => {
    setDialogSheet({
      kind: "confirm-delete",
      ...getDeleteProjectDialogCopy(),
    });
  };

  const closeDialogSheet = () => {
    if (isDeletePending && dialogSheet?.kind === "confirm-delete") {
      return;
    }

    setDialogSheet(null);
  };

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
  const canDismissDialogSheet =
    dialogSheet?.kind !== "confirm-delete" || !isDeletePending;

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
        behavior="padding"
        className="flex-1"
      >
        <View className="px-5 py-4">
          <ScreenHeader
            title="Edit Project"
            onBack={() => router.back()}
            backLabel="Overview"
          />
        </View>

        <Animated.View entering={FadeInDown.duration(200)} className="flex-1">
          <ScrollView
            className="flex-1 px-5"
            contentContainerStyle={{ gap: 20, paddingBottom: 28 }}
            automaticallyAdjustKeyboardInsets
            keyboardDismissMode="interactive"
            keyboardShouldPersistTaps="handled"
          >
            <Input
              label="Project Name"
              placeholder="e.g. Highland Tower Complex"
              value={name}
              onChangeText={(v) => { setName(v); setValidationError(null); }}
              editable={!isPending}
              testID="input-edit-project-name"
            />
            <Input
              label="Project Address"
              placeholder="e.g. 2400 Highland Ave, Austin TX"
              value={address}
              onChangeText={setAddress}
              editable={!isPending}
              testID="input-edit-project-address"
            />
            <Input
              label="Client Name"
              placeholder="e.g. Acme Construction Co."
              value={client}
              onChangeText={setClient}
              editable={!isPending}
              testID="input-edit-client-name"
            />
            {errorMessage && (
              <InlineNotice tone="danger">{errorMessage}</InlineNotice>
            )}

            <InlineNotice tone="warning" title="Use delete carefully">
              Deleting a project permanently removes the project and all its reports. Save normal detail changes with the primary action below.
            </InlineNotice>

            <Button
              variant="destructive"
              size="default"
              className="self-start"
              onPress={confirmDelete}
              disabled={isDeletePending}
              testID="btn-delete-project"
            >
              <View className="flex-row items-center gap-2">
                <Trash2 size={16} color="#8f1d18" />
                <Text className="text-base font-semibold text-danger-text">
                  {isDeletePending ? "Deleting..." : "Delete Project"}
                </Text>
              </View>
            </Button>
            <Button
              variant="hero"
              size="xl"
              className="w-full"
              onPress={handleSubmit}
              disabled={isPending}
              testID="btn-save-project"
            >
              {isPending ? "Saving..." : "Save Changes"}
            </Button>
          </ScrollView>
        </Animated.View>

        <AppDialogSheet
          visible={dialogSheet !== null}
          title={dialogSheet?.title ?? "Project Action"}
          message={dialogSheet?.message ?? ""}
          noticeTone={dialogSheet?.tone ?? "danger"}
          noticeTitle={dialogSheet?.noticeTitle}
          onClose={closeDialogSheet}
          canDismiss={canDismissDialogSheet}
          actions={
            dialogSheet?.kind === "confirm-delete"
              ? [
                  {
                    label: isDeletePending ? "Deleting..." : dialogSheet.confirmLabel,
                    variant: dialogSheet.confirmVariant,
                    onPress: () => deleteProject(),
                    disabled: isDeletePending,
                    accessibilityLabel: "Confirm delete project",
                    align: "start",
                  },
                  {
                    label: dialogSheet.cancelLabel ?? "Cancel",
                    variant: "quiet",
                    onPress: closeDialogSheet,
                    disabled: isDeletePending,
                    accessibilityLabel: "Cancel delete project",
                  },
                ]
              : dialogSheet
                ? [
                    {
                      label: dialogSheet.confirmLabel,
                      variant: dialogSheet.confirmVariant,
                      onPress: closeDialogSheet,
                      accessibilityLabel: "Dismiss project action dialog",
                    },
                  ]
                : []
          }
        />
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
