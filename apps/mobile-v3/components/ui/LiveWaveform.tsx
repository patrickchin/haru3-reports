import React, { useEffect, useMemo } from 'react';
import { View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import { createStyleSheet, useStyles } from 'react-native-unistyles';

export interface LiveWaveformProps {
  amplitudes: number[];
  barCount?: number;
  isActive?: boolean;
  height?: number;
}

const MIN_BAR_HEIGHT = 2;
const BAR_GAP = 2;
const ANIM_DURATION = 100;

function WaveformBar({
  amplitude,
  maxHeight,
  color,
  width,
}: {
  amplitude: number;
  maxHeight: number;
  color: string;
  width: number;
}) {
  const barHeight = useSharedValue(MIN_BAR_HEIGHT);

  useEffect(() => {
    const target = Math.max(MIN_BAR_HEIGHT, amplitude * maxHeight);
    barHeight.value = withTiming(target, {
      duration: ANIM_DURATION,
      easing: Easing.out(Easing.ease),
    });
  }, [amplitude, maxHeight, barHeight]);

  const animatedStyle = useAnimatedStyle(() => ({
    height: barHeight.value,
  }));

  return (
    <Animated.View
      style={[
        {
          width,
          borderRadius: width / 2,
          backgroundColor: color,
        },
        animatedStyle,
      ]}
    />
  );
}

export function LiveWaveform({
  amplitudes,
  barCount = 30,
  isActive = false,
  height = 40,
}: LiveWaveformProps) {
  const { styles, theme } = useStyles(stylesheet);

  const bars = useMemo(() => {
    const padded = amplitudes.slice(-barCount);
    while (padded.length < barCount) {
      padded.unshift(0);
    }
    return padded;
  }, [amplitudes, barCount]);

  const color = isActive ? theme.colors.primary : theme.colors.mutedForeground;

  return (
    <View style={[styles.container, { height }]}>
      {bars.map((amp, i) => (
        <WaveformBar
          key={`${barCount}-${i}`}
          amplitude={amp}
          maxHeight={height}
          color={color}
          width={3}
        />
      ))}
    </View>
  );
}

const stylesheet = createStyleSheet(() => ({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: BAR_GAP,
  },
}));
