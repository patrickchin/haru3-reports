import React, { useCallback, useMemo, useState } from 'react';
import { FlatList, Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { createStyleSheet, useStyles } from 'react-native-unistyles';
import { router, useLocalSearchParams } from 'expo-router';
import { Phone, Plus, UserMinus } from 'lucide-react-native';

import { useAuth } from '@/features/auth';
import { useMembers, useRemoveMember } from '@/lib/api/hooks';
import { Card, EmptyState, ScreenHeader, Skeleton } from '@/components/ui';
import { AddMemberSheet } from '@/components/members/AddMemberSheet';

type RoleFilter = 'all' | 'owner' | 'admin' | 'editor' | 'viewer';

const ROLE_FILTERS: RoleFilter[] = ['all', 'owner', 'admin', 'editor', 'viewer'];

function roleBadgeColor(role: string): string {
  switch (role) {
    case 'owner':
      return '#2f6f48';
    case 'admin':
      return '#2a5a9f';
    case 'editor':
      return '#b66916';
    default:
      return '#5f5b66';
  }
}

export default function MembersScreen() {
  const { styles, theme } = useStyles(stylesheet);
  const { projectId } = useLocalSearchParams<{ projectId: string }>();
  const { user } = useAuth();
  const { data: members, isLoading, refetch, isRefetching } = useMembers(projectId);
  const removeMember = useRemoveMember();

  const [activeFilter, setActiveFilter] = useState<RoleFilter>('all');
  const [showAddSheet, setShowAddSheet] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);

  const currentUserId = user?.id;
  const currentMember = members?.find((m: Record<string, any>) => m.userId === currentUserId);
  const isAdminOrOwner = currentMember?.role === 'owner' || currentMember?.role === 'admin';

  const roleCounts = useMemo(() => {
    if (!members) return {} as Record<string, number>;
    const counts: Record<string, number> = {};
    members.forEach((m: Record<string, any>) => {
      counts[m.role] = (counts[m.role] ?? 0) + 1;
    });
    return counts;
  }, [members]);

  const filteredMembers = useMemo(() => {
    if (!members) return [];
    const sorted = [...members].sort((a: Record<string, any>, b: Record<string, any>) => {
      if (a.userId === currentUserId) return -1;
      if (b.userId === currentUserId) return 1;
      return 0;
    });
    if (activeFilter === 'all') return sorted;
    return sorted.filter((m: Record<string, any>) => m.role === activeFilter);
  }, [members, activeFilter, currentUserId]);

  const handleRemove = useCallback(
    (userId: string) => {
      removeMember.mutate(
        { projectId, userId },
        { onSuccess: () => setRemovingId(null) },
      );
    },
    [projectId, removeMember],
  );

  const renderFilterChip = useCallback(
    (filter: RoleFilter) => {
      const count = filter === 'all' ? members?.length ?? 0 : roleCounts[filter] ?? 0;
      const isActive = activeFilter === filter;
      return (
        <Pressable
          key={filter}
          onPress={() => setActiveFilter(filter)}
          style={[styles.chip, isActive && styles.chipActive]}
        >
          <Text style={[styles.chipText, isActive && styles.chipTextActive]}>
            {filter.charAt(0).toUpperCase() + filter.slice(1)} ({count})
          </Text>
        </Pressable>
      );
    },
    [activeFilter, members, roleCounts, styles],
  );

  const renderMember = useCallback(
    ({ item }: { item: Record<string, any> }) => {
      const isMe = item.userId === currentUserId;
      const isConfirmingRemove = removingId === item.userId;

      return (
        <Card padding="md" style={styles.memberCard}>
          <View style={styles.memberHeader}>
            <View style={styles.memberInfo}>
              <View style={styles.nameRow}>
                <Text style={styles.memberName} numberOfLines={1}>
                  {item.fullName ?? item.phone ?? 'Unknown'}
                </Text>
                {isMe ? (
                  <View style={styles.youBadge}>
                    <Text style={styles.youBadgeText}>You</Text>
                  </View>
                ) : null}
              </View>
              {item.phone ? (
                <View style={styles.phoneRow}>
                  <Phone size={12} color={theme.colors.mutedForeground} />
                  <Text style={styles.phoneText}>{item.phone}</Text>
                </View>
              ) : null}
            </View>
            <View style={[styles.roleBadge, { backgroundColor: roleBadgeColor(item.role) }]}>
              <Text style={styles.roleBadgeText}>{item.role}</Text>
            </View>
          </View>

          {isAdminOrOwner && !isMe && item.role !== 'owner' ? (
            isConfirmingRemove ? (
              <View style={styles.confirmRow}>
                <Text style={styles.confirmText}>Remove this member?</Text>
                <View style={styles.confirmButtons}>
                  <Pressable
                    onPress={() => setRemovingId(null)}
                    style={styles.confirmCancel}
                  >
                    <Text style={styles.confirmCancelText}>Cancel</Text>
                  </Pressable>
                  <Pressable
                    onPress={() => handleRemove(item.userId)}
                    style={styles.confirmRemove}
                  >
                    <Text style={styles.confirmRemoveText}>
                      {removeMember.isPending ? 'Removing...' : 'Remove'}
                    </Text>
                  </Pressable>
                </View>
              </View>
            ) : (
              <Pressable
                onPress={() => setRemovingId(item.userId)}
                style={styles.removeButton}
              >
                <UserMinus size={14} color={theme.colors.destructive} />
                <Text style={styles.removeText}>Remove</Text>
              </Pressable>
            )
          ) : null}
        </Card>
      );
    },
    [currentUserId, isAdminOrOwner, removingId, handleRemove, removeMember.isPending, styles, theme],
  );

  if (isLoading) {
    return (
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <ScreenHeader title="Members" onBack={() => router.back()} />
        <View style={styles.content}>
          <Skeleton width="100%" height={60} />
          <Skeleton width="100%" height={60} />
          <Skeleton width="100%" height={60} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <ScreenHeader title="Members" onBack={() => router.back()} />
      <FlatList
        data={filteredMembers}
        keyExtractor={(item) => item.userId ?? item.id}
        renderItem={renderMember}
        contentContainerStyle={styles.content}
        onRefresh={refetch}
        refreshing={isRefetching}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={
          <View style={styles.headerSection}>
            {isAdminOrOwner ? (
              <Pressable
                testID="btn-add-member"
                onPress={() => setShowAddSheet(true)}
                style={({ pressed }) => [styles.addCard, pressed && styles.addCardPressed]}
              >
                <Plus size={20} color={theme.colors.mutedForeground} />
                <Text style={styles.addCardText}>Add member</Text>
              </Pressable>
            ) : null}

            <View style={styles.filterRow}>
              {ROLE_FILTERS.map(renderFilterChip)}
            </View>
          </View>
        }
        ListEmptyComponent={
          <EmptyState title="No members found" description="Try a different filter." />
        }
      />

      <AddMemberSheet
        visible={showAddSheet}
        onClose={() => setShowAddSheet(false)}
        projectId={projectId}
      />
    </SafeAreaView>
  );
}

const stylesheet = createStyleSheet((theme) => ({
  safeArea: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  content: {
    padding: theme.spacing.md,
    gap: theme.spacing.sm,
    paddingBottom: theme.spacing['2xl'],
  },
  headerSection: {
    gap: theme.spacing.md,
    marginBottom: theme.spacing.sm,
  },
  addCard: {
    borderWidth: 2,
    borderColor: theme.colors.border,
    borderStyle: 'dashed',
    borderRadius: theme.radii.xl,
    padding: theme.spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.spacing.sm,
  },
  addCardPressed: { opacity: 0.6 },
  addCardText: {
    ...theme.typography.label,
    color: theme.colors.mutedForeground,
  },
  filterRow: {
    flexDirection: 'row',
    gap: theme.spacing.xs,
    flexWrap: 'wrap',
  },
  chip: {
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.xs,
    borderRadius: theme.radii.full,
    backgroundColor: theme.colors.secondary,
  },
  chipActive: {
    backgroundColor: theme.colors.primary,
  },
  chipText: {
    ...theme.typography.caption,
    color: theme.colors.secondaryForeground,
    fontWeight: '500',
  },
  chipTextActive: {
    color: theme.colors.primaryForeground,
  },
  memberCard: {
    gap: theme.spacing.sm,
  },
  memberHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: theme.spacing.sm,
  },
  memberInfo: {
    flex: 1,
    gap: 2,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
  memberName: {
    ...theme.typography.label,
    color: theme.colors.foreground,
    flexShrink: 1,
  },
  youBadge: {
    backgroundColor: theme.colors.successSoft,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 1,
    borderRadius: theme.radii.full,
  },
  youBadgeText: {
    ...theme.typography.caption,
    color: theme.colors.success,
    fontWeight: '600',
  },
  phoneRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
  },
  phoneText: {
    ...theme.typography.caption,
    color: theme.colors.mutedForeground,
  },
  roleBadge: {
    borderRadius: theme.radii.full,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 2,
  },
  roleBadgeText: {
    ...theme.typography.caption,
    color: '#ffffff',
    fontWeight: '600',
  },
  removeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
    alignSelf: 'flex-start',
  },
  removeText: {
    ...theme.typography.caption,
    color: theme.colors.destructive,
  },
  confirmRow: {
    gap: theme.spacing.xs,
  },
  confirmText: {
    ...theme.typography.caption,
    color: theme.colors.destructive,
  },
  confirmButtons: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
  },
  confirmCancel: {
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.xs,
    borderRadius: theme.radii.md,
    backgroundColor: theme.colors.secondary,
  },
  confirmCancelText: {
    ...theme.typography.caption,
    color: theme.colors.secondaryForeground,
    fontWeight: '500',
  },
  confirmRemove: {
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.xs,
    borderRadius: theme.radii.md,
    backgroundColor: theme.colors.dangerSoft,
  },
  confirmRemoveText: {
    ...theme.typography.caption,
    color: theme.colors.destructive,
    fontWeight: '500',
  },
}));
