import { useEffect } from "react";
import { View, Modal, Dimensions, Pressable } from "react-native";
import { colors } from "@/lib/design-tokens/colors";
import {
  SafeAreaProvider,
  SafeAreaView,
} from "react-native-safe-area-context";
import { X } from "lucide-react-native";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { CachedImage } from "@/components/ui/CachedImage";
import { prefetchImages } from "@/lib/image-cache";

interface ImagePreviewModalProps {
  visible: boolean;
  uri: string | null;
  title?: string;
  onClose: () => void;
  /** Stable storage path so disk cache survives signed-URL rotation. */
  cacheKey?: string | null;
  /** Intrinsic dimensions to reserve aspect ratio while pixels load. */
  intrinsicWidth?: number | null;
  intrinsicHeight?: number | null;
  /**
   * Phase 2: when present, render the small thumbnail signed URL as the
   * `placeholder` so the user sees content immediately, then crossfade
   * into the full-res `uri` once it has loaded.
   */
  placeholderUri?: string | null;
  /** Phase 2: encoded BlurHash placeholder (used when no thumbnail URL). */
  blurhash?: string | null;
  /**
   * Phase 2: adjacent-photo prefetch. The modal warms the disk cache for
   * these URIs (typically the previous + next image in a gallery) while
   * the current photo is rendered, so swiping is instant.
   */
  prefetchUris?: ReadonlyArray<string | null | undefined>;
}

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get("window");

export function ImagePreviewModal({
  visible,
  uri,
  title = "Image",
  onClose,
  cacheKey,
  intrinsicWidth,
  intrinsicHeight,
  placeholderUri,
  blurhash,
  prefetchUris,
}: ImagePreviewModalProps) {
  useEffect(() => {
    if (!visible || !prefetchUris || prefetchUris.length === 0) return;
    void prefetchImages(prefetchUris);
  }, [visible, prefetchUris]);

  return (
    <Modal
      visible={visible}
      animationType="fade"
      presentationStyle="fullScreen"
      onRequestClose={onClose}
    >
      <SafeAreaProvider>
        <SafeAreaView className="flex-1 bg-black" edges={["top", "bottom"]}>
          <View className="flex-row items-center justify-between px-4 py-2">
            <ScreenHeader title={title} hideActions />
            <Pressable
              onPress={onClose}
              accessibilityLabel="Close image preview"
              testID="btn-close-image-preview"
              className="rounded-full bg-white/20 p-2"
            >
              <X size={22} color={colors.primary.foreground} />
            </Pressable>
          </View>
          <View className="flex-1 items-center justify-center px-4">
            {uri ? (
              <CachedImage
                source={{ uri }}
                placeholder={placeholderUri ? { uri: placeholderUri } : undefined}
                blurhash={blurhash ?? undefined}
                placeholderContentFit="contain"
                cacheKey={cacheKey ?? undefined}
                intrinsicWidth={intrinsicWidth}
                intrinsicHeight={intrinsicHeight}
                style={{ width: SCREEN_WIDTH - 32, height: SCREEN_HEIGHT * 0.7 }}
                contentFit="contain"
                testID="image-preview"
                accessibilityLabel={title}
              />
            ) : null}
          </View>
        </SafeAreaView>
      </SafeAreaProvider>
    </Modal>
  );
}
