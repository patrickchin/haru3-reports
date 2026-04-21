// Horizontal thumbnail strip for images attached to a specific activity/issue
// or unlinked (top-level). Opens the lightbox on tap.

import { useState } from "react";
import { View, Text, ScrollView } from "react-native";
import { ImageThumbnail } from "./ImageThumbnail";
import { ImageLightbox } from "./ImageLightbox";
import type { ReportImageView } from "@/hooks/useReportImages";

interface ImageThumbnailStripProps {
  images: ReportImageView[];
  label?: string;
}

export function ImageThumbnailStrip({
  images,
  label,
}: ImageThumbnailStripProps) {
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  if (images.length === 0) return null;

  return (
    <View className="gap-2">
      {label ? (
        <Text className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {label}
        </Text>
      ) : null}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: 8 }}
      >
        {images.map((image, index) => (
          <ImageThumbnail
            key={image.id}
            image={image}
            onPress={() => setLightboxIndex(index)}
          />
        ))}
      </ScrollView>

      {lightboxIndex !== null && (
        <ImageLightbox
          images={images}
          initialIndex={lightboxIndex}
          onClose={() => setLightboxIndex(null)}
        />
      )}
    </View>
  );
}
