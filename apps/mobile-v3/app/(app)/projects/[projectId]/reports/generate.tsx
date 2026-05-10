import React, { useCallback, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { createStyleSheet, useStyles } from 'react-native-unistyles';
import { router, useLocalSearchParams } from 'expo-router';
import { MoreVertical } from 'lucide-react-native';

import { ScreenHeader, AppDialogSheet, Skeleton } from '@/components/ui';
import { ReportView } from '@/components/reports/ReportView';
import { ReportEditForm } from '@/components/reports/ReportEditForm';
import { NoteTimeline } from '@/components/reports/NoteTimeline';
import { GenerateReportInputBar } from '@/components/reports/GenerateReportInputBar';
import { GenerateReportActionRow } from '@/components/reports/GenerateReportActionRow';
import {
  GenerateReportProvider,
  useGenerateReportContext,
  type TabKey,
} from '@/features/reports/GenerateReportProvider';
import { useDeleteReport } from '@/lib/api/hooks';

// ---------------------------------------------------------------------------
// Tab bar
// ---------------------------------------------------------------------------

const TABS: { key: TabKey; label: string }[] = [
  { key: 'notes', label: 'Notes' },
  { key: 'report', label: 'Report' },
  { key: 'edit', label: 'Edit' },
];

function TabBar() {
  const { styles, theme } = useStyles(stylesheet);
  const { activeTab, setActiveTab } = useGenerateReportContext();

  return (
    <View style={styles.tabBar}>
      {TABS.map((tab) => {
        const active = activeTab === tab.key;
        return (
          <Pressable
            key={tab.key}
            onPress={() => setActiveTab(tab.key)}
            style={[styles.tab, active && styles.tabActive]}
          >
            <Text
              style={[
                styles.tabText,
                active && { color: theme.colors.primary, fontWeight: '600' },
              ]}
            >
              {tab.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Inner content (needs context)
// ---------------------------------------------------------------------------

function GenerateScreenContent({ projectId }: { projectId: string }) {
  const { styles, theme } = useStyles(stylesheet);
  const [menuVisible, setMenuVisible] = useState(false);
  const [deleteVisible, setDeleteVisible] = useState(false);
  const deleteMutation = useDeleteReport();

  const {
    report,
    reportLoading,
    reportId,
    activeTab,
    timeline,
    deleteNote,
    reportData,
    setReportData,
    saveReportData,
    isFinalizing,
  } = useGenerateReportContext();

  // Handle finalize success — navigate back
  React.useEffect(() => {
    if (report?.status === 'finalized' && !isFinalizing) {
      router.back();
    }
  }, [report?.status, isFinalizing]);

  const handleDelete = useCallback(async () => {
    setDeleteVisible(false);
    await deleteMutation.mutateAsync(reportId);
    router.back();
  }, [deleteMutation, reportId]);

  if (reportLoading) {
    return (
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <ScreenHeader title="Loading..." onBack={() => router.back()} />
        <View style={styles.loadingContainer}>
          <Skeleton width="100%" height={20} />
          <Skeleton width="80%" height={20} />
          <Skeleton width="60%" height={20} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <ScreenHeader
        title={report?.title ?? 'New Report'}
        onBack={() => router.back()}
        trailing={
          <Pressable onPress={() => setMenuVisible(true)} hitSlop={8}>
            <MoreVertical size={20} color={theme.colors.foreground} />
          </Pressable>
        }
      />

      {/* Action row */}
      <GenerateReportActionRow />

      {/* Tab bar */}
      <TabBar />

      {/* Tab content */}
      <View style={styles.content}>
        {activeTab === 'notes' && (
          <NoteTimeline timeline={timeline} onDelete={deleteNote} />
        )}
        {activeTab === 'report' && <ReportView data={reportData} />}
        {activeTab === 'edit' && reportData && (
          <ReportEditForm
            data={reportData}
            onChange={(data) => {
              setReportData(data);
              // Debounced autosave could go here; for now save on blur
            }}
          />
        )}
        {activeTab === 'edit' && !reportData && (
          <View style={styles.emptyEdit}>
            <Text style={styles.emptyEditText}>
              Generate a report first, then edit it here.
            </Text>
          </View>
        )}
      </View>

      {/* Input bar — only on Notes tab */}
      {activeTab === 'notes' && (
        <GenerateReportInputBar projectId={projectId} />
      )}

      {/* Menu dialog */}
      <AppDialogSheet
        visible={menuVisible}
        onClose={() => setMenuVisible(false)}
        title="Report Options"
        actions={[
          {
            label: 'Save Changes',
            onPress: () => {
              setMenuVisible(false);
              if (reportData) {
                saveReportData();
              }
            },
            variant: 'primary',
          },
          {
            label: 'Delete Draft',
            onPress: () => {
              setMenuVisible(false);
              setDeleteVisible(true);
            },
            variant: 'destructive',
          },
        ]}
      />

      {/* Delete confirmation */}
      <AppDialogSheet
        visible={deleteVisible}
        onClose={() => setDeleteVisible(false)}
        title="Delete Draft?"
        message="This will permanently delete this draft report and all its notes."
        actions={[
          {
            label: 'Cancel',
            onPress: () => setDeleteVisible(false),
            variant: 'secondary',
          },
          {
            label: 'Delete',
            onPress: handleDelete,
            variant: 'destructive',
          },
        ]}
      />
    </SafeAreaView>
  );
}

// ---------------------------------------------------------------------------
// Screen (wraps content in provider)
// ---------------------------------------------------------------------------

export default function GenerateReportScreen() {
  const { projectId, reportId } = useLocalSearchParams<{
    projectId: string;
    reportId?: string;
  }>();

  if (!reportId) {
    return (
      <SafeAreaView style={{ flex: 1 }}>
        <ScreenHeader title="Error" onBack={() => router.back()} />
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <Text>Missing report ID</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <GenerateReportProvider reportId={reportId} projectId={projectId}>
      <GenerateScreenContent projectId={projectId} />
    </GenerateReportProvider>
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
  loadingContainer: {
    padding: theme.spacing.xl,
    gap: theme.spacing.md,
  },
  content: {
    flex: 1,
  },
  tabBar: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: theme.spacing.sm,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabActive: {
    borderBottomColor: theme.colors.primary,
  },
  tabText: {
    ...theme.typography.bodySmall,
    color: theme.colors.mutedForeground,
  },
  emptyEdit: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: theme.spacing.xl,
  },
  emptyEditText: {
    ...theme.typography.body,
    color: theme.colors.mutedForeground,
    textAlign: 'center',
  },
}));
