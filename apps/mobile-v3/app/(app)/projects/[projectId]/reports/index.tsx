import React, { useCallback } from 'react';
import { FlatList, Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { createStyleSheet, useStyles } from 'react-native-unistyles';
import { router, useLocalSearchParams } from 'expo-router';
import { FileText, Plus } from 'lucide-react-native';

import { useReports, useProject, useCreateReport } from '@/lib/api/hooks';
import { EmptyState, ScreenHeader, Skeleton } from '@/components/ui';
import { ReportCard } from '@/components/reports';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function ReportSkeleton() {
  const { styles } = useStyles(stylesheet);
  return (
    <View style={styles.skeletonCard}>
      <Skeleton width={36} height={36} borderRadius={8} />
      <View style={styles.skeletonContent}>
        <Skeleton width="60%" height={16} />
        <Skeleton width="40%" height={12} style={{ marginTop: 6 }} />
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------

export default function ReportsListScreen() {
  const { projectId } = useLocalSearchParams<{ projectId: string }>();
  const { styles, theme } = useStyles(stylesheet);
  const { data: project } = useProject(projectId) as { data: any };
  const { data: reports, isLoading, refetch, isRefetching } = useReports(projectId);
  const createReport = useCreateReport();

  const handleNewReport = useCallback(async () => {
    try {
      const draft: any = await createReport.mutateAsync({
        projectId,
        title: `Report ${new Date().toLocaleDateString()}`,
        reportType: 'daily',
      });
      router.push(`/(app)/projects/${projectId}/reports/generate?reportId=${draft.id}`);
    } catch {
      // mutation error handled by React Query
    }
  }, [projectId, createReport]);

  const handlePressReport = useCallback(
    (report: { id: string; status: string }) => {
      if (report.status === 'draft') {
        router.push(`/(app)/projects/${projectId}/reports/generate?reportId=${report.id}`);
      } else {
        router.push(`/(app)/projects/${projectId}/reports/${report.id}`);
      }
    },
    [projectId],
  );

  const renderAddCard = useCallback(
    () => (
      <Pressable
        onPress={handleNewReport}
        disabled={createReport.isPending}
        style={({ pressed }) => [styles.addCard, pressed && styles.addCardPressed]}
      >
        <Plus size={24} color={theme.colors.mutedForeground} />
        <Text style={styles.addCardText}>
          {createReport.isPending ? 'Creating…' : 'New report'}
        </Text>
      </Pressable>
    ),
    [handleNewReport, createReport.isPending, styles, theme],
  );

  const renderReport = useCallback(
    ({ item }: { item: Record<string, any> }) => (
      <ReportCard
        report={item as any}
        onPress={() => handlePressReport(item as any)}
      />
    ),
    [handlePressReport],
  );

  if (isLoading) {
    return (
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <ScreenHeader
          title="Reports"
          subtitle={project?.name}
          onBack={() => router.back()}
        />
        <View style={styles.content}>
          <ReportSkeleton />
          <ReportSkeleton />
          <ReportSkeleton />
        </View>
      </SafeAreaView>
    );
  }

  if (!reports || reports.length === 0) {
    return (
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <ScreenHeader
          title="Reports"
          subtitle={project?.name}
          onBack={() => router.back()}
        />
        <View style={styles.content}>{renderAddCard()}</View>
        <EmptyState
          icon={<FileText size={48} color={theme.colors.mutedForeground} />}
          title="No reports yet"
          description="Create your first report to get started."
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <ScreenHeader
        title="Reports"
        subtitle={project?.name}
        onBack={() => router.back()}
      />
      <FlatList
        data={reports}
        keyExtractor={(item) => item.id}
        renderItem={renderReport}
        ListHeaderComponent={renderAddCard}
        contentContainerStyle={styles.list}
        onRefresh={refetch}
        refreshing={isRefetching}
        showsVerticalScrollIndicator={false}
      />
    </SafeAreaView>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

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
  skeletonCard: {
    backgroundColor: theme.colors.card,
    borderRadius: theme.radii.xl,
    padding: theme.spacing.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    flexDirection: 'row',
    gap: theme.spacing.sm,
    alignItems: 'center',
  },
  skeletonContent: {
    flex: 1,
    gap: theme.spacing.xs,
  },
}));
