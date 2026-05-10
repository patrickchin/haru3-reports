import React, { useCallback } from 'react';
import { FlatList, Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { createStyleSheet, useStyles } from 'react-native-unistyles';
import { router } from 'expo-router';
import { FolderOpen, MapPin, Plus, UserCircle } from 'lucide-react-native';

import { useProjects } from '@/lib/api/hooks';
import { EmptyState, ScreenHeader, Skeleton } from '@/components/ui';

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

function formatDate(dateString?: string): string {
  if (!dateString) return '';
  const d = new Date(dateString);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function ProjectSkeleton() {
  const { styles } = useStyles(stylesheet);
  return (
    <View style={styles.skeletonCard}>
      <Skeleton width="60%" height={18} />
      <Skeleton width="40%" height={14} style={{ marginTop: 8 }} />
      <Skeleton width="50%" height={14} style={{ marginTop: 8 }} />
    </View>
  );
}

export default function ProjectsScreen() {
  const { styles, theme } = useStyles(stylesheet);
  const { data: projects, isLoading, refetch, isRefetching } = useProjects();

  const handleNavigateToProject = useCallback((id: string) => {
    router.push(`/(app)/projects/${id}`);
  }, []);

  const handleNavigateToNew = useCallback(() => {
    router.push('/(app)/projects/new');
  }, []);

  const handleNavigateToProfile = useCallback(() => {
    router.push('/(app)/profile');
  }, []);

  const renderAddCard = useCallback(() => (
    <Pressable
      testID="btn-new-project"
      onPress={handleNavigateToNew}
      style={({ pressed }) => [styles.addCard, pressed && styles.addCardPressed]}
    >
      <Plus size={24} color={theme.colors.mutedForeground} />
      <Text style={styles.addCardText}>Add new project</Text>
    </Pressable>
  ), [handleNavigateToNew, styles, theme]);

  const renderProject = useCallback(({ item, index }: { item: Record<string, any>; index: number }) => (
    <Pressable
      testID={`project-row-${index}`}
      onPress={() => handleNavigateToProject(item.id)}
      style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
    >
      <View style={styles.cardHeader}>
        <Text style={styles.cardName} numberOfLines={1}>{item.name}</Text>
        {item.role ? (
          <View style={[styles.badge, { backgroundColor: roleBadgeColor(item.role) }]}>
            <Text style={styles.badgeText}>{item.role}</Text>
          </View>
        ) : null}
      </View>
      {item.address ? (
        <View style={styles.cardRow}>
          <MapPin size={14} color={theme.colors.mutedForeground} />
          <Text style={styles.cardMeta} numberOfLines={1}>{item.address}</Text>
        </View>
      ) : null}
      {item.updatedAt ? (
        <Text style={styles.cardDate}>Updated {formatDate(item.updatedAt)}</Text>
      ) : null}
    </Pressable>
  ), [handleNavigateToProject, styles, theme]);

  if (isLoading) {
    return (
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <ScreenHeader
          title="Projects"
          trailing={
            <Pressable testID="btn-open-profile" onPress={handleNavigateToProfile} hitSlop={8}>
              <UserCircle size={24} color={theme.colors.foreground} />
            </Pressable>
          }
        />
        <View style={styles.content}>
          <ProjectSkeleton />
          <ProjectSkeleton />
          <ProjectSkeleton />
        </View>
      </SafeAreaView>
    );
  }

  if (!projects || projects.length === 0) {
    return (
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <ScreenHeader
          title="Projects"
          trailing={
            <Pressable testID="btn-open-profile" onPress={handleNavigateToProfile} hitSlop={8}>
              <UserCircle size={24} color={theme.colors.foreground} />
            </Pressable>
          }
        />
        <EmptyState
          icon={<FolderOpen size={48} color={theme.colors.mutedForeground} />}
          title="No projects yet"
          description="Create your first project to get started with reports."
          action={{ label: 'Create Project', onPress: handleNavigateToNew }}
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <ScreenHeader
        title="Projects"
        trailing={
          <Pressable testID="btn-open-profile" onPress={handleNavigateToProfile} hitSlop={8}>
            <UserCircle size={24} color={theme.colors.foreground} />
          </Pressable>
        }
      />
      <FlatList
        data={projects}
        keyExtractor={(item) => item.id}
        renderItem={renderProject}
        ListHeaderComponent={renderAddCard}
        contentContainerStyle={styles.list}
        onRefresh={refetch}
        refreshing={isRefetching}
        showsVerticalScrollIndicator={false}
        removeClippedSubviews
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
    flex: 1,
    padding: theme.spacing.md,
    gap: theme.spacing.md,
  },
  list: {
    padding: theme.spacing.md,
    gap: theme.spacing.md,
    paddingBottom: theme.spacing['2xl'],
  },
  addCard: {
    borderWidth: 2,
    borderColor: theme.colors.border,
    borderStyle: 'dashed',
    borderRadius: theme.radii.xl,
    padding: theme.spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.spacing.sm,
  },
  addCardPressed: {
    opacity: 0.6,
  },
  addCardText: {
    ...theme.typography.label,
    color: theme.colors.mutedForeground,
  },
  card: {
    backgroundColor: theme.colors.card,
    borderRadius: theme.radii.xl,
    padding: theme.spacing.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    gap: theme.spacing.xs,
    shadowColor: theme.colors.surfaceShadow,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 3,
    elevation: 1,
  },
  cardPressed: {
    opacity: 0.7,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: theme.spacing.sm,
  },
  cardName: {
    ...theme.typography.h3,
    color: theme.colors.cardForeground,
    flex: 1,
  },
  badge: {
    borderRadius: theme.radii.full,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 2,
  },
  badgeText: {
    ...theme.typography.caption,
    color: '#ffffff',
    fontWeight: '600',
  },
  cardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
  },
  cardMeta: {
    ...theme.typography.bodySmall,
    color: theme.colors.mutedForeground,
    flex: 1,
  },
  cardDate: {
    ...theme.typography.caption,
    color: theme.colors.mutedForeground,
  },
  skeletonCard: {
    backgroundColor: theme.colors.card,
    borderRadius: theme.radii.xl,
    padding: theme.spacing.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    gap: theme.spacing.sm,
  },
}));
