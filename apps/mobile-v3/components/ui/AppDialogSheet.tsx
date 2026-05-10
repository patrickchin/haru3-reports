import React, { useEffect } from 'react';
import { Modal, Pressable, Text, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  Easing,
  runOnJS,
} from 'react-native-reanimated';
import { createStyleSheet, useStyles } from 'react-native-unistyles';
import { Button } from './Button';
import { InlineNotice, type NoticeTone } from './InlineNotice';

interface DialogAction {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'destructive';
  testID?: string;
}

export interface AppDialogSheetProps {
  visible: boolean;
  onClose: () => void;
  title: string;
  message?: string;
  /** Tone for the optional InlineNotice banner wrapping the message. */
  noticeTone?: NoticeTone;
  actions: DialogAction[];
  /** Whether tapping the backdrop dismisses the sheet. Default true. */
  canDismiss?: boolean;
  /** Custom content rendered below the message / notice. */
  children?: React.ReactNode;
}

const ANIM_DURATION = 250;

export function AppDialogSheet({
  visible,
  onClose,
  title,
  message,
  noticeTone,
  actions,
  canDismiss = true,
  children,
}: AppDialogSheetProps) {
  const { styles } = useStyles(stylesheet);
  const opacity = useSharedValue(0);
  const translateY = useSharedValue(100);

  useEffect(() => {
    if (visible) {
      opacity.value = withTiming(1, { duration: ANIM_DURATION, easing: Easing.out(Easing.ease) });
      translateY.value = withTiming(0, { duration: ANIM_DURATION, easing: Easing.out(Easing.ease) });
    }
  }, [visible, opacity, translateY]);

  const handleClose = () => {
    if (!canDismiss) return;
    opacity.value = withTiming(0, { duration: ANIM_DURATION }, (finished) => {
      if (finished) runOnJS(onClose)();
    });
    translateY.value = withTiming(100, { duration: ANIM_DURATION });
  };

  const backdropStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
  }));

  const sheetStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: translateY.value }],
  }));

  const variantMap: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
    primary: 'default',
    secondary: 'outline',
    destructive: 'destructive',
  };

  return (
    <Modal visible={visible} transparent statusBarTranslucent animationType="none">
      <View style={styles.container}>
        <Animated.View style={[styles.backdrop, backdropStyle]}>
          <Pressable style={styles.backdropPress} onPress={handleClose} />
        </Animated.View>

        <Animated.View testID="dialog-sheet" style={[styles.sheet, sheetStyle]}>
          {/* Handle indicator */}
          <View style={styles.handleRow}>
            <View style={styles.handle} />
          </View>

          <Text style={styles.title}>{title}</Text>

          {message ? (
            noticeTone ? (
              <InlineNotice tone={noticeTone} style={styles.notice}>{message}</InlineNotice>
            ) : (
              <Text style={styles.message}>{message}</Text>
            )
          ) : null}

          {children}

          <View style={styles.actions}>
            {actions.map((action, i) => (
              <Button
                key={i}
                testID={action.testID ?? `dialog-action-${i}`}
                variant={variantMap[action.variant ?? 'primary'] ?? 'default'}
                onPress={action.onPress}
                style={styles.actionButton}
              >
                {action.label}
              </Button>
            ))}
          </View>
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
    paddingHorizontal: theme.spacing.screen,
    paddingBottom: theme.spacing.xl,
  },
  handleRow: {
    alignItems: 'center',
    paddingVertical: theme.spacing.sm,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: theme.colors.muted,
  },
  title: {
    ...theme.typography.titleSm,
    color: theme.colors.cardForeground,
    marginBottom: theme.spacing.sm,
  },
  message: {
    ...theme.typography.body,
    color: theme.colors.mutedForeground,
    marginBottom: theme.spacing.md,
  },
  notice: {
    marginBottom: theme.spacing.md,
  },
  actions: {
    marginTop: theme.spacing.md,
    gap: theme.spacing.sm,
  },
  actionButton: {
    width: '100%',
  },
}));
