import React, { useEffect, useRef, useState } from 'react';
import { View, Text, Pressable, Animated } from 'react-native';
import { createStyleSheet, useStyles } from 'react-native-unistyles';
import { Upload } from 'lucide-react-native';
import { useUploadQueue } from '@/features/upload-queue';
import { UploadTraySheet } from './UploadTraySheet';

export function UploadTrayBadge() {
  const { styles, theme } = useStyles(stylesheet);
  const { pendingCount, failedCount, uploading } = useUploadQueue();
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const [sheetVisible, setSheetVisible] = useState(false);

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
    <>
      <Pressable onPress={() => setSheetVisible(true)}>
        <Animated.View style={[styles.badge, { opacity: pulseAnim }]} testID="upload-tray-badge">
          <Upload size={14} color={theme.colors.accentForeground} />
          <Text style={styles.count} testID="upload-tray-count">{totalCount}</Text>
        </Animated.View>
      </Pressable>
      <UploadTraySheet visible={sheetVisible} onClose={() => setSheetVisible(false)} />
    </>
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
