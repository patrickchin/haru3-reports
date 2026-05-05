/**
 * ConnectionBanner — sticky offline / reconnected indicator.
 *
 * Layout & animation contract:
 *   - There is exactly one banner instance. The "offline" and
 *     "reconnected" copies are two states of the same banner; the
 *     wrapper never unmounts. Mode swaps cross-fade icon + text in
 *     place and interpolate the background colour.
 *   - The banner *always* reserves the status-bar safe-area inset
 *     (rendered as a coloured spacer above the message body), and the
 *     children always see a `top: 0` inset via SafeAreaInsetsContext.
 *     This means the layout the rest of the app sees is identical
 *     whether the banner is open or closed: the screens' SafeAreaView
 *     never emits its own status-bar padding — that job belongs to the
 *     banner. No double padding, no inset that animates on the JS
 *     thread, no per-frame re-renders of the subtree below.
 *   - Open / close animates the *message body* only: its height grows
 *     from 0 to the measured intrinsic content height (and shrinks
 *     back) on the UI thread via Reanimated. Because the wrapper
 *     occupies real flow height, the rest of the app slides smoothly
 *     by exactly the message-body delta — no jump on either edge, no
 *     fight between JS- and UI-thread animations.
 *   - The spacer's background colour is also driven by `progress`:
 *     transparent (matching the screen behind) when closed, fully
 *     opaque warning/success colour when open. Mode swap interpolates
 *     between warning/success.
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

  // 0 = banner closed, 1 = fully open. Drives message-body height,
  // wrapper opacity, and the spacer's background-colour fade.
  const progress = useSharedValue(0);
  // 0 = warning (offline), 1 = success (reconnected).
  const modeProgress = useSharedValue(mode === "online" ? 1 : 0);
  // Measured intrinsic height of the message body (icon row + padding,
  // excluding the status-bar spacer). Updated via onLayout.
  const measuredHeight = useSharedValue(0);
  const [hasMeasured, setHasMeasured] = useState(false);

  useEffect(() => {
    progress.value = withTiming(visible ? 1 : 0, {
      duration: SLIDE_ANIM_MS,
      easing: Easing.out(Easing.cubic),
    });
  }, [visible, progress]);

  useEffect(() => {
    modeProgress.value = withTiming(mode === "online" ? 1 : 0, {
      duration: SLIDE_ANIM_MS,
      easing: Easing.out(Easing.cubic),
    });
  }, [mode, modeProgress]);

  // Status-bar spacer: always insets.top tall. Background interpolates
  // mode colour and fades to fully transparent as progress → 0.
  const spacerStyle = useAnimatedStyle(() => ({
    height: insets.top,
    backgroundColor: interpolateColor(
      modeProgress.value,
      [0, 1],
      [colors.warning.soft, colors.success.soft],
    ),
    opacity: progress.value,
  }));

  // Message body: height grows 0 → measuredHeight as progress → 1.
  // Background interpolates mode colour at full opacity; the wrapper's
  // height being 0 is what hides it when closed. (A separate opacity
  // fade is unnecessary here and would just add a second variable.)
  const bodyStyle = useAnimatedStyle(() => ({
    height: measuredHeight.value * progress.value,
    backgroundColor: interpolateColor(
      modeProgress.value,
      [0, 1],
      [colors.warning.soft, colors.success.soft],
    ),
  }));

  // Children's effective top inset is a constant 0 — the banner area
  // already reserves insets.top above them at all times. This is the
  // critical change vs. the previous JS-thread inset interpolation:
  // the subtree never re-renders during the open/close animation.
  const childInsets = useMemo(
    () => ({ ...insets, top: 0 }),
    [insets],
  );

  const onContentLayout = (e: LayoutChangeEvent) => {
    const h = e.nativeEvent.layout.height;
    if (h > 0 && Math.abs(h - measuredHeight.value) > 0.5) {
      measuredHeight.value = h;
      if (!hasMeasured) {
        setHasMeasured(true);
        // First measurement: if we're already meant to be visible
        // (e.g. device booted offline), snap progress to 1 so we don't
        // play an unwanted entrance animation on mount.
        if (visible) progress.value = 1;
      }
    }
  };

  const banner = (
    <View
      testID="connection-banner"
      pointerEvents={visible ? "auto" : "none"}
      // Outer wrapper carries the screen background so when the spacer
      // fades to transparent (banner closed) the status-bar area shows
      // app-background, not OS chrome / random bleed-through.
      style={{ backgroundColor: colors.background }}
    >
      <Animated.View style={spacerStyle} />
      <Animated.View
        style={[{ overflow: "hidden" }, hasMeasured ? bodyStyle : { height: 0 }]}
      >
        {/* Anchored to the bottom so as the body grows from 0, content
            slides down out from under the status-bar spacer; on close
            it slides back up beneath it. */}
        <View
          style={{ position: "absolute", left: 0, right: 0, bottom: 0 }}
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
    </View>
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
