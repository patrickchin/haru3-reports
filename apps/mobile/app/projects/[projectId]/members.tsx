import { useMemo, useState } from "react";
import { View, Text, Pressable, ScrollView, ActivityIndicator } from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { Plus, UserPlus, Users } from "lucide-react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Animated, { FadeInDown } from "react-native-reanimated";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { AppDialogSheet } from "@/components/ui/AppDialogSheet";
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
import { getRemoveMemberDialogCopy } from "@/lib/app-dialog-copy";

export default function ProjectMembersScreen() {
  const router = useRouter();
  const { projectId } = useLocalSearchParams<{ projectId: string }>();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [showAddSheet, setShowAddSheet] = useState(false);
  const [roleFilter, setRoleFilter] = useState<string | null>(null);
  const [memberToRemove, setMemberToRemove] = useState<TeamMember | null>(null);

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

  const currentUserMember = useMemo(
    () => team.find((m) => m.user_id === user?.id),
    [team, user?.id],
  );

  const otherMembers = useMemo(
    () => team.filter((m) => m.user_id !== user?.id),
    [team, user?.id],
  );

  const roleCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const m of otherMembers) {
      counts[m.role] = (counts[m.role] ?? 0) + 1;
    }
    return counts;
  }, [otherMembers]);

  const FILTER_OPTIONS: { key: string | null; label: string }[] = useMemo(() => {
    const options: { key: string | null; label: string }[] = [
      { key: null, label: "All" },
    ];
    for (const role of ["owner", "admin", "editor", "viewer"] as const) {
      const label = role.charAt(0).toUpperCase() + role.slice(1);
      const count = roleCounts[role];
      options.push({ key: role, label: count ? `${label} (${count})` : label });
    }
    return options;
  }, [roleCounts]);

  const filteredOtherMembers = useMemo(
    () => (roleFilter ? otherMembers.filter((m) => m.role === roleFilter) : otherMembers),
    [otherMembers, roleFilter],
  );

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
    setMemberToRemove(member);
  };

  const confirmRemove = () => {
    if (!memberToRemove?.member_id) return;
    removeMutation.mutate(memberToRemove.member_id);
    setMemberToRemove(null);
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
        <ScrollView
          className="flex-1"
          contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 8, paddingBottom: 16, gap: 12 }}
        >
          {currentUserMember ? (
            <MembersList
              team={[currentUserMember]}
              currentUserId={user?.id ?? null}
              canManage={false}
              onRemove={handleRemove}
            />
          ) : null}

          {canManage ? (
            <Animated.View entering={FadeInDown.duration(150)}>
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

          {otherMembers.length > 0 ? (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ gap: 8 }}
            >
              {FILTER_OPTIONS.map((opt) => {
                const active = roleFilter === opt.key;
                return (
                  <Pressable
                    key={opt.key ?? "all"}
                    onPress={() => setRoleFilter(opt.key)}
                    accessibilityRole="button"
                    accessibilityState={{ selected: active }}
                  >
                    <View
                      className={`rounded-lg border px-4 py-2 ${
                        active
                          ? "border-primary bg-primary"
                          : "border-border bg-card"
                      }`}
                    >
                      <Text
                        className={`text-sm font-semibold ${
                          active ? "text-primary-foreground" : "text-foreground"
                        }`}
                      >
                        {opt.label}
                      </Text>
                    </View>
                  </Pressable>
                );
              })}
            </ScrollView>
          ) : null}

          {roleFilter === "owner" && isOwner ? (
            <View className="rounded-lg border border-border bg-surface-muted px-4 py-3">
              <Text className="text-sm text-muted-foreground">
                You are the owner of this site.
              </Text>
            </View>
          ) : null}

          {filteredOtherMembers.length === 0 ? (
            !roleFilter ? (
              <EmptyState
                icon={<Users size={28} color="#5c5c6e" />}
                title="No team members yet"
                description="Add teammates so they can view or contribute to this site's reports."
              />
            ) : null
          ) : (
            <MembersList
              team={filteredOtherMembers}
              currentUserId={user?.id ?? null}
              canManage={canManage}
              onRemove={handleRemove}
            />
          )}
        </ScrollView>
      )}

      <AddMemberSheet
        visible={showAddSheet}
        onClose={() => setShowAddSheet(false)}
        onAdd={handleAdd}
      />

      {memberToRemove ? (() => {
        const copy = getRemoveMemberDialogCopy(memberToRemove.full_name ?? "this member");
        return (
          <AppDialogSheet
            visible
            title={copy.title}
            message={copy.message}
            noticeTone={copy.tone}
            noticeTitle={copy.noticeTitle}
            onClose={() => setMemberToRemove(null)}
            actions={[
              {
                label: copy.confirmLabel,
                variant: copy.confirmVariant,
                onPress: confirmRemove,
              },
              {
                label: copy.cancelLabel ?? "Cancel",
                variant: "secondary",
                onPress: () => setMemberToRemove(null),
              },
            ]}
          />
        );
      })() : null}
    </SafeAreaView>
  );
}
