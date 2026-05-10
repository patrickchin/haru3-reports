import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { createStyleSheet, useStyles } from 'react-native-unistyles';
import { router, useLocalSearchParams } from 'expo-router';
import { MoreVertical } from 'lucide-react-native';

import { useReport, useUpdateReport, useDeleteReport, useNotes } from '@/lib/api/hooks';
import { SafeAreaView, ScreenHeader, Skeleton, AppDialogSheet } from '@/components/ui';
import { ReportView, ReportEditForm, ReportNotesPane } from '@/components/reports';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type TabKey = 'report' | 'edit' | 'notes';

interface ReportData {
  title: string;
  type: string;
  visitDate?: string;
  summary?: string;
  weather?: Record<string, any>;
  workers?: Record<string, any>;
  materials?: any[];
  issues?: any[];
  nextSteps?: string[];
  sections?: Array<{ title: string; content: string }>;
}

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------

export default function ReportDetailScreen() {
  const { projectId, reportId } = useLocalSearchParams<{
    projectId: string;
    reportId: string;
  }>();
  const { styles, theme } = useStyles(stylesheet);

  const { data: report, isLoading, refetch, isRefetching } = useReport(reportId) as {
    data: any;
    isLoading: boolean;
    refetch: () => void;
    isRefetching: boolean;
  };
  const { data: notes } = useNotes(reportId);
  const updateReport = useUpdateReport();
  const deleteReport = useDeleteReport();

  const [activeTab, setActiveTab] = useState<TabKey>('report');
  const [editData, setEditData] = useState<ReportData | null>(null);
  const [showMenu, setShowMenu] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  // Debounced autosave
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Seed edit data from report
  useEffect(() => {
    if (report?.reportData && !editData) {
      setEditData(report.reportData as ReportData);
    }
  }, [report, editData]);

  const handleEditChange = useCallback(
    (updated: ReportData) => {
      setEditData(updated);

      // Debounced save
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => {
        updateReport.mutate({
          id: reportId,
          reportData: updated as unknown as Record<string, unknown>,
        });
      }, 1500);
    },
    [reportId, updateReport],
  );

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, []);

  const handleDelete = useCallback(async () => {
    setShowDeleteConfirm(false);
    try {
      await deleteReport.mutateAsync(reportId);
      router.back();
    } catch {
      // error handled by React Query
    }
  }, [reportId, deleteReport]);

  const noteCount = notes?.length ?? 0;

  // -- Menu actions ---------------------------------------------------------

  const menuActions = [
    {
      label: 'Delete report',
      onPress: () => {
        setShowMenu(false);
        setShowDeleteConfirm(true);
      },
      variant: 'destructive' as const,
    },
    { label: 'Cancel', onPress: () => setShowMenu(false), variant: 'secondary' as const },
  ];

  // -- Tabs -----------------------------------------------------------------

  const tabs: Array<{ key: TabKey; label: string; badge?: number }> = [
    { key: 'report', label: 'Report' },
    { key: 'edit', label: 'Edit' },
    { key: 'notes', label: 'Notes', badge: noteCount },
  ];

  // -- Loading --------------------------------------------------------------

  if (isLoading) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <ScreenHeader title="Report" onBack={() => router.back()} />
        <View style={styles.loadingContent}>
          <Skeleton width="70%" height={20} />
          <Skeleton width="100%" height={120} style={{ marginTop: 16 }} />
          <Skeleton width="100%" height={80} style={{ marginTop: 12 }} />
        </View>
      </SafeAreaView>
    );
  }

  // -- Render ---------------------------------------------------------------

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScreenHeader
        title={report?.title ?? 'Report'}
        onBack={() => router.back()}
        trailing={
          <Pressable onPress={() => setShowMenu(true)} hitSlop={8}>
            <MoreVertical size={22} color={theme.colors.foreground} />
          </Pressable>
        }
      />

      {/* Tab bar */}
      <View style={styles.tabBar}>
        {tabs.map((tab) => (
          <Pressable
            key={tab.key}
            testID={`btn-tab-${tab.key}`}
            onPress={() => setActiveTab(tab.key)}
            style={[styles.tab, activeTab === tab.key && styles.tabActive]}
          >
            <Text
              style={[styles.tabText, activeTab === tab.key && styles.tabTextActive]}
            >
              {tab.label}
            </Text>
            {tab.badge != null && tab.badge > 0 ? (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>{tab.badge}</Text>
              </View>
            ) : null}
          </Pressable>
        ))}
      </View>

      {/* Tab content */}
      <View style={styles.tabContent}>
        {activeTab === 'report' ? (
          <ReportView data={(report?.reportData as ReportData) ?? null} />
        ) : activeTab === 'edit' ? (
          editData ? (
            <ReportEditForm data={editData} onChange={handleEditChange} />
          ) : (
            <View style={styles.loadingContent}>
              <Text style={styles.emptyText}>No report data to edit.</Text>
            </View>
          )
        ) : (
          <ReportNotesPane reportId={reportId} />
        )}
      </View>

      {/* Menu dialog */}
      <AppDialogSheet
        visible={showMenu}
        onClose={() => setShowMenu(false)}
        title="Report actions"
        actions={menuActions}
      />

      {/* Delete confirmation */}
      <AppDialogSheet
        visible={showDeleteConfirm}
        onClose={() => setShowDeleteConfirm(false)}
        title="Delete report?"
        message="This action cannot be undone."
        actions={[
          {
            label: 'Delete',
            onPress: handleDelete,
            variant: 'destructive',
          },
          {
            label: 'Cancel',
            onPress: () => setShowDeleteConfirm(false),
            variant: 'secondary',
          },
        ]}
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
  loadingContent: {
    padding: theme.spacing.screen,
    gap: theme.spacing.md,
  },
  emptyText: {
    ...theme.typography.body,
    color: theme.colors.mutedForeground,
    textAlign: 'center',
    paddingTop: theme.spacing.xl,
  },
  tabBar: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
    paddingHorizontal: theme.spacing.screen,
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: theme.spacing.sm + 2,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabActive: {
    borderBottomColor: theme.colors.primary,
  },
  tabText: {
    ...theme.typography.label,
    color: theme.colors.mutedForeground,
  },
  tabTextActive: {
    color: theme.colors.primary,
    fontWeight: '600',
  },
  badge: {
    backgroundColor: theme.colors.primary,
    borderRadius: theme.radii.full,
    minWidth: 20,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  badgeText: {
    ...theme.typography.caption,
    color: theme.colors.primaryForeground,
    fontWeight: '700',
    fontSize: 11,
  },
  tabContent: {
    flex: 1,
  },
}));
