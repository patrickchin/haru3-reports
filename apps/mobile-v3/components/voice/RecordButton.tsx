import React, { useEffect } from 'react';
import { Pressable, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
  cancelAnimation,
  Easing,
} from 'react-native-reanimated';
import { Mic, Square } from 'lucide-react-native';
import { createStyleSheet, useStyles } from 'react-native-unistyles';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface RecordButtonProps {
  isRecording: boolean;
  onPress: () => void;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const BUTTON_SIZE = 56;
const RING_SIZE = BUTTON_SIZE + 16;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function RecordButton({ isRecording, onPress }: RecordButtonProps) {
  const { styles, theme } = useStyles(stylesheet);

  const ringScale = useSharedValue(1);
  const ringOpacity = useSharedValue(1);

  useEffect(() => {
    if (isRecording) {
      ringScale.value = withRepeat(
        withTiming(1.5, { duration: 1000, easing: Easing.out(Easing.ease) }),
        -1,
        false,
      );
      ringOpacity.value = withRepeat(
        withTiming(0, { duration: 1000, easing: Easing.out(Easing.ease) }),
        -1,
        false,
      );
    } else {
      cancelAnimation(ringScale);
      cancelAnimation(ringOpacity);
      ringScale.value = withTiming(1, { duration: 200 });
      ringOpacity.value = withTiming(1, { duration: 200 });
    }
  }, [isRecording, ringScale, ringOpacity]);

  const ringAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: ringScale.value }],
    opacity: ringOpacity.value,
  }));

  const bgColor = isRecording ? theme.colors.destructive : theme.colors.primary;
  const iconColor = isRecording
    ? theme.colors.destructiveForeground
    : theme.colors.primaryForeground;

  return (
    <View style={styles.wrapper}>
      {isRecording && (
        <Animated.View
          style={[
            styles.ring,
            { borderColor: theme.colors.destructive },
            ringAnimatedStyle,
          ]}
        />
      )}
      <Pressable
        onPress={onPress}
        style={[styles.button, { backgroundColor: bgColor }]}
        accessibilityLabel={isRecording ? 'Stop recording' : 'Start recording'}
        accessibilityRole="button"
        testID={isRecording ? 'btn-record-stop' : 'btn-record-start'}
      >
        {isRecording ? (
          <Square size={22} color={iconColor} fill={iconColor} />
        ) : (
          <Mic size={24} color={iconColor} />
        )}
      </Pressable>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const stylesheet = createStyleSheet((theme) => ({
  wrapper: {
    width: RING_SIZE,
    height: RING_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ring: {
    position: 'absolute',
    width: RING_SIZE,
    height: RING_SIZE,
    borderRadius: RING_SIZE / 2,
    borderWidth: 2,
  },
  button: {
    width: BUTTON_SIZE,
    height: BUTTON_SIZE,
    borderRadius: BUTTON_SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
}));
