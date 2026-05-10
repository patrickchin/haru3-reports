import { View } from "react-native";
import { Skeleton } from "@/components/ui/Skeleton";

/** Skeleton for the edit-project form fields. */
export function EditProjectSkeleton() {
  return (
    <View className="flex-1 px-5 gap-5">
      {/* Project Name field */}
      <View className="gap-2">
        <Skeleton width={100} height={14} />
        <Skeleton width="100%" height={48} radius={8} />
      </View>

      {/* Project Address field */}
      <View className="gap-2">
        <Skeleton width={110} height={14} />
        <Skeleton width="100%" height={48} radius={8} />
      </View>

      {/* Client Name field */}
      <View className="gap-2">
        <Skeleton width={90} height={14} />
        <Skeleton width="100%" height={48} radius={8} />
      </View>

      {/* Warning notice */}
      <Skeleton width="100%" height={64} radius={8} />

      {/* Delete button */}
      <Skeleton width={140} height={44} radius={8} />

      {/* Save button */}
      <Skeleton width="100%" height={52} radius={8} />
    </View>
  );
}
