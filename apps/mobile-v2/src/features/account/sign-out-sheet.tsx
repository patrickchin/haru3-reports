import { Text } from "react-native";
import { Sheet } from "@/shared/components/Sheet";
import { Button } from "@/shared/components/Button";
import { testIds } from "@/infra/test-ids";

type SignOutSheetProps = {
  visible: boolean;
  onClose: () => void;
  onConfirm: () => void;
  loading?: boolean;
};

export function SignOutSheet({
  visible,
  onClose,
  onConfirm,
  loading,
}: SignOutSheetProps) {
  return (
    <Sheet visible={visible} onClose={onClose}>
      <Sheet.Title>Sign Out</Sheet.Title>
      <Sheet.Body>
        <Text
          className="text-body text-muted-foreground"
          testID={testIds.account.signOutSheet}
        >
          Are you sure you want to sign out? You'll need to sign in again to
          access your account.
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
            Sign Out
          </Text>
        </Button>
      </Sheet.Actions>
    </Sheet>
  );
}
