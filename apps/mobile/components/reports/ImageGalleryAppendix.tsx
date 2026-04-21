// Bottom-of-report gallery showing unlinked (top-level) photos and any
// photos attached to top-level issues. Renders nothing if no such photos.

import { View, Text } from "react-native";
import { Card } from "@/components/ui/Card";
import { ImageThumbnailStrip } from "./ImageThumbnailStrip";
import type { ReportImageView } from "@/hooks/useReportImages";

interface ImageGalleryAppendixProps {
  images: ReportImageView[];
}

export function ImageGalleryAppendix({ images }: ImageGalleryAppendixProps) {
  if (images.length === 0) return null;

  return (
    <View className="gap-2">
      <Text className="mt-1 text-sm font-semibold uppercase tracking-[1.2px] text-muted-foreground">
        Photo Documentation
      </Text>
      <Card variant="default" padding="lg">
        <ImageThumbnailStrip images={images} />
      </Card>
    </View>
  );
}
