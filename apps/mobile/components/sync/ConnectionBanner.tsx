/**
 * ConnectionBanner — sticky offline / reconnected indicator.
 *
 * When visible, the banner consumes the status-bar safe-area inset itself
 * and overrides `SafeAreaInsetsContext` with `top: 0` for the wrapped
 * children, so screens using `SafeAreaView` / `useSafeAreaInsets` don't
 * stack a second copy of the inset under the banner.
 */
import { type ReactNode, useEffect, useRef, useState } from "react";
import { Text, View } from "react-native";
import Animated, { FadeIn, FadeOut } from "react-native-reanimated";
import {
  SafeAreaInsetsContext,
  useSafeAreaInsets,
} from "react-native-safe-area-context";
import { WifiOff, Wifi } from "lucide-react-native";

import { useSyncDb } from "@/lib/sync/SyncProvider";
import { colors } from "@/lib/design-tokens/colors";

const BACK_ONLINE_DISPLAY_MS = 2_500;

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
    // Came back online after being offline.
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

  // While the banner is visible it already covers the status-bar inset,
  // so descendants should treat the top inset as 0 to avoid double padding.
  const childInsets = visible ? { ...insets, top: 0 } : insets;

  const banner = !isOnline ? (
    <Animated.View
      entering={FadeIn.duration(200)}
      exiting={FadeOut.duration(200)}
      testID="connection-banner-offline"
      style={{ paddingTop: insets.top, backgroundColor: colors.warning.soft }}
    >
      <View className="flex-row items-center gap-2 bg-warning-soft px-4 py-2">
        <WifiOff size={16} color={colors.warning.text} />
        <Text className="flex-1 text-sm text-warning-text">
          Offline — your changes will sync when you're back online.
        </Text>
      </View>
    </Animated.View>
  ) : showReconnected ? (
    <Animated.View
      entering={FadeIn.duration(200)}
      exiting={FadeOut.duration(200)}
      testID="connection-banner-online"
      style={{ paddingTop: insets.top, backgroundColor: colors.success.soft }}
    >
      <View className="flex-row items-center gap-2 bg-success-soft px-4 py-2">
        <Wifi size={16} color={colors.success.text} />
        <Text className="flex-1 text-sm text-success-text">Reconnected</Text>
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
