import { useEffect } from "react";
import { View, type ViewProps } from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  Easing,
  interpolate,
} from "react-native-reanimated";
import { cn } from "@/lib/utils";

interface SkeletonProps extends ViewProps {
  /** Width — number (px) or string ("100%"). Defaults to "100%". */
  width?: number | string;
  /** Height in px. Defaults to 16. */
  height?: number;
  /** Fully round (circle). */
  circle?: boolean;
  /** Border radius override (ignored when `circle` is true). */
  radius?: number;
  className?: string;
}

/**
 * Animated shimmer placeholder that mirrors the layout footprint of
 * real content. Uses a pulsing opacity animation rather than a
 * gradient sweep so it works on all RN platforms with zero extra deps.
 */
export function Skeleton({
  width = "100%",
  height = 16,
  circle = false,
  radius,
  className,
  style,
  ...props
}: SkeletonProps) {
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = withRepeat(
      withTiming(1, { duration: 1200, easing: Easing.inOut(Easing.ease) }),
      -1,
      true,
    );
  }, [progress]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [0, 1], [0.35, 0.7]),
  }));

  const resolvedRadius = circle ? (typeof height === "number" ? height / 2 : 999) : (radius ?? 6);
  const resolvedWidth = circle ? height : width;

  return (
    <Animated.View
      {...props}
      className={cn("bg-muted", className)}
      style={[
        {
          width: resolvedWidth,
          height,
          borderRadius: resolvedRadius,
        },
        animatedStyle,
        style,
      ]}
    />
  );
}

/**
 * Row of skeleton elements with consistent spacing — a shortcut for
 * building skeleton screens quickly.
 */
export function SkeletonRow({
  children,
  className,
  ...props
}: ViewProps & { className?: string }) {
  return (
    <View className={cn("flex-row items-center gap-3", className)} {...props}>
      {children}
    </View>
  );
}
