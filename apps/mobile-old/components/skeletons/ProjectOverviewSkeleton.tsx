import { View } from "react-native";
import { Skeleton, SkeletonRow } from "@/components/ui/Skeleton";

/** Matches the stat row + action cards on the project overview screen. */
export function ProjectOverviewSkeleton() {
  return (
    <View
      className="flex-1"
      style={{ paddingHorizontal: 20, paddingTop: 8, paddingBottom: 24, gap: 16 }}
    >
      {/* Client / address row + Edit button */}
      <SkeletonRow className="justify-between">
        <View className="flex-1 gap-2">
          <Skeleton width="55%" height={16} />
          <Skeleton width="70%" height={14} />
        </View>
        <Skeleton width={60} height={36} radius={8} />
      </SkeletonRow>

      {/* Stat tiles */}
      <View className="flex-row gap-3">
        <View className="min-h-[92px] flex-1 items-center justify-center rounded-lg border border-border bg-card px-3 py-3 gap-2">
          <Skeleton width={40} height={28} />
          <Skeleton width={72} height={12} />
        </View>
        <View className="min-h-[92px] flex-1 items-center justify-center rounded-lg border border-border bg-card px-3 py-3 gap-2">
          <Skeleton width={24} height={28} />
          <Skeleton width={48} height={12} />
        </View>
      </View>

      {/* Last report card */}
      <View className="rounded-lg border border-border bg-surface-muted p-4 gap-2">
        <Skeleton width={80} height={12} />
        <Skeleton width="50%" height={18} />
      </View>

      {/* Action cards */}
      <ActionCardSkeleton />
      <ActionCardSkeleton />
      <ActionCardSkeleton />
      <ActionCardSkeleton />
    </View>
  );
}

function ActionCardSkeleton() {
  return (
    <View className="rounded-lg border border-border bg-card p-4 flex-row items-center gap-3">
      <Skeleton width={40} height={40} radius={8} />
      <View className="flex-1 gap-2">
        <Skeleton width="40%" height={18} />
        <Skeleton width="65%" height={13} />
      </View>
      <Skeleton width={18} height={18} circle />
    </View>
  );
}
