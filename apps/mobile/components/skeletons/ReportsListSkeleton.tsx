import { View } from "react-native";
import { Skeleton, SkeletonRow } from "@/components/ui/Skeleton";

function ReportRowSkeleton() {
  return (
    <View className="px-5 pt-3">
      <View className="rounded-lg border border-border bg-card p-3 flex-row items-center gap-3">
        <Skeleton width={40} height={40} radius={8} />
        <View className="flex-1 gap-2">
          <SkeletonRow className="justify-between">
            <Skeleton width="55%" height={18} />
            <Skeleton width={48} height={22} radius={6} />
          </SkeletonRow>
          <Skeleton width="40%" height={13} />
        </View>
      </View>
    </View>
  );
}

/** Skeleton for the "New report" dashed card. */
function NewReportCardSkeleton() {
  return (
    <View className="px-5 pt-3">
      <View className="flex-row items-center gap-3 rounded-lg border border-dashed border-border bg-surface-muted p-3">
        <Skeleton width={40} height={40} radius={8} />
        <View className="flex-1 gap-2">
          <Skeleton width="35%" height={18} />
          <Skeleton width="55%" height={13} />
        </View>
      </View>
    </View>
  );
}

/** Full-screen skeleton for the reports list. */
export function ReportsListSkeleton() {
  return (
    <View className="flex-1 pt-2">
      <NewReportCardSkeleton />
      <ReportRowSkeleton />
      <ReportRowSkeleton />
      <ReportRowSkeleton />
    </View>
  );
}
