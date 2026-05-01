import { View } from "react-native";
import { Skeleton, SkeletonRow } from "@/components/ui/Skeleton";

function MemberRowSkeleton() {
  return (
    <View className="rounded-lg border border-border bg-card p-3 flex-row items-center gap-3">
      <Skeleton width={40} height={40} circle />
      <View className="flex-1 gap-2">
        <Skeleton width="50%" height={16} />
        <Skeleton width="30%" height={12} />
      </View>
      <Skeleton width={56} height={24} radius={6} />
    </View>
  );
}

/** Skeleton for the members list screen. */
export function MembersListSkeleton() {
  return (
    <View
      className="flex-1"
      style={{ paddingHorizontal: 20, paddingTop: 8, paddingBottom: 16, gap: 12 }}
    >
      {/* Current user card */}
      <MemberRowSkeleton />

      {/* Add member dashed card */}
      <View className="flex-row items-center gap-3 rounded-lg border border-dashed border-border bg-surface-muted p-3">
        <Skeleton width={40} height={40} radius={8} />
        <View className="flex-1 gap-2">
          <Skeleton width="35%" height={16} />
          <Skeleton width="55%" height={12} />
        </View>
      </View>

      {/* Role filter pills */}
      <SkeletonRow className="gap-2">
        <Skeleton width={48} height={32} radius={8} />
        <Skeleton width={64} height={32} radius={8} />
        <Skeleton width={56} height={32} radius={8} />
        <Skeleton width={60} height={32} radius={8} />
      </SkeletonRow>

      {/* Other members */}
      <MemberRowSkeleton />
      <MemberRowSkeleton />
    </View>
  );
}
