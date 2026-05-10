import React, { useCallback } from 'react';
import { FlatList, Pressable, Text, View } from 'react-native';
import { createStyleSheet, useStyles } from 'react-native-unistyles';
import { router } from 'expo-router';
import { FolderOpen, MapPin, Clock, Plus, UserCircle } from 'lucide-react-native';
import { getSurfaceDepthStyle } from '@/lib/styles/tokens';

import { useProjects } from '@/lib/api/hooks';
import { Button, EmptyState, ScreenHeader, Skeleton } from '@/components/ui';
import { SafeAreaView } from '@/components/ui/SafeAreaView';


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
      <View style={styles.addCardIconBox}>
        <Plus size={20} color={theme.colors.mutedForeground} />
      </View>
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
          <Text style={styles.roleText}>{item.role.toUpperCase()}</Text>
        ) : null}
      </View>
      {item.address ? (
        <View style={styles.cardRow}>
          <MapPin size={14} color={theme.colors.mutedForeground} />
          <Text style={styles.cardMeta} numberOfLines={1}>{item.address}</Text>
        </View>
      ) : null}
      {item.updatedAt ? (
        <View style={styles.cardRow}>
          <Clock size={12} color={theme.colors.mutedForeground} />
          <Text style={styles.cardDate}>Updated {formatDate(item.updatedAt)}</Text>
        </View>
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
          action={<Button variant="hero" size="xl" onPress={handleNavigateToNew}>Create Project</Button>}
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
    padding: theme.spacing.screen,
    gap: 12,
  },
  list: {
    padding: theme.spacing.screen,
    gap: 12,
    paddingBottom: theme.spacing['2xl'],
  },
  addCard: {
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderStyle: 'dashed',
    borderRadius: theme.radii.lg,
    padding: theme.spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  addCardPressed: {
    opacity: 0.6,
  },
  addCardIconBox: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: theme.radii.sm,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.card,
  },
  addCardText: {
    ...theme.typography.titleSm,
    color: theme.colors.mutedForeground,
  },
  card: {
    backgroundColor: theme.colors.surfaceEmphasis,
    borderRadius: theme.radii.lg,
    padding: theme.spacing.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    gap: theme.spacing.xs,
    ...getSurfaceDepthStyle('floating'),
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
    ...theme.typography.titleSm,
    color: theme.colors.cardForeground,
    flex: 1,
  },
  roleText: {
    ...theme.typography.caption,
    color: theme.colors.mutedForeground,
    fontWeight: '600',
    letterSpacing: 1,
  },
  cardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
  },
  cardMeta: {
    ...theme.typography.body,
    color: theme.colors.mutedForeground,
    flex: 1,
  },
  cardDate: {
    ...theme.typography.bodySmall,
    color: theme.colors.mutedForeground,
  },
  skeletonCard: {
    backgroundColor: theme.colors.card,
    borderRadius: theme.radii.md,
    padding: theme.spacing.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    gap: theme.spacing.sm,
  },
}));
