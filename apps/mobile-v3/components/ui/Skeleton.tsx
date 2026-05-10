import React, { useEffect } from 'react';
import { View, type ViewStyle } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import { createStyleSheet, useStyles } from 'react-native-unistyles';

export interface SkeletonProps {
  width?: number | string;
  height?: number;
  borderRadius?: number;
  style?: ViewStyle;
}

export function Skeleton({ width = '100%', height = 20, borderRadius, style }: SkeletonProps) {
  const { styles, theme } = useStyles(stylesheet);
  const opacity = useSharedValue(0.35);

  useEffect(() => {
    opacity.value = withRepeat(
      withTiming(0.7, { duration: 1200, easing: Easing.inOut(Easing.ease) }),
      -1,
      true,
    );
  }, [opacity]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
  }));

  return (
    <Animated.View
      style={[
        styles.base,
        {
          width: width as number,
          height,
          borderRadius: borderRadius ?? theme.radii.md,
        },
        animatedStyle,
        style,
      ]}
    />
  );
}

/** Convenience: a full-width skeleton row with label-like proportions. */
export interface SkeletonRowProps {
  lines?: number;
  style?: ViewStyle;
}

export function SkeletonRow({ lines = 1, style }: SkeletonRowProps) {
  return (
    <View style={[{ gap: 8 }, style]}>
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton
          key={i}
          height={14}
          width={i === lines - 1 && lines > 1 ? '60%' : '100%'}
        />
      ))}
    </View>
  );
}

const stylesheet = createStyleSheet((theme) => ({
  base: {
    backgroundColor: theme.colors.muted,
  },
}));
