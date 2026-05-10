import React, { useCallback, useEffect } from 'react';
import { FlatList, Modal, Pressable, Text, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  Easing,
  runOnJS,
} from 'react-native-reanimated';
import { createStyleSheet, useStyles } from 'react-native-unistyles';
import {
  Upload,
  Check,
  AlertCircle,
  Loader,
  X,
  RotateCcw,
} from 'lucide-react-native';
import { useUploadQueue, useUploadQueueActions } from '@/features/upload-queue';
import type { UploadJob } from '@/features/upload-queue/UploadQueueProvider';

export interface UploadTraySheetProps {
  visible: boolean;
  onClose: () => void;
}

const ANIM_DURATION = 250;

function statusIcon(status: UploadJob['status'], color: string, size: number) {
  switch (status) {
    case 'pending':
      return <Upload size={size} color={color} />;
    case 'uploading':
      return <Loader size={size} color={color} />;
    case 'completed':
      return <Check size={size} color={color} />;
    case 'failed':
      return <AlertCircle size={size} color={color} />;
  }
}

function UploadJobRow({ job }: { job: UploadJob }) {
  const { styles, theme } = useStyles(stylesheet);
  const { retry, cancel } = useUploadQueueActions();

  const statusColor =
    job.status === 'failed'
      ? theme.colors.destructive
      : job.status === 'completed'
        ? theme.colors.primary
        : theme.colors.mutedForeground;

  return (
    <View style={styles.jobRow}>
      <View style={styles.jobIcon}>{statusIcon(job.status, statusColor, 18)}</View>
      <View style={styles.jobInfo}>
        <Text style={styles.jobName} numberOfLines={1}>
          {job.fileName}
        </Text>
        <Text style={[styles.jobStatus, { color: statusColor }]}>
          {job.status === 'uploading'
            ? `Uploading${job.progress > 0 ? ` ${Math.round(job.progress * 100)}%` : '...'}`
            : job.status === 'failed'
              ? job.lastError ?? 'Upload failed'
              : job.status}
        </Text>
      </View>
      {job.status === 'failed' && (
        <Pressable
          onPress={() => retry(job.id)}
          hitSlop={8}
          style={({ pressed }) => [styles.actionBtn, pressed && styles.actionBtnPressed]}
          testID={`retry-${job.id}`}
        >
          <RotateCcw size={16} color={theme.colors.primary} />
        </Pressable>
      )}
      {(job.status === 'pending' || job.status === 'failed') && (
        <Pressable
          onPress={() => cancel(job.id)}
          hitSlop={8}
          style={({ pressed }) => [styles.actionBtn, pressed && styles.actionBtnPressed]}
          testID={`cancel-${job.id}`}
        >
          <X size={16} color={theme.colors.mutedForeground} />
        </Pressable>
      )}
    </View>
  );
}

export function UploadTraySheet({ visible, onClose }: UploadTraySheetProps) {
  const { styles } = useStyles(stylesheet);
  const { jobs, pendingCount, failedCount } = useUploadQueue();
  const { removeCompleted } = useUploadQueueActions();
  const opacity = useSharedValue(0);
  const translateY = useSharedValue(300);

  useEffect(() => {
    if (visible) {
      opacity.value = withTiming(1, { duration: ANIM_DURATION, easing: Easing.out(Easing.ease) });
      translateY.value = withTiming(0, { duration: ANIM_DURATION, easing: Easing.out(Easing.ease) });
    }
  }, [visible, opacity, translateY]);

  const handleClose = useCallback(() => {
    opacity.value = withTiming(0, { duration: ANIM_DURATION }, (finished) => {
      if (finished) runOnJS(onClose)();
    });
    translateY.value = withTiming(300, { duration: ANIM_DURATION });
  }, [onClose, opacity, translateY]);

  const backdropStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));
  const sheetStyle = useAnimatedStyle(() => ({ transform: [{ translateY: translateY.value }] }));

  const activeJobs = jobs.filter((j) => j.status !== 'completed');
  const completedJobs = jobs.filter((j) => j.status === 'completed');

  return (
    <Modal visible={visible} transparent statusBarTranslucent animationType="none">
      <View style={styles.container}>
        <Animated.View style={[styles.backdrop, backdropStyle]}>
          <Pressable style={styles.backdropPress} onPress={handleClose} />
        </Animated.View>

        <Animated.View style={[styles.sheet, sheetStyle]} testID="upload-tray-sheet">
          <View style={styles.handle} />
          <View style={styles.header}>
            <Text style={styles.title}>Uploads</Text>
            {completedJobs.length > 0 && (
              <Pressable onPress={removeCompleted} testID="clear-completed">
                <Text style={styles.clearText}>Clear completed</Text>
              </Pressable>
            )}
          </View>

          {jobs.length === 0 ? (
            <View style={styles.empty}>
              <Text style={styles.emptyText}>No uploads</Text>
            </View>
          ) : (
            <FlatList
              data={[...activeJobs, ...completedJobs]}
              keyExtractor={(item) => item.id}
              renderItem={({ item }) => <UploadJobRow job={item} />}
              style={styles.list}
              contentContainerStyle={styles.listContent}
            />
          )}

          {(pendingCount > 0 || failedCount > 0) && (
            <View style={styles.footer}>
              {pendingCount > 0 && (
                <Text style={styles.footerText}>{pendingCount} pending</Text>
              )}
              {failedCount > 0 && (
                <Text style={[styles.footerText, styles.footerError]}>{failedCount} failed</Text>
              )}
            </View>
          )}
        </Animated.View>
      </View>
    </Modal>
  );
}

const stylesheet = createStyleSheet((theme) => ({
  container: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdrop: {
    ...({ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 } as const),
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  backdropPress: {
    flex: 1,
  },
  sheet: {
    backgroundColor: theme.colors.card,
    borderTopLeftRadius: theme.radii['2xl'],
    borderTopRightRadius: theme.radii['2xl'],
    maxHeight: '60%',
    paddingBottom: 34, // safe area
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: theme.colors.border,
    alignSelf: 'center',
    marginTop: theme.spacing.sm,
    marginBottom: theme.spacing.xs,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.sm,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: theme.colors.cardForeground,
  },
  clearText: {
    fontSize: 14,
    color: theme.colors.primary,
    fontWeight: '500',
  },
  list: {
    flexGrow: 0,
  },
  listContent: {
    paddingHorizontal: theme.spacing.lg,
  },
  empty: {
    paddingVertical: theme.spacing.xl,
    alignItems: 'center',
  },
  emptyText: {
    ...theme.typography.body,
    color: theme.colors.mutedForeground,
  },
  jobRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: theme.spacing.sm,
    gap: theme.spacing.sm,
  },
  jobIcon: {
    width: 28,
    alignItems: 'center',
  },
  jobInfo: {
    flex: 1,
  },
  jobName: {
    ...theme.typography.body,
    color: theme.colors.foreground,
    fontWeight: '500',
  },
  jobStatus: {
    ...theme.typography.caption,
    marginTop: 2,
  },
  actionBtn: {
    padding: theme.spacing.xs,
  },
  actionBtnPressed: {
    opacity: 0.5,
  },
  footer: {
    flexDirection: 'row',
    gap: theme.spacing.md,
    paddingHorizontal: theme.spacing.lg,
    paddingTop: theme.spacing.sm,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
  },
  footerText: {
    ...theme.typography.caption,
    color: theme.colors.mutedForeground,
  },
  footerError: {
    color: theme.colors.destructive,
  },
}));
