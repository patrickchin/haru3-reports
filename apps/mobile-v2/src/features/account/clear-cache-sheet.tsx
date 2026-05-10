import { Text } from "react-native";
import { Sheet } from "@/shared/components/Sheet";
import { Button } from "@/shared/components/Button";
import { testIds } from "@/infra/test-ids";

type ClearCacheSheetProps = {
  visible: boolean;
  onClose: () => void;
  onConfirm: () => void;
  loading?: boolean;
};

export function ClearCacheSheet({
  visible,
  onClose,
  onConfirm,
  loading,
}: ClearCacheSheetProps) {
  return (
    <Sheet visible={visible} onClose={onClose}>
      <Sheet.Title>Clear Cache</Sheet.Title>
      <Sheet.Body>
        <Text
          className="text-body text-muted-foreground"
          testID={testIds.account.clearCacheSheet}
        >
          This will clear all cached data and force a refresh from the server.
          Your authentication will be preserved.
        </Text>
      </Sheet.Body>
      <Sheet.Actions>
        <Button
          variant="ghost"
          onPress={onClose}
          disabled={loading}
          className="flex-1"
        >
          <Text className="text-body text-foreground font-semibold">
            Cancel
          </Text>
        </Button>
        <Button
          variant="destructive"
          onPress={onConfirm}
          loading={loading}
          disabled={loading}
          className="flex-1"
        >
          <Text className="text-body text-primary-foreground font-semibold">
            Clear Cache
          </Text>
        </Button>
      </Sheet.Actions>
    </Sheet>
  );
}
