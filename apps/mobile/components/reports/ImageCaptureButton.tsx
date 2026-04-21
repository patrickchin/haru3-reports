// Camera/library toolbar button that drives the capture -> attach flow.
//
// Flow:
//   1. Action sheet: [Take Photo] [Choose from Library] [Cancel]
//   2. captureAndEnqueueImage() processes + enqueues
//   3. ImageAttachSheet asks the user where to attach
//   4. On confirm, updates the queued item's linkedTo and caption

import { useState } from "react";
import {
  ActionSheetIOS,
  Alert,
  Platform,
  Pressable,
  Text,
  View,
} from "react-native";
import { Camera } from "lucide-react-native";
import { ImageAttachSheet } from "./ImageAttachSheet";
import { captureAndEnqueueImage } from "@/lib/image-capture";
import { uploadQueue, type QueuedImage } from "@/lib/image-upload-queue";
import {
  listAttachTargets,
  suggestAttachTarget,
  type AttachSuggestion,
} from "@/lib/image-attach-suggestion";
import type { GeneratedSiteReport } from "@/lib/generated-report";

interface ImageCaptureButtonProps {
  reportId: string;
  projectId: string;
  report: GeneratedSiteReport | null;
  /**
   * 1-based index of the note that was most recently added to the report.
   * Used as the "preceding note" for the attach suggestion when the AI
   * hasn't yet produced a placement for this photo.
   */
  precedingNoteIndex: number | null;
  /** Number of existing photos on this report, for sort_order. */
  existingImageCount: number;
  onCaptured?: (queued: QueuedImage) => void;
}

export function ImageCaptureButton({
  reportId,
  projectId,
  report,
  precedingNoteIndex,
  existingImageCount,
  onCaptured,
}: ImageCaptureButtonProps) {
  const [pending, setPending] = useState<QueuedImage | null>(null);
  const [suggestion, setSuggestion] = useState<AttachSuggestion>({
    target: null,
    source: "none",
  });

  const openSource = () => {
    const doCapture = (source: "camera" | "library") => {
      void handleCapture(source);
    };

    if (Platform.OS === "ios") {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          options: ["Cancel", "Take Photo", "Choose from Library"],
          cancelButtonIndex: 0,
        },
        (i) => {
          if (i === 1) doCapture("camera");
          if (i === 2) doCapture("library");
        },
      );
      return;
    }

    Alert.alert(
      "Add photo",
      undefined,
      [
        { text: "Take Photo", onPress: () => doCapture("camera") },
        { text: "Choose from Library", onPress: () => doCapture("library") },
        { text: "Cancel", style: "cancel" },
      ],
    );
  };

  const handleCapture = async (source: "camera" | "library") => {
    try {
      const result = await captureAndEnqueueImage({
        reportId,
        projectId,
        source,
        linkedTo: null,
        sortOrder: existingImageCount,
        afterNoteIndex: precedingNoteIndex ?? 0,
      });
      if (!result) return;

      const s = suggestAttachTarget({
        report,
        photoId: result.queued.id,
        precedingNoteIndex,
      });
      setSuggestion(s);
      setPending(result.queued);

      // Apply suggested target optimistically; user can override via sheet.
      if (s.target) {
        await uploadQueue.updateLinkedTo(result.queued.id, s.target.linkedTo);
      }
      onCaptured?.(result.queued);
    } catch (err) {
      Alert.alert("Could not add photo", messageOf(err));
    }
  };

  const handleConfirm = async ({
    linkedTo,
    caption,
  }: {
    linkedTo: string | null;
    caption: string | null;
  }) => {
    if (!pending) return;
    await uploadQueue.updateLinkedTo(pending.id, linkedTo);
    if (caption != null) {
      await uploadQueue.updateCaption(pending.id, caption);
    }
    setPending(null);
  };

  return (
    <View>
      <Pressable
        onPress={openSource}
        className="h-10 w-10 items-center justify-center rounded-full border border-border bg-surface"
        accessibilityLabel="Add photo"
      >
        <Camera size={18} />
      </Pressable>

      {pending ? (
        <ImageAttachSheet
          visible
          suggestion={suggestion}
          otherTargets={listAttachTargets(report)}
          initialCaption={pending.caption ?? ""}
          onConfirm={handleConfirm}
          onCancel={() => setPending(null)}
        />
      ) : null}
    </View>
  );
}

function messageOf(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
