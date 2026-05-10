/**
 * Compact pill that surfaces upload-queue activity at-a-glance.
 *
 * Two visual modes:
 *   - failed jobs present  → danger pill `! N`  (takes precedence)
 *   - active jobs in-flight → primary pill `↑ N`
 *   - otherwise            → renders `null`
 *
 * Renders no `Pressable` itself — wrap it in the consumer if a tap
 * should reveal the upload tray. Keeping it a pure presentational
 * primitive lets the same badge live in a tab bar, a toolbar, or a
 * header without dragging navigation behaviour into the component.
 */
import { Text, View } from "react-native";
import { ArrowUp, AlertCircle } from "lucide-react-native";

import { useUploadQueue } from "@/hooks/useUploadQueue";
import { colors } from "@/lib/design-tokens/colors";
import { cn } from "@/lib/utils";
import type { UploadQueue } from "@/lib/uploads";

export interface UploadTrayBadgeProps {
  /** Inject a queue (tests). Defaults to the singleton. */
  queue?: UploadQueue;
  /** Extra className applied to the outer pill. */
  className?: string;
}

export function UploadTrayBadge({ queue, className }: UploadTrayBadgeProps) {
  const { activeCount, failedCount } = useUploadQueue({ queue });

  if (failedCount > 0) {
    return (
      <View
        accessibilityRole="text"
        accessibilityLabel={`${failedCount} upload${failedCount === 1 ? "" : "s"} failed`}
        className={cn(
          "flex-row items-center gap-1 rounded-full bg-danger px-2 py-0.5",
          className,
        )}
      >
        <AlertCircle size={12} color={colors.primary.foreground} />
        <Text className="text-xs font-semibold text-primary-foreground">
          {failedCount}
        </Text>
      </View>
    );
  }

  if (activeCount > 0) {
    return (
      <View
        accessibilityRole="text"
        accessibilityLabel={`${activeCount} upload${activeCount === 1 ? "" : "s"} in progress`}
        className={cn(
          "flex-row items-center gap-1 rounded-full bg-primary px-2 py-0.5",
          className,
        )}
      >
        <ArrowUp size={12} color={colors.primary.foreground} />
        <Text className="text-xs font-semibold text-primary-foreground">
          {activeCount}
        </Text>
      </View>
    );
  }

  return null;
}
