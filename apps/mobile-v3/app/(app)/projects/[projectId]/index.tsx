import React, { useCallback } from 'react';
import { Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { createStyleSheet, useStyles } from 'react-native-unistyles';
import { router, useLocalSearchParams } from 'expo-router';
import {
  ChevronRight,
  FileText,
  MapPin,
  Pencil,
  User2,
  Users,
} from 'lucide-react-native';

import { useProject, useReports } from '@/lib/api/hooks';
import { Card, Divider, ScreenHeader, Skeleton } from '@/components/ui';

function StatItem({ label, value }: { label: string; value: string | number }) {
  const { styles } = useStyles(stylesheet);
  return (
    <View style={styles.stat}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function ActionRow({
  icon,
  label,
  onPress,
  testID,
}: {
  icon: React.ReactNode;
  label: string;
  onPress: () => void;
  testID?: string;
}) {
  const { styles, theme } = useStyles(stylesheet);
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      style={({ pressed }) => [styles.actionRow, pressed && styles.actionRowPressed]}
    >
      {icon}
      <Text style={styles.actionLabel}>{label}</Text>
      <ChevronRight size={18} color={theme.colors.mutedForeground} />
    </Pressable>
  );
}

function DetailSkeleton() {
  const { styles } = useStyles(stylesheet);
  return (
    <View style={styles.content}>
      <Skeleton width="70%" height={24} />
      <Skeleton width="50%" height={16} style={{ marginTop: 8 }} />
      <Skeleton width="100%" height={80} style={{ marginTop: 24 }} />
      <Skeleton width="100%" height={48} style={{ marginTop: 16 }} />
      <Skeleton width="100%" height={48} style={{ marginTop: 8 }} />
    </View>
  );
}

export default function ProjectDetailScreen() {
  const { styles, theme } = useStyles(stylesheet);
  const { projectId } = useLocalSearchParams<{ projectId: string }>();
  const { data: project, isLoading, refetch, isRefetching } = useProject(projectId) as {
    data: Record<string, any> | undefined;
    isLoading: boolean;
    refetch: () => void;
    isRefetching: boolean;
  };
  const { data: reports } = useReports(projectId);

  const totalReports = reports?.length ?? 0;
  const draftCount = reports?.filter((r: Record<string, any>) => r.status === 'draft').length ?? 0;

  const handleEdit = useCallback(() => {
    router.push(`/(app)/projects/${projectId}/edit`);
  }, [projectId]);

  const handleReports = useCallback(() => {
    router.push(`/(app)/projects/${projectId}/reports` as any);
  }, [projectId]);

  const handleMembers = useCallback(() => {
    router.push(`/(app)/projects/${projectId}/members`);
  }, [projectId]);

  if (isLoading) {
    return (
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <ScreenHeader title="Project" onBack={() => router.back()} />
        <DetailSkeleton />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <ScreenHeader
        title={project?.name ?? 'Project'}
        onBack={() => router.back()}
        trailing={
          <Pressable testID="btn-edit-project" onPress={handleEdit} hitSlop={8}>
            <Pencil size={20} color={theme.colors.foreground} />
          </Pressable>
        }
      />
      <ScrollView
        style={styles.flex}
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl refreshing={isRefetching} onRefresh={refetch} />
        }
      >
        {project?.clientName ? (
          <Pressable testID="btn-copy-client" style={styles.metaRow}>
            <User2 size={16} color={theme.colors.mutedForeground} />
            <Text style={styles.metaText}>{project.clientName}</Text>
          </Pressable>
        ) : null}

        {project?.address ? (
          <Pressable testID="btn-copy-address" style={styles.metaRow}>
            <MapPin size={16} color={theme.colors.mutedForeground} />
            <Text style={styles.metaText}>{project.address}</Text>
          </Pressable>
        ) : null}

        <Card style={styles.statsCard}>
          <View style={styles.statsRow}>
            <StatItem label="Reports" value={totalReports} />
            <View style={styles.statDivider} />
            <StatItem label="Drafts" value={draftCount} />
          </View>
        </Card>

        <Card style={styles.actionsCard} padding="sm">
          <ActionRow
            testID="btn-open-reports"
            icon={<FileText size={20} color={theme.colors.foreground} />}
            label="Reports"
            onPress={handleReports}
          />
          <Divider />
          <ActionRow
            testID="btn-open-members"
            icon={<Users size={20} color={theme.colors.foreground} />}
            label="Members"
            onPress={handleMembers}
          />
        </Card>
      </ScrollView>
    </SafeAreaView>
  );
}

const stylesheet = createStyleSheet((theme) => ({
  safeArea: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  flex: { flex: 1 },
  content: {
    padding: theme.spacing.md,
    gap: theme.spacing.md,
    paddingBottom: theme.spacing['2xl'],
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
  metaText: {
    ...theme.typography.body,
    color: theme.colors.mutedForeground,
    flex: 1,
  },
  statsCard: {
    marginTop: theme.spacing.sm,
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  stat: {
    flex: 1,
    alignItems: 'center',
    gap: theme.spacing.xs,
  },
  statValue: {
    ...theme.typography.h2,
    color: theme.colors.foreground,
  },
  statLabel: {
    ...theme.typography.caption,
    color: theme.colors.mutedForeground,
  },
  statDivider: {
    width: 1,
    height: 40,
    backgroundColor: theme.colors.border,
  },
  actionsCard: {
    marginTop: theme.spacing.xs,
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.md,
    paddingVertical: theme.spacing.md,
    paddingHorizontal: theme.spacing.sm,
  },
  actionRowPressed: {
    opacity: 0.6,
  },
  actionLabel: {
    ...theme.typography.body,
    color: theme.colors.foreground,
    flex: 1,
  },
}));
