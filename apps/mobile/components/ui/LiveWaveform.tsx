import { memo, useEffect, useRef, useState } from "react";
import { View } from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  Easing,
} from "react-native-reanimated";

interface LiveWaveformProps {
  /** Normalised amplitude 0–1 sampled from the mic, updated live. */
  amplitude: number;
}

const BAR_COUNT = 40;
const BAR_WIDTH = 3;
const BAR_GAP = 2.5;
const MAX_BAR_HEIGHT = 52;
const MIN_BAR_HEIGHT = 4;
const WAVE_COLOR = "#1a1a2e";
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

export const LiveWaveform = memo(function LiveWaveform({ amplitude }: LiveWaveformProps) {
  // Ring-buffer history of samples; new samples push to the right, old roll off the left.
  const [history, setHistory] = useState<number[]>(() => Array(BAR_COUNT).fill(0));
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

  return (
    <View
      style={{ height: MAX_BAR_HEIGHT, flexDirection: "row", alignItems: "center" }}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      {history.map((amp, i) => (
        <AnimatedBar key={i} amplitude={amp} />
      ))}
    </View>
  );
});