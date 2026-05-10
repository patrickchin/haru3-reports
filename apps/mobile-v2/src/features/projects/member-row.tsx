import { useState } from "react";
import { Text, View, Pressable } from "react-native";
import { Card } from "@/shared/components/Card";
import { Sheet } from "@/shared/components/Sheet";
import { Button } from "@/shared/components/Button";
import { testIds } from "@/infra/test-ids";
import type { MemberWithProfile } from "./queries";

type MemberRowProps = {
  member: MemberWithProfile;
  isOwner: boolean;
  canManage: boolean;
  onChangeRole?: (memberId: string, role: "editor" | "viewer") => void;
  onRemove?: (memberId: string) => void;
};

export function MemberRow({
  member,
  isOwner,
  canManage,
  onChangeRole,
  onRemove,
}: MemberRowProps) {
  const [showRoleSheet, setShowRoleSheet] = useState(false);
  const [showRemoveSheet, setShowRemoveSheet] = useState(false);

  const roleLabel =
    member.role === "owner"
      ? "Owner"
      : member.role.charAt(0).toUpperCase() + member.role.slice(1);

  const handleRoleChange = (newRole: "editor" | "viewer") => {
    onChangeRole?.(member.id, newRole);
    setShowRoleSheet(false);
  };

  const handleRemove = () => {
    onRemove?.(member.id);
    setShowRemoveSheet(false);
  };

  return (
    <>
      <Card testID={testIds.projects.members.memberRow(member.id)}>
        <View className="flex-row items-center justify-between">
          <View className="flex-1">
            <Text className="text-title-sm text-foreground">
              {member.profile.full_name || "Unknown"}
            </Text>
            {member.profile.company_name && (
              <Text className="text-body text-muted-foreground">
                {member.profile.company_name}
              </Text>
            )}
            <Text className="text-label text-muted-foreground mt-1">
              {member.profile.phone}
            </Text>
          </View>

          {isOwner ? (
            <Text className="text-label text-muted-foreground">{roleLabel}</Text>
          ) : canManage ? (
            <View className="gap-2">
              <Pressable
                onPress={() => setShowRoleSheet(true)}
                testID={testIds.projects.members.changeRoleButton(member.id)}
              >
                <Text className="text-body text-primary">{roleLabel}</Text>
              </Pressable>
              <Pressable
                onPress={() => setShowRemoveSheet(true)}
                testID={testIds.projects.members.removeMemberButton(member.id)}
              >
                <Text className="text-body text-destructive">Remove</Text>
              </Pressable>
            </View>
          ) : (
            <Text className="text-label text-muted-foreground">{roleLabel}</Text>
          )}
        </View>
      </Card>

      <Sheet
        visible={showRoleSheet}
        onClose={() => setShowRoleSheet(false)}
      >
        <Sheet.Title>Change Role</Sheet.Title>
        <Sheet.Body>
          <View className="gap-2">
            <Pressable
              onPress={() => handleRoleChange("editor")}
              testID={testIds.projects.members.roleOption("editor")}
            >
              <View className="p-3 rounded-lg bg-surface-muted">
                <Text className="text-title-sm text-foreground">Editor</Text>
                <Text className="text-body text-muted-foreground">
                  Can upload files and create reports
                </Text>
              </View>
            </Pressable>
            <Pressable
              onPress={() => handleRoleChange("viewer")}
              testID={testIds.projects.members.roleOption("viewer")}
            >
              <View className="p-3 rounded-lg bg-surface-muted">
                <Text className="text-title-sm text-foreground">Viewer</Text>
                <Text className="text-body text-muted-foreground">
                  Can only view reports
                </Text>
              </View>
            </Pressable>
          </View>
        </Sheet.Body>
        <Sheet.Actions>
          <Button variant="ghost" onPress={() => setShowRoleSheet(false)}>
            <Text className="text-body">Cancel</Text>
          </Button>
        </Sheet.Actions>
      </Sheet>

      <Sheet
        visible={showRemoveSheet}
        onClose={() => setShowRemoveSheet(false)}
      >
        <Sheet.Title>Remove Member</Sheet.Title>
        <Sheet.Body>
          <Text className="text-body text-foreground">
            Are you sure you want to remove {member.profile.full_name} from this
            project?
          </Text>
        </Sheet.Body>
        <Sheet.Actions>
          <Button variant="ghost" onPress={() => setShowRemoveSheet(false)}>
            <Text className="text-body">Cancel</Text>
          </Button>
          <Button
            variant="destructive"
            onPress={handleRemove}
            testID={testIds.projects.members.confirmRemoveMember}
          >
            <Text className="text-body text-primary-foreground">Remove</Text>
          </Button>
        </Sheet.Actions>
      </Sheet>
    </>
  );
}
