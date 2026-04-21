// Full-screen image viewer with swipe between images, caption display,
// and a delete action.

import { useState } from "react";
import {
  Modal,
  View,
  Text,
  Pressable,
  FlatList,
  Dimensions,
  Alert,
} from "react-native";
import { Image } from "expo-image";
import { X, Trash2 } from "lucide-react-native";
import { useSignedImageUrl } from "@/hooks/useSignedImageUrl";
import { uploadQueue } from "@/lib/image-upload-queue";
import { backend } from "@/lib/backend";
import { getImageStorageProvider } from "@/lib/image-storage-provider";
import type { ReportImageView } from "@/hooks/useReportImages";

interface ImageLightboxProps {
  images: ReportImageView[];
  initialIndex: number;
  onClose: () => void;
}

export function ImageLightbox({
  images,
  initialIndex,
  onClose,
}: ImageLightboxProps) {
  const [index, setIndex] = useState(initialIndex);
  const { width, height } = Dimensions.get("window");

  const current = images[index];

  const handleDelete = () => {
    Alert.alert(
      "Delete photo?",
      "This cannot be undone.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            await deleteImage(current);
            onClose();
          },
        },
      ],
    );
  };

  return (
    <Modal
      visible
      transparent
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View className="flex-1 bg-black">
        <FlatList
          data={images}
          horizontal
          pagingEnabled
          initialScrollIndex={initialIndex}
          getItemLayout={(_, i) => ({ length: width, offset: width * i, index: i })}
          showsHorizontalScrollIndicator={false}
          onMomentumScrollEnd={(e) => {
            const next = Math.round(e.nativeEvent.contentOffset.x / width);
            setIndex(next);
          }}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <LightboxPage image={item} width={width} height={height} />
          )}
        />

        {/* Top controls */}
        <View className="absolute left-0 right-0 top-0 flex-row items-center justify-between px-4 pt-12">
          <Pressable
            onPress={onClose}
            className="h-10 w-10 items-center justify-center rounded-full bg-black/60"
          >
            <X size={20} color="white" />
          </Pressable>
          <View className="rounded-full bg-black/60 px-3 py-1">
            <Text className="text-sm text-white">
              {index + 1} / {images.length}
            </Text>
          </View>
          <Pressable
            onPress={handleDelete}
            className="h-10 w-10 items-center justify-center rounded-full bg-black/60"
          >
            <Trash2 size={20} color="white" />
          </Pressable>
        </View>

        {/* Caption */}
        {current?.caption ? (
          <View className="absolute bottom-0 left-0 right-0 bg-black/70 p-4 pb-10">
            <Text className="text-base text-white">{current.caption}</Text>
          </View>
        ) : null}
      </View>
    </Modal>
  );
}

function LightboxPage({
  image,
  width,
  height,
}: {
  image: ReportImageView;
  width: number;
  height: number;
}) {
  const { data: url } = useSignedImageUrl(image.storagePath);
  return (
    <View style={{ width, height }} className="items-center justify-center">
      {url ? (
        <Image
          source={{ uri: url }}
          style={{ width, height: height * 0.8 }}
          contentFit="contain"
        />
      ) : null}
    </View>
  );
}

async function deleteImage(image: ReportImageView): Promise<void> {
  // Local-only (still queued)?
  if (image.__pending) {
    await uploadQueue.remove(image.id);
    return;
  }

  const provider = getImageStorageProvider();
  // Client-side cascade: remove storage objects first, then DB row.
  const paths = [image.storagePath];
  if (image.thumbnailPath) paths.push(image.thumbnailPath);
  try {
    await provider.delete(paths);
  } catch {
    // swallow; DB row removal will still proceed so orphan is the only risk.
  }
  await backend.from("report_images").delete().eq("id", image.id);
}
