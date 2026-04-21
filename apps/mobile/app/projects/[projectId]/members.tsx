import { useState } from "react";
import { View, ActivityIndicator, Alert } from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { UserPlus, Users } from "lucide-react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { MembersList } from "@/components/members/MembersList";
import { AddMemberSheet } from "@/components/members/AddMemberSheet";
import { useAuth } from "@/lib/auth";
import {
  fetchProjectMembers,
  fetchProjectOwner,
  addMemberByPhone,
  removeMember,
  type ProjectMember,
  type MemberRole,
} from "@/lib/project-members";

export default function ProjectMembersScreen() {
  const router = useRouter();
  const { projectId } = useLocalSearchParams<{ projectId: string }>();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [showAddSheet, setShowAddSheet] = useState(false);

  const membersKey = ["project-members", projectId];

  const { data: owner, isLoading: isLoadingOwner } = useQuery({
    queryKey: ["project-owner", projectId],
    queryFn: () => fetchProjectOwner(projectId),
  });

  const { data: members = [], isLoading: isLoadingMembers } = useQuery({
    queryKey: membersKey,
    queryFn: () => fetchProjectMembers(projectId),
  });

  const isOwner = owner?.id === user?.id;
  const currentMembership = members.find((m) => m.user_id === user?.id);
  const canManage = isOwner || currentMembership?.role === "admin";

  const addMutation = useMutation({
    mutationFn: ({ phone, role }: { phone: string; role: MemberRole }) =>
      addMemberByPhone(projectId, phone, role),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: membersKey });
    },
  });

  const removeMutation = useMutation({
    mutationFn: (memberId: string) => removeMember(memberId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: membersKey });
    },
  });

  const handleAdd = async (phone: string, role: MemberRole) => {
    await addMutation.mutateAsync({ phone, role });
  };

  const handleRemove = (member: ProjectMember) => {
    const name = member.profile.full_name ?? member.profile.phone;
    Alert.alert(
      "Remove member",
      `Remove ${name} from this project?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Remove",
          style: "destructive",
          onPress: () => removeMutation.mutate(member.id),
        },
      ],
    );
  };

  const isLoading = isLoadingOwner || isLoadingMembers;

  return (
    <SafeAreaView className="flex-1 bg-background" edges={["top"]}>
      <View className="px-5 pt-4 pb-2">
        <ScreenHeader
          title="Members"
          eyebrow="Site Team"
          onBack={() => router.back()}
          backLabel="Site"
          trailing={
            canManage ? (
              <Button
                variant="outline"
                size="sm"
                onPress={() => setShowAddSheet(true)}
                className="shrink-0 flex-row items-center gap-1.5"
                accessibilityLabel="Add member"
                testID="btn-add-member"
              >
                <UserPlus size={14} color="#1a1a2e" />
              </Button>
            ) : undefined
          }
        />
      </View>

      {isLoading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color="#1a1a2e" />
        </View>
      ) : (
        <View className="flex-1 px-5 pt-2 pb-4">
          {owner && members.length === 0 ? (
            <View className="gap-4">
              <MembersList
                owner={owner}
                members={[]}
                currentUserId={user?.id ?? null}
                canManage={canManage}
                onRemove={handleRemove}
              />
              <EmptyState
                icon={<Users size={28} color="#5c5c6e" />}
                title="No team members yet"
                description="Add teammates so they can view or contribute to this site's reports."
                action={
                  canManage ? (
                    <Button
                      variant="default"
                      onPress={() => setShowAddSheet(true)}
                      testID="btn-add-member-empty"
                    >
                      <View className="flex-row items-center gap-2">
                        <UserPlus size={16} color="#ffffff" />
                      </View>
                    </Button>
                  ) : undefined
                }
              />
            </View>
          ) : owner ? (
            <MembersList
              owner={owner}
              members={members}
              currentUserId={user?.id ?? null}
              canManage={canManage}
              onRemove={handleRemove}
            />
          ) : null}
        </View>
      )}

      <AddMemberSheet
        visible={showAddSheet}
        onClose={() => setShowAddSheet(false)}
        onAdd={handleAdd}
      />
    </SafeAreaView>
  );
}
