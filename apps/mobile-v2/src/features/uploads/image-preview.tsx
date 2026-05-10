/**
 * Image preview lightbox modal.
 *
 * Full-screen modal displaying an image with close button.
 * Supports loading states and pinch-to-zoom (future enhancement).
 */
import { Modal, View, Image, Pressable, ActivityIndicator } from "react-native";
import { X } from "lucide-react-native";
import { testIds } from "@/infra/test-ids";
import { useState } from "react";

export interface ImagePreviewProps {
  visible: boolean;
  imageUrl: string | null;
  onClose: () => void;
}

export function ImagePreview({ visible, imageUrl, onClose }: ImagePreviewProps) {
  const [loading, setLoading] = useState(true);

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
            className="w-10 h-10 rounded-full bg-white/20 items-center justify-center"
            testID={testIds.images.closePreviewButton}
          >
            <X size={24} color="#fff" />
          </Pressable>
        </View>

        {/* Image */}
        <View className="flex-1 items-center justify-center">
          {loading && (
            <ActivityIndicator
              size="large"
              color="#fff"
              testID={testIds.images.previewLoading}
            />
          )}
          {imageUrl && (
            <Image
              source={{ uri: imageUrl }}
              className="w-full h-full"
              resizeMode="contain"
              onLoadStart={() => setLoading(true)}
              onLoad={() => setLoading(false)}
              testID={testIds.images.preview}
            />
          )}
        </View>
      </View>
    </Modal>
  );
}
