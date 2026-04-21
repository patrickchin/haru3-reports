import { useState } from "react";
import { View, Text, Pressable, ActivityIndicator, Alert } from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { Plus, UserPlus, Users } from "lucide-react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Animated, { FadeInDown } from "react-native-reanimated";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { EmptyState } from "@/components/ui/EmptyState";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { MembersList } from "@/components/members/MembersList";
import { AddMemberSheet } from "@/components/members/AddMemberSheet";
import { useAuth } from "@/lib/auth";
import {
  fetchProjectTeam,
  addMemberByPhone,
  removeMember,
  type TeamMember,
  type MemberRole,
} from "@/lib/project-members";

export default function ProjectMembersScreen() {
  const router = useRouter();
  const { projectId } = useLocalSearchParams<{ projectId: string }>();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [showAddSheet, setShowAddSheet] = useState(false);

  const teamKey = ["project-team", projectId];

  const { data: team = [], isLoading } = useQuery({
    queryKey: teamKey,
    queryFn: () => fetchProjectTeam(projectId),
  });

  const owner = team.find((m) => m.is_owner);
  const nonOwnerMembers = team.filter((m) => !m.is_owner);
  const isOwner = owner?.user_id === user?.id;
  const currentMembership = nonOwnerMembers.find((m) => m.user_id === user?.id);
  const canManage = isOwner || currentMembership?.role === "admin";

  const addMutation = useMutation({
    mutationFn: ({ phone, role }: { phone: string; role: MemberRole }) =>
      addMemberByPhone(projectId, phone, role),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: teamKey });
    },
  });

  const removeMutation = useMutation({
    mutationFn: (memberId: string) => removeMember(memberId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: teamKey });
    },
  });

  const handleAdd = async (phone: string, role: MemberRole) => {
    await addMutation.mutateAsync({ phone, role });
  };

  const handleRemove = (member: TeamMember) => {
    if (!member.member_id) return;
    const name = member.full_name ?? "this member";
    Alert.alert(
      "Remove member",
      `Remove ${name} from this project?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Remove",
          style: "destructive",
          onPress: () => removeMutation.mutate(member.member_id!),
        },
      ],
    );
  };

  return (
    <SafeAreaView className="flex-1 bg-background" edges={["top"]}>
      <View className="px-5 pt-4 pb-2">
        <ScreenHeader
          title="Members"
          eyebrow="Site Team"
          onBack={() => router.back()}
          backLabel="Site"
        />
      </View>

      {isLoading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color="#1a1a2e" />
        </View>
      ) : (
        <View className="flex-1 px-5 pt-2 pb-4 gap-3">
          {canManage ? (
            <Animated.View entering={FadeInDown.duration(70)}>
              <Pressable
                onPress={() => setShowAddSheet(true)}
                accessibilityRole="button"
                accessibilityLabel="Add member"
                testID="btn-add-member"
              >
                <View className="flex-row items-center gap-3 rounded-lg border border-dashed border-border bg-surface-muted p-3">
                  <View className="h-10 w-10 items-center justify-center rounded-md border border-border bg-card">
                    <Plus size={20} color="#1a1a2e" />
                  </View>
                  <View className="flex-1">
                    <Text className="text-title-sm text-foreground">Add member</Text>
                    <Text className="text-sm text-muted-foreground">
                      Invite a teammate to this site.
                    </Text>
                  </View>
                </View>
              </Pressable>
            </Animated.View>
          ) : null}

          {nonOwnerMembers.length === 0 ? (
            <View className="gap-4">
              <MembersList
                team={team}
                currentUserId={user?.id ?? null}
                canManage={canManage}
                onRemove={handleRemove}
              />
              <EmptyState
                icon={<Users size={28} color="#5c5c6e" />}
                title="No team members yet"
                description="Add teammates so they can view or contribute to this site's reports."
              />
            </View>
          ) : (
            <MembersList
              team={team}
              currentUserId={user?.id ?? null}
              canManage={canManage}
              onRemove={handleRemove}
            />
          )}
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
