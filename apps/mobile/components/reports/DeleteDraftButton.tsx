import { Alert, Text, View } from "react-native";
import { Trash2 } from "lucide-react-native";
import { Button } from "@/components/ui/Button";
import { buildDeleteDraftConfirmation } from "@/lib/draft-report-actions";

type DeleteDraftButtonProps = {
  accessibilityLabel?: string;
  isDeleting: boolean;
  onConfirmDelete: () => void;
};

export function DeleteDraftButton({
  accessibilityLabel = "Delete draft report",
  isDeleting,
  onConfirmDelete,
}: DeleteDraftButtonProps) {
  const handlePress = () => {
    const confirmation = buildDeleteDraftConfirmation(onConfirmDelete);
    Alert.alert(
      confirmation.title,
      confirmation.message,
      confirmation.buttons,
    );
  };

  return (
    <Button
      variant="outline"
      size="sm"
      className="self-start border-destructive"
      accessibilityLabel={accessibilityLabel}
      onPress={handlePress}
      disabled={isDeleting}
    >
      <View className="flex-row items-center gap-1.5">
        <Trash2 size={14} color="#e5383b" />
        <Text className="text-base font-semibold text-destructive">
          {isDeleting ? "Deleting..." : "Delete Draft"}
        </Text>
      </View>
    </Button>
  );
}
