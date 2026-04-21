// Bottom-sheet confirmation after capturing a photo.
// Shows the suggested attach target and lets the user accept, choose, or skip.

import { useState } from "react";
import {
  Modal,
  View,
  Text,
  Pressable,
  ScrollView,
  TextInput,
} from "react-native";
import { X } from "lucide-react-native";
import type {
  AttachSuggestion,
  AttachTarget,
} from "@/lib/image-attach-suggestion";

interface ImageAttachSheetProps {
  visible: boolean;
  suggestion: AttachSuggestion;
  otherTargets: AttachTarget[];
  initialCaption?: string;
  onConfirm: (params: {
    linkedTo: string | null;
    caption: string | null;
  }) => void;
  onCancel: () => void;
}

export function ImageAttachSheet({
  visible,
  suggestion,
  otherTargets,
  initialCaption = "",
  onConfirm,
  onCancel,
}: ImageAttachSheetProps) {
  const [caption, setCaption] = useState(initialCaption);
  const [picking, setPicking] = useState(false);

  const finish = (linkedTo: string | null) => {
    const trimmed = caption.trim();
    onConfirm({
      linkedTo,
      caption: trimmed ? trimmed : null,
    });
    setCaption("");
    setPicking(false);
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onCancel}
    >
      <View className="flex-1 justify-end bg-black/50">
        <View className="rounded-t-2xl bg-background p-5 pb-10">
          <View className="mb-3 flex-row items-center justify-between">
            <Text className="text-lg font-semibold text-foreground">
              Attach photo
            </Text>
            <Pressable onPress={onCancel}>
              <X size={22} />
            </Pressable>
          </View>

          {!picking && (
            <>
              {suggestion.target ? (
                <View className="mb-3 rounded-lg border border-border bg-surface-muted p-3">
                  <Text className="text-xs uppercase tracking-wide text-muted-foreground">
                    Suggested ({labelSource(suggestion.source)})
                  </Text>
                  <Text className="mt-1 text-base font-medium text-foreground">
                    {suggestion.target.label}
                  </Text>
                </View>
              ) : (
                <Text className="mb-3 text-sm text-muted-foreground">
                  No activity to attach to yet. Photo will go in the general
                  gallery.
                </Text>
              )}

              <Text className="mb-1 text-xs uppercase tracking-wide text-muted-foreground">
                Caption (optional)
              </Text>
              <TextInput
                className="mb-4 rounded-md border border-border bg-surface p-2 text-foreground"
                placeholder="e.g. Crack in the west wall"
                value={caption}
                onChangeText={setCaption}
              />

              <View className="gap-2">
                {suggestion.target && (
                  <Pressable
                    onPress={() => finish(suggestion.target!.linkedTo)}
                    className="items-center rounded-lg bg-primary p-3"
                  >
                    <Text className="font-semibold text-primary-foreground">
                      Attach to {suggestion.target.label}
                    </Text>
                  </Pressable>
                )}
                {otherTargets.length > 0 && (
                  <Pressable
                    onPress={() => setPicking(true)}
                    className="items-center rounded-lg border border-border p-3"
                  >
                    <Text className="font-semibold text-foreground">
                      Choose another…
                    </Text>
                  </Pressable>
                )}
                <Pressable
                  onPress={() => finish(null)}
                  className="items-center p-3"
                >
                  <Text className="text-muted-foreground">
                    Skip (add to general gallery)
                  </Text>
                </Pressable>
              </View>
            </>
          )}

          {picking && (
            <View className="gap-2">
              <Text className="text-xs uppercase tracking-wide text-muted-foreground">
                Choose target
              </Text>
              <ScrollView className="max-h-72">
                {otherTargets.map((t) => (
                  <Pressable
                    key={t.linkedTo}
                    onPress={() => finish(t.linkedTo)}
                    className="border-b border-border py-3"
                  >
                    <Text className="text-base text-foreground">{t.label}</Text>
                  </Pressable>
                ))}
              </ScrollView>
              <Pressable
                onPress={() => setPicking(false)}
                className="items-center p-3"
              >
                <Text className="text-muted-foreground">Back</Text>
              </Pressable>
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
}

function labelSource(source: AttachSuggestion["source"]): string {
  switch (source) {
    case "ai":
      return "AI pick";
    case "preceding-note":
      return "nearest note";
    case "last-activity":
      return "most recent activity";
    default:
      return "";
  }
}
