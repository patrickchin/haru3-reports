import { useState } from "react";
import { View, Text, Pressable } from "react-native";
import { Sheet } from "@/shared/components/Sheet";
import { TextField } from "@/shared/components/TextField";
import { Button } from "@/shared/components/Button";
import { testIds } from "@/infra/test-ids";

type InviteMemberSheetProps = {
  visible: boolean;
  onClose: () => void;
  onInvite: (phone: string, role: "editor" | "viewer") => Promise<void>;
};

export function InviteMemberSheet({
  visible,
  onClose,
  onInvite,
}: InviteMemberSheetProps) {
  const [phone, setPhone] = useState("");
  const [role, setRole] = useState<"editor" | "viewer">("editor");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleInvite = async () => {
    setError("");

    if (!phone.trim()) {
      setError("Phone number is required");
      return;
    }

    setIsSubmitting(true);
    try {
      await onInvite(phone, role);
      setPhone("");
      setRole("editor");
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add member");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Sheet visible={visible} onClose={onClose}>
      <Sheet.Title>Invite Member</Sheet.Title>
      <Sheet.Body>
        <View className="gap-4">
          <TextField
            label="Phone Number"
            value={phone}
            onChangeText={setPhone}
            placeholder="+1234567890"
            keyboardType="phone-pad"
            error={error}
            testID={testIds.projects.members.invitePhoneInput}
          />

          <View>
            <Text className="text-label text-muted-foreground uppercase mb-2">
              Role
            </Text>
            <View className="gap-2">
              <Pressable
                onPress={() => setRole("editor")}
                testID={testIds.projects.members.inviteRoleOption("editor")}
              >
                <View
                  className={`p-3 rounded-lg border ${
                    role === "editor"
                      ? "border-primary bg-primary"
                      : "border-border bg-card"
                  }`}
                >
                  <Text
                    className={`text-title-sm ${
                      role === "editor"
                        ? "text-primary-foreground"
                        : "text-foreground"
                    }`}
                  >
                    Editor
                  </Text>
                  <Text
                    className={`text-body ${
                      role === "editor"
                        ? "text-primary-foreground/80"
                        : "text-muted-foreground"
                    }`}
                  >
                    Can upload files and create reports
                  </Text>
                </View>
              </Pressable>

              <Pressable
                onPress={() => setRole("viewer")}
                testID={testIds.projects.members.inviteRoleOption("viewer")}
              >
                <View
                  className={`p-3 rounded-lg border ${
                    role === "viewer"
                      ? "border-primary bg-primary"
                      : "border-border bg-card"
                  }`}
                >
                  <Text
                    className={`text-title-sm ${
                      role === "viewer"
                        ? "text-primary-foreground"
                        : "text-foreground"
                    }`}
                  >
                    Viewer
                  </Text>
                  <Text
                    className={`text-body ${
                      role === "viewer"
                        ? "text-primary-foreground/80"
                        : "text-muted-foreground"
                    }`}
                  >
                    Can only view reports
                  </Text>
                </View>
              </Pressable>
            </View>
          </View>
        </View>
      </Sheet.Body>
      <Sheet.Actions>
        <Button variant="ghost" onPress={onClose}>
          <Text className="text-body">Cancel</Text>
        </Button>
        <Button
          onPress={handleInvite}
          loading={isSubmitting}
          testID={testIds.projects.members.inviteSubmitButton}
        >
          <Text className="text-body text-primary-foreground">Invite</Text>
        </Button>
      </Sheet.Actions>
    </Sheet>
  );
}
