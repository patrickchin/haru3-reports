import React, { useCallback } from 'react';
import { FlatList, Text, View } from 'react-native';
import { createStyleSheet, useStyles } from 'react-native-unistyles';
import { router } from 'expo-router';
import { FileText } from 'lucide-react-native';

import { useUsage, useUsageHistory } from '@/lib/api/hooks';
import { Card, EmptyState, SafeAreaView, ScreenHeader, Skeleton } from '@/components/ui';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fmt(n: number | undefined): string {
  if (n === undefined || n === null) return '0';
  return n.toLocaleString();
}

function formatDate(iso: string | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

// ---------------------------------------------------------------------------
// Stat Card
// ---------------------------------------------------------------------------

interface StatCardProps {
  label: string;
  value: string;
}

function StatCard({ label, value }: StatCardProps) {
  const { styles } = useStyles(stylesheet);
  return (
    <Card style={styles.statCard}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// History Row
// ---------------------------------------------------------------------------

interface HistoryEntry {
  id?: string;
  createdAt?: string;
  provider?: string;
  model?: string;
  inputTokens?: number;
  outputTokens?: number;
  cachedTokens?: number;
}

function HistoryRow({ item }: { item: HistoryEntry }) {
  const { styles } = useStyles(stylesheet);
  return (
    <Card padding="md" style={styles.historyCard}>
      <View style={styles.historyHeader}>
        <Text style={styles.historyDate}>{formatDate(item.createdAt)}</Text>
        {item.provider ? (
          <Text style={styles.historyProvider}>
            {item.provider} / {item.model ?? ''}
          </Text>
        ) : null}
      </View>
      <View style={styles.historyTokens}>
        <View style={styles.tokenCol}>
          <Text style={styles.tokenValue}>{fmt(item.inputTokens)}</Text>
          <Text style={styles.tokenLabel}>Input</Text>
        </View>
        <View style={styles.tokenCol}>
          <Text style={styles.tokenValue}>{fmt(item.outputTokens)}</Text>
          <Text style={styles.tokenLabel}>Output</Text>
        </View>
        <View style={styles.tokenCol}>
          <Text style={styles.tokenValue}>{fmt(item.cachedTokens)}</Text>
          <Text style={styles.tokenLabel}>Cached</Text>
        </View>
      </View>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------

export default function UsageScreen() {
  const { styles, theme } = useStyles(stylesheet);
  const { data: usage, isLoading: usageLoading } = useUsage();
  const {
    data: history,
    isLoading: historyLoading,
    refetch,
    isRefetching,
  } = useUsageHistory();

  const totalReports = history?.length ?? 0;

  const renderItem = useCallback(
    ({ item }: { item: HistoryEntry }) => <HistoryRow item={item} />,
    [],
  );

  const keyExtractor = useCallback(
    (item: HistoryEntry, index: number) => item.id ?? String(index),
    [],
  );

  const ListHeader = useCallback(() => {
    if (usageLoading) {
      return (
        <View style={styles.statsGrid}>
          {[1, 2, 3, 4].map((i) => (
            <View key={i} style={styles.statCard}>
              <Skeleton width={60} height={22} />
              <Skeleton width={80} height={14} style={{ marginTop: 4 }} />
            </View>
          ))}
        </View>
      );
    }

    return (
      <View style={styles.statsGrid}>
        <StatCard label="Total Reports" value={fmt(totalReports)} />
        <StatCard label="Input Tokens" value={fmt(usage?.totalInputTokens)} />
        <StatCard label="Output Tokens" value={fmt(usage?.totalOutputTokens)} />
        <StatCard label="Cached Tokens" value={fmt(usage?.totalCachedTokens)} />
      </View>
    );
  }, [usageLoading, usage, totalReports, styles]);

  const ListEmpty = useCallback(() => {
    if (historyLoading) {
      return (
        <View style={styles.loadingList}>
          <Skeleton width="100%" height={80} />
          <Skeleton width="100%" height={80} />
          <Skeleton width="100%" height={80} />
        </View>
      );
    }

    return (
      <EmptyState
        icon={<FileText size={48} color={theme.colors.mutedForeground} />}
        title="No usage history"
        description="Your AI usage history will appear here after generating reports."
      />
    );
  }, [historyLoading, styles, theme]);

  return (
    <SafeAreaView style={styles.safeArea} testID="screen-usage">
      <ScreenHeader title="Usage" onBack={() => router.back()} />
      <FlatList
        data={history ?? []}
        keyExtractor={keyExtractor}
        renderItem={renderItem}
        ListHeaderComponent={ListHeader}
        ListEmptyComponent={ListEmpty}
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
  list: {
    paddingHorizontal: theme.spacing.screen,
    paddingVertical: theme.spacing.md,
    gap: theme.spacing.md,
    paddingBottom: theme.spacing['2xl'],
  },

  // Stats grid
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.sm,
  },
  statCard: {
    flex: 1,
    minWidth: '45%',
  },
  statValue: {
    ...theme.typography.h3,
    color: theme.colors.foreground,
  },
  statLabel: {
    ...theme.typography.caption,
    color: theme.colors.mutedForeground,
    marginTop: 2,
  },

  // History
  historyCard: {
    gap: theme.spacing.sm,
  },
  historyHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  historyDate: {
    ...theme.typography.label,
    color: theme.colors.foreground,
  },
  historyProvider: {
    ...theme.typography.caption,
    color: theme.colors.mutedForeground,
  },
  historyTokens: {
    flexDirection: 'row',
    gap: theme.spacing.lg,
  },
  tokenCol: {
    gap: 1,
  },
  tokenValue: {
    ...theme.typography.body,
    fontWeight: '600',
    color: theme.colors.foreground,
  },
  tokenLabel: {
    ...theme.typography.caption,
    color: theme.colors.mutedForeground,
  },

  // Loading
  loadingList: {
    gap: theme.spacing.md,
  },
}));
