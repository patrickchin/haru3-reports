import { memo, useEffect, useMemo, useRef, useState } from "react";
import { View, type LayoutChangeEvent } from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  Easing,
} from "react-native-reanimated";
import { colors } from "@/lib/design-tokens/colors";

interface LiveWaveformProps {
  /** Normalised amplitude 0–1 sampled from the mic, updated live. */
  amplitude: number;
}

const BAR_WIDTH = 3;
const BAR_GAP = 2.5;
const BAR_PITCH = BAR_WIDTH + BAR_GAP;
const MIN_BAR_COUNT = 8;
const MAX_BAR_COUNT = 64;
const FALLBACK_BAR_COUNT = 40;
const MAX_BAR_HEIGHT = 52;
const MIN_BAR_HEIGHT = 4;
const WAVE_COLOR = colors.chart.fill;
const TRANSITION_MS = 80;

const TIMING_CONFIG = {
  duration: TRANSITION_MS,
  easing: Easing.out(Easing.quad),
};

interface AnimatedBarProps {
  amplitude: number;
}

const AnimatedBar = memo(function AnimatedBar({ amplitude }: AnimatedBarProps) {
  const height = useSharedValue(MIN_BAR_HEIGHT);

  useEffect(() => {
    const target = MIN_BAR_HEIGHT + (MAX_BAR_HEIGHT - MIN_BAR_HEIGHT) * amplitude;
    height.value = withTiming(target, TIMING_CONFIG);
  }, [amplitude, height]);

  const style = useAnimatedStyle(() => ({
    height: height.value,
  }));

  return (
    <Animated.View
      style={[
        {
          width: BAR_WIDTH,
          borderRadius: BAR_WIDTH / 2,
          backgroundColor: WAVE_COLOR,
          marginHorizontal: BAR_GAP / 2,
        },
        style,
      ]}
    />
  );
});

const SAMPLE_INTERVAL_MS = 50;

/**
 * Live mic-amplitude waveform. The component fills whatever horizontal
 * space the parent gives it: bar count is derived from the measured
 * width (clamped to [MIN_BAR_COUNT, MAX_BAR_COUNT]) so the waveform
 * always fits exactly inside its container — no horizontal overflow on
 * narrow screens, no oversized gap on wider ones.
 */
export const LiveWaveform = memo(function LiveWaveform({ amplitude }: LiveWaveformProps) {
  const [barCount, setBarCount] = useState<number>(FALLBACK_BAR_COUNT);
  // Ring-buffer history of samples; new samples push to the right, old roll off the left.
  const [history, setHistory] = useState<number[]>(() =>
    Array(FALLBACK_BAR_COUNT).fill(0),
  );
  const amplitudeRef = useRef<number>(amplitude);

  // Always reflect the freshest amplitude for the interval to read.
  useEffect(() => {
    amplitudeRef.current = amplitude;
  }, [amplitude]);

  // Push a sample every tick — keeps the waveform scrolling even during silence.
  useEffect(() => {
    const id = setInterval(() => {
      setHistory((prev) => {
        const next = prev.slice(1);
        next.push(amplitudeRef.current);
        return next;
      });
    }, SAMPLE_INTERVAL_MS);
    return () => clearInterval(id);
  }, []);

  // Resize the ring buffer when the bar count changes (re-layout / rotation).
  useEffect(() => {
    setHistory((prev) => {
      if (prev.length === barCount) return prev;
      if (prev.length > barCount) return prev.slice(prev.length - barCount);
      return [...Array(barCount - prev.length).fill(0), ...prev];
    });
  }, [barCount]);

  const onLayout = (e: LayoutChangeEvent) => {
    const width = e.nativeEvent.layout.width;
    if (width <= 0) return;
    const next = Math.max(
      MIN_BAR_COUNT,
      Math.min(MAX_BAR_COUNT, Math.floor(width / BAR_PITCH)),
    );
    setBarCount((prev) => (prev === next ? prev : next));
  };

  const bars = useMemo(() => history.slice(-barCount), [history, barCount]);

  return (
    <View
      onLayout={onLayout}
      style={{
        height: MAX_BAR_HEIGHT,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        alignSelf: "stretch",
        overflow: "hidden",
      }}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      {bars.map((amp, i) => (
        <AnimatedBar key={i} amplitude={amp} />
      ))}
    </View>
  );
});
