/**
 * ConnectionBanner — sticky offline / reconnected indicator.
 *
 * Animation contract:
 *   - Entry: when the banner first appears (offline detected, or reconnect
 *     pulse after offline), the outer wrapper slides down + fades in.
 *   - Exit:  when the banner is dismissed (back online + pulse expired),
 *     the wrapper slides up + fades out.
 *   - Mode swap: while visible, transitioning from "offline" to
 *     "reconnected" (or vice-versa) does NOT remount the wrapper. The
 *     background colour is interpolated, and the inner icon + text
 *     cross-fade in place — so there's no flicker, gap, or layout jump.
 *
 * When visible, the banner consumes the status-bar safe-area inset itself
 * and overrides `SafeAreaInsetsContext` with `top: 0` for the wrapped
 * children, so screens using `SafeAreaView` / `useSafeAreaInsets` don't
 * stack a second copy of the inset under the banner.
 */
import { type ReactNode, useEffect, useRef, useState } from "react";
import { Text, View } from "react-native";
import Animated, {
  FadeIn,
  FadeOut,
  SlideInUp,
  SlideOutUp,
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
const BG_ANIM_MS = 240;
const SLIDE_ANIM_MS = 260;
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

  // While visible, descendants treat the top inset as 0 (banner already
  // covers it) so SafeAreaView usage doesn't double-pad.
  const childInsets = visible ? { ...insets, top: 0 } : insets;

  // Animate background colour smoothly when mode swaps without remount.
  const modeProgress = useSharedValue(mode === "online" ? 1 : 0);
  useEffect(() => {
    modeProgress.value = withTiming(mode === "online" ? 1 : 0, {
      duration: BG_ANIM_MS,
    });
  }, [mode, modeProgress]);

  const animatedBgStyle = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(
      modeProgress.value,
      [0, 1],
      [colors.warning.soft, colors.success.soft],
    ),
  }));

  const banner = visible ? (
    <Animated.View
      entering={SlideInUp.duration(SLIDE_ANIM_MS)}
      exiting={SlideOutUp.duration(SLIDE_ANIM_MS)}
      testID="connection-banner"
      style={[{ paddingTop: insets.top }, animatedBgStyle]}
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
    </Animated.View>
  ) : null;

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
