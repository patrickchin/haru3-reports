import React, { useEffect, useRef } from 'react';
import { View, Text, Pressable, Animated } from 'react-native';
import { createStyleSheet, useStyles } from 'react-native-unistyles';
import { Upload } from 'lucide-react-native';
import { useUploadQueue } from '@/features/upload-queue';

export function UploadTrayBadge() {
  const { styles, theme } = useStyles(stylesheet);
  const { pendingCount, failedCount, uploading } = useUploadQueue();
  const pulseAnim = useRef(new Animated.Value(1)).current;

  const activeCount = pendingCount + uploading.length;
  const totalCount = activeCount + failedCount;

  useEffect(() => {
    if (uploading.length > 0) {
      const loop = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 0.6, duration: 600, useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 1, duration: 600, useNativeDriver: true }),
        ]),
      );
      loop.start();
      return () => loop.stop();
    }
    pulseAnim.setValue(1);
  }, [uploading.length, pulseAnim]);

  if (totalCount === 0) return null;

  return (
    <Pressable onPress={() => { /* TODO: open upload tray sheet */ }}>
      <Animated.View style={[styles.badge, { opacity: pulseAnim }]}>
        <Upload size={14} color={theme.colors.accentForeground} />
        <Text style={styles.count}>{totalCount}</Text>
      </Animated.View>
    </Pressable>
  );
}

const stylesheet = createStyleSheet((theme) => ({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: theme.colors.accent,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: theme.spacing.xs,
    borderRadius: theme.radii.full,
  },
  count: {
    ...theme.typography.caption,
    color: theme.colors.accentForeground,
    fontWeight: '600',
  },
}));
