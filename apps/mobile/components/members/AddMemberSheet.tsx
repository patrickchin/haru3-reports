import { useState } from "react";
import { KeyboardAvoidingView, Modal, Platform, Pressable, Text, View } from "react-native";
import { X } from "lucide-react-native";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { InlineNotice } from "@/components/ui/InlineNotice";
import { ROLE_LABELS, ROLE_OPTIONS, type MemberRole } from "@/lib/project-members";

interface AddMemberSheetProps {
  visible: boolean;
  onClose: () => void;
  onAdd: (phone: string, role: MemberRole) => Promise<void>;
}

export function AddMemberSheet({ visible, onClose, onAdd }: AddMemberSheetProps) {
  const [phone, setPhone] = useState("");
  const [role, setRole] = useState<MemberRole>("viewer");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const reset = () => {
    setPhone("");
    setRole("viewer");
    setError(null);
    setIsSubmitting(false);
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const handleAdd = async () => {
    const trimmed = phone.trim();
    if (!trimmed) {
      setError("Please enter a phone number.");
      return;
    }

    setError(null);
    setIsSubmitting(true);
    try {
      await onAdd(trimmed, role);
      handleClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add member.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={handleClose}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        className="flex-1"
      >
        <Pressable className="flex-1 justify-end bg-black/40" onPress={handleClose}>
          <Pressable onPress={(e) => e.stopPropagation()} className="bg-background pb-10">
          <View className="flex-row items-center justify-between border-b border-border px-5 py-4">
            <Text className="text-xl font-bold text-foreground">Add Member</Text>
            <Pressable onPress={handleClose} hitSlop={12}>
              <X size={20} color="#5c5c6e" />
            </Pressable>
          </View>

          <View className="gap-4 px-5 pt-4">
            <Input
              label="Phone number"
              placeholder="+1 555 123 4567"
              value={phone}
              onChangeText={setPhone}
              keyboardType="phone-pad"
              autoComplete="tel"
              autoFocus
            />

            <View className="gap-2">
              <Text className="text-label text-muted-foreground">Role</Text>
              <View className="flex-row gap-2">
                {ROLE_OPTIONS.map((opt) => {
                  const isSelected = opt === role;
                  return (
                    <Pressable
                      key={opt}
                      onPress={() => setRole(opt)}
                      className={`flex-1 items-center rounded-md border px-3 py-2.5 ${
                        isSelected
                          ? "border-primary bg-primary"
                          : "border-border bg-card"
                      }`}
                      accessibilityRole="radio"
                      accessibilityState={{ selected: isSelected }}
                    >
                      <Text
                        className={`text-sm font-semibold ${
                          isSelected ? "text-primary-foreground" : "text-foreground"
                        }`}
                      >
                        {ROLE_LABELS[opt]}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>

            {error ? (
              <InlineNotice tone="danger">{error}</InlineNotice>
            ) : null}

            <View className="gap-3">
              <Button onPress={handleAdd} disabled={isSubmitting}>
                <Text className="text-base font-semibold text-primary-foreground">
                  {isSubmitting ? "Adding…" : "Add Member"}
                </Text>
              </Button>
              <Button variant="ghost" onPress={handleClose}>
                <Text className="text-base font-semibold text-muted-foreground">
                  Cancel
                </Text>
              </Button>
            </View>
          </View>
        </Pressable>
      </Pressable>
      </KeyboardAvoidingView>
    </Modal>
  );
}
