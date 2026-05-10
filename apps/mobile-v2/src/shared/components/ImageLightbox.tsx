/**
 * Image lightbox modal for preview.
 */
import { useState } from "react";
import {
  Modal,
  View,
  Image,
  ActivityIndicator,
  Pressable,
  Text,
} from "react-native";
import { testIds } from "@/infra/test-ids";
import { colors } from "@/design-tokens/colors";

type ImageLightboxProps = {
  visible: boolean;
  imageUri: string | null;
  onClose: () => void;
};

export function ImageLightbox({
  visible,
  imageUri,
  onClose,
}: ImageLightboxProps) {
  const [loading, setLoading] = useState(true);

  if (!imageUri) return null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View className="flex-1 bg-black">
        {/* Close button */}
        <View className="absolute top-12 right-4 z-10">
          <Pressable
            onPress={onClose}
            className="bg-white/20 rounded-full p-3"
            testID={testIds.images.closePreviewButton}
          >
            <Text className="text-white text-lg font-bold">✕</Text>
          </Pressable>
        </View>

        {/* Loading indicator */}
        {loading && (
          <View
            className="absolute inset-0 items-center justify-center"
            testID={testIds.images.previewLoading}
          >
            <ActivityIndicator size="large" color={colors.primary.DEFAULT} />
          </View>
        )}

        {/* Image */}
        <Image
          source={{ uri: imageUri }}
          className="flex-1"
          resizeMode="contain"
          onLoadStart={() => setLoading(true)}
          onLoadEnd={() => setLoading(false)}
          testID={testIds.images.preview}
        />
      </View>
    </Modal>
  );
}
