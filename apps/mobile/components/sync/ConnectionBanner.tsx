/**
 * ConnectionBanner — sticky offline indicator.
 *
 * Rendered at the top of primary screens when local-first is enabled and
 * the device is offline. Auto-hides on reconnect with a brief "Back online"
 * confirmation before fading out.
 */
import { useEffect, useRef, useState } from "react";
import { Text, View } from "react-native";
import Animated, { FadeIn, FadeOut } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { WifiOff, Wifi } from "lucide-react-native";

import { useSyncDb } from "@/lib/sync/SyncProvider";
import { colors } from "@/lib/design-tokens/colors";

const BACK_ONLINE_DISPLAY_MS = 2_500;

export function ConnectionBanner() {
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

  if (!isOnline) {
    return (
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
    );
  }

  if (showReconnected) {
    return (
      <Animated.View
        entering={FadeIn.duration(200)}
        exiting={FadeOut.duration(200)}
        testID="connection-banner-online"
        style={{ paddingTop: insets.top, backgroundColor: colors.success.soft }}
      >
        <View className="flex-row items-center gap-2 bg-success-soft px-4 py-2">
          <Wifi size={16} color={colors.success.text} />
          <Text className="flex-1 text-sm text-success-text">
            Back online — syncing your changes.
          </Text>
        </View>
      </Animated.View>
    );
  }

  return null;
}
