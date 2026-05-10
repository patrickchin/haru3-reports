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
  actions: DialogAction[];
}

const ANIM_DURATION = 200;

export function AppDialogSheet({
  visible,
  onClose,
  title,
  message,
  actions,
}: AppDialogSheetProps) {
  const { styles } = useStyles(stylesheet);
  const opacity = useSharedValue(0);
  const scale = useSharedValue(0.9);

  useEffect(() => {
    if (visible) {
      opacity.value = withTiming(1, { duration: ANIM_DURATION, easing: Easing.out(Easing.ease) });
      scale.value = withTiming(1, { duration: ANIM_DURATION, easing: Easing.out(Easing.ease) });
    }
  }, [visible, opacity, scale]);

  const handleClose = () => {
    opacity.value = withTiming(0, { duration: ANIM_DURATION }, (finished) => {
      if (finished) runOnJS(onClose)();
    });
    scale.value = withTiming(0.9, { duration: ANIM_DURATION });
  };

  const backdropStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
  }));

  const cardStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ scale: scale.value }],
  }));

  return (
    <Modal visible={visible} transparent statusBarTranslucent animationType="none">
      <View style={styles.container}>
        <Animated.View style={[styles.backdrop, backdropStyle]}>
          <Pressable style={styles.backdropPress} onPress={handleClose} />
        </Animated.View>

        <Animated.View testID="dialog-sheet" style={[styles.card, cardStyle]}>
          <Text style={styles.title}>{title}</Text>
          {message ? <Text style={styles.message}>{message}</Text> : null}

          <View style={styles.actions}>
            {actions.map((action, i) => {
              const variant = action.variant ?? 'primary';
              return (
                <Pressable
                  key={i}
                  testID={action.testID ?? `dialog-action-${i}`}
                  onPress={action.onPress}
                  style={({ pressed }) => [
                    styles.button,
                    styles[`button_${variant}`],
                    pressed && styles.buttonPressed,
                  ]}
                >
                  <Text style={[styles.buttonText, styles[`buttonText_${variant}`]]}>
                    {action.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}

const stylesheet = createStyleSheet((theme) => ({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: theme.spacing.lg,
  },
  backdrop: {
    ...({ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 } as const),
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  backdropPress: {
    flex: 1,
  },
  card: {
    width: '100%',
    maxWidth: 340,
    backgroundColor: theme.colors.card,
    borderRadius: theme.radii['2xl'],
    padding: theme.spacing.lg,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: theme.colors.cardForeground,
    textAlign: 'center',
    marginBottom: theme.spacing.xs,
  },
  message: {
    fontSize: 15,
    lineHeight: 22,
    color: theme.colors.mutedForeground,
    textAlign: 'center',
    marginBottom: theme.spacing.md,
  },
  actions: {
    marginTop: theme.spacing.sm,
    gap: theme.spacing.sm,
  },
  button: {
    minHeight: 44,
    borderRadius: theme.radii.lg,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
  },
  buttonPressed: {
    opacity: 0.7,
  },
  button_primary: {
    backgroundColor: theme.colors.primary,
  },
  button_secondary: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  button_destructive: {
    backgroundColor: theme.colors.destructive,
  },
  buttonText: {
    fontSize: 16,
    fontWeight: '600',
  },
  buttonText_primary: {
    color: theme.colors.primaryForeground,
  },
  buttonText_secondary: {
    color: theme.colors.foreground,
  },
  buttonText_destructive: {
    color: theme.colors.destructiveForeground,
  },
}));
