/**
 * ConnectionBanner — sticky offline / reconnected indicator.
 *
 * Animation contract:
 *   - Single banner instance: the offline and "reconnected" states are
 *     two states of the *same* banner, not two separate banners. The
 *     wrapper never unmounts while online; mode swaps cross-fade the
 *     icon + text in place and interpolate the background colour.
 *   - Entry / exit: an animated container's height grows from 0 to the
 *     measured content height on appear, and shrinks back to 0 on
 *     disappear. Because the wrapper takes real flow height, the rest
 *     of the app slides down/up in lockstep — no jump on mount or
 *     unmount, and the banner content slides smoothly out of (and back
 *     under) the status bar.
 *
 * When visible, the banner consumes the status-bar safe-area inset
 * itself and overrides `SafeAreaInsetsContext` with `top: 0` for the
 * wrapped children, so screens using `SafeAreaView` / `useSafeAreaInsets`
 * don't stack a second copy of the inset under the banner. The override
 * follows the same animated progress so the inset transition matches
 * the slide rather than snapping at the start or end.
 */
import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { Text, View, type LayoutChangeEvent } from "react-native";
import Animated, {
  Easing,
  FadeIn,
  FadeOut,
  interpolateColor,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import {
  SafeAreaInsetsContext,
  useSafeAreaInsets,
} from "react-native-safe-area-context";
import { WifiOff, Wifi } from "lucide-react-native";

import { useSyncDb } from "@/lib/sync/SyncProvider";
import { colors } from "@/lib/design-tokens/colors";

const BACK_ONLINE_DISPLAY_MS = 2_500;
const SLIDE_ANIM_MS = 260;
const BG_ANIM_MS = 240;
const CROSSFADE_MS = 180;

type Mode = "offline" | "online";

interface ConnectionBannerProps {
  children?: ReactNode;
}

export function ConnectionBanner({ children }: ConnectionBannerProps) {
  const { isOnline } = useSyncDb();
  const insets = useSafeAreaInsets();
  const [showReconnected, setShowReconnected] = useState(false);
  const wasOfflineRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!isOnline) {
      wasOfflineRef.current = true;
      setShowReconnected(false);
      if (timerRef.current) clearTimeout(timerRef.current);
      return;
    }
    if (wasOfflineRef.current) {
      wasOfflineRef.current = false;
      setShowReconnected(true);
      timerRef.current = setTimeout(() => {
        setShowReconnected(false);
      }, BACK_ONLINE_DISPLAY_MS);
    }
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [isOnline]);

  const visible = !isOnline || showReconnected;
  const mode: Mode = isOnline ? "online" : "offline";

  // Animated open/close progress. 0 = collapsed (height 0), 1 = open
  // (height = measuredHeight). Drives the wrapper height, opacity, and
  // the children's effective top inset.
  const progress = useSharedValue(0);
  // Measured intrinsic height of the inner banner content. Until we
  // have a measurement, we render the inner content invisibly to
  // measure it while the wrapper stays at height 0.
  const measuredHeight = useSharedValue(0);
  const [hasMeasured, setHasMeasured] = useState(false);

  useEffect(() => {
    progress.value = withTiming(visible ? 1 : 0, {
      duration: SLIDE_ANIM_MS,
      easing: Easing.out(Easing.cubic),
    });
  }, [visible, progress]);

  // Animate background colour smoothly when mode swaps without remount.
  const modeProgress = useSharedValue(mode === "online" ? 1 : 0);
  useEffect(() => {
    modeProgress.value = withTiming(mode === "online" ? 1 : 0, {
      duration: BG_ANIM_MS,
    });
  }, [mode, modeProgress]);

  const wrapperStyle = useAnimatedStyle(() => ({
    height: measuredHeight.value * progress.value,
    opacity: progress.value,
  }));

  const animatedBgStyle = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(
      modeProgress.value,
      [0, 1],
      [colors.warning.soft, colors.success.soft],
    ),
  }));

  // Children's effective top inset is animated alongside the slide so
  // descendants reading useSafeAreaInsets get a smooth transition
  // rather than a step from insets.top to 0 (or vice-versa) at the
  // start of the animation.
  const [animatedTopInset, setAnimatedTopInset] = useState(insets.top);
  const childInsets = useMemo(
    () => ({ ...insets, top: animatedTopInset }),
    [insets, animatedTopInset],
  );
  useEffect(() => {
    if (children === undefined || insets.top === 0) {
      setAnimatedTopInset(visible ? 0 : insets.top);
      return;
    }
    const from = animatedTopInset;
    const to = visible ? 0 : insets.top;
    if (from === to) return;
    const start = Date.now();
    let raf = 0;
    const tick = () => {
      const t = Math.min(1, (Date.now() - start) / SLIDE_ANIM_MS);
      const eased = 1 - Math.pow(1 - t, 3);
      setAnimatedTopInset(from + (to - from) * eased);
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, insets.top]);

  const onContentLayout = (e: LayoutChangeEvent) => {
    const h = e.nativeEvent.layout.height;
    if (h > 0 && Math.abs(h - measuredHeight.value) > 0.5) {
      measuredHeight.value = h;
      if (!hasMeasured) {
        setHasMeasured(true);
        // If we're already meant to be visible at first measurement
        // (e.g. device booted offline), snap progress so we don't
        // play an unwanted entrance animation.
        if (visible) progress.value = 1;
      }
    }
  };

  const banner = (
    <Animated.View
      testID="connection-banner"
      pointerEvents={visible ? "auto" : "none"}
      style={[
        { overflow: "hidden" },
        animatedBgStyle,
        hasMeasured ? wrapperStyle : { height: 0, opacity: 0 },
      ]}
    >
      <View
        // Anchored to the bottom of the wrapper so as the wrapper grows
        // from 0 → contentHeight, the content appears to slide down out
        // from under the status bar; on close it slides back up.
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 0,
          paddingTop: insets.top,
        }}
        onLayout={onContentLayout}
      >
        <View className="flex-row items-center gap-2 px-4 py-2">
          {mode === "offline" ? (
            <Animated.View
              key="offline-content"
              entering={FadeIn.duration(CROSSFADE_MS)}
              exiting={FadeOut.duration(CROSSFADE_MS)}
              testID="connection-banner-offline"
              className="flex-1 flex-row items-center gap-2"
            >
              <WifiOff size={16} color={colors.warning.text} />
              <Text className="flex-1 text-sm text-warning-text">
                Offline — your changes will sync when you're back online.
              </Text>
            </Animated.View>
          ) : (
            <Animated.View
              key="online-content"
              entering={FadeIn.duration(CROSSFADE_MS)}
              exiting={FadeOut.duration(CROSSFADE_MS)}
              testID="connection-banner-online"
              className="flex-1 flex-row items-center gap-2"
            >
              <Wifi size={16} color={colors.success.text} />
              <Text className="flex-1 text-sm text-success-text">
                Reconnected
              </Text>
            </Animated.View>
          )}
        </View>
      </View>
    </Animated.View>
  );

  if (children === undefined) {
    return banner;
  }

  return (
    <>
      {banner}
      <SafeAreaInsetsContext.Provider value={childInsets}>
        {children}
      </SafeAreaInsetsContext.Provider>
    </>
  );
}
