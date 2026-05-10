import { useState } from "react";
import { View, FlatList, Pressable, Text } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { Plus } from "lucide-react-native";
import { Screen } from "@/shared/components/Screen";
import { EmptyState } from "@/shared/components/EmptyState";
import { LoadingDots } from "@/shared/components/LoadingDots";
import { testIds } from "@/infra/test-ids";
import {
  useProjectMembers,
  MemberRow,
  InviteMemberSheet,
  useAddMember,
  useUpdateMemberRole,
  useRemoveMember,
} from "@/features/projects";
import { useAuth } from "@/features/auth/auth-context";
import { colors } from "@/design-tokens/colors";
import { useProject } from "@/features/projects";

export default function ProjectMembersScreen() {
  const { projectId } = useLocalSearchParams<{ projectId: string }>();
  const { user } = useAuth();
  const [showInviteSheet, setShowInviteSheet] = useState(false);

  const { data: project } = useProject(projectId);
  const { data: members = [], isLoading } = useProjectMembers(projectId);
  const addMember = useAddMember(projectId!);
  const updateMemberRole = useUpdateMemberRole();
  const removeMember = useRemoveMember();

  const isOwner = project?.owner_id === user?.id;
  const currentUserMember = members.find((m) => m.user_id === user?.id);
  const canManage = isOwner || currentUserMember?.role === "owner";

  const handleInvite = async (phone: string, role: "editor" | "viewer") => {
    await addMember.mutateAsync({ phone, role });
  };

  const handleChangeRole = (
    memberId: string,
    role: "editor" | "viewer"
  ) => {
    updateMemberRole.mutate({ memberId, projectId: projectId!, role });
  };

  const handleRemove = (memberId: string) => {
    removeMember.mutate({ memberId, projectId: projectId! });
  };

  return (
    <>
      <Screen>
        <View className="flex-1" testID={testIds.projects.members.membersList}>
          {isLoading ? (
            <View className="flex-1 items-center justify-center">
              <LoadingDots />
            </View>
          ) : members.length === 0 ? (
            <EmptyState
              title="No Members"
              message="Invite team members to collaborate"
            />
          ) : (
            <FlatList
              data={members}
              keyExtractor={(item) => item.id}
              renderItem={({ item }) => (
                <MemberRow
                  member={item}
                  isOwner={item.role === "owner"}
                  canManage={canManage}
                  onChangeRole={handleChangeRole}
                  onRemove={handleRemove}
                />
              )}
              contentContainerStyle={{ padding: 16, gap: 12 }}
            />
          )}

          {canManage && (
            <View className="absolute bottom-6 right-6">
              <Pressable
                onPress={() => setShowInviteSheet(true)}
                testID={testIds.projects.members.inviteMemberButton}
                className="bg-primary rounded-full w-14 h-14 items-center justify-center shadow-lg"
              >
                <Plus size={28} color={colors.primary.foreground} />
              </Pressable>
            </View>
          )}
        </View>
      </Screen>

      <InviteMemberSheet
        visible={showInviteSheet}
        onClose={() => setShowInviteSheet(false)}
        onInvite={handleInvite}
      />
    </>
  );
}
