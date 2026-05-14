import { forwardRef, useMemo } from "react";
import { ScrollView, Text, View } from "react-native";
import Animated, { FadeIn } from "react-native-reanimated";
import { Pencil, RotateCcw } from "lucide-react-native";
import { Button } from "@/components/ui/Button";
import { InlineNotice } from "@/components/ui/InlineNotice";
import { CompletenessCard } from "@/components/reports/CompletenessCard";
import { ReportView } from "@/components/reports/ReportView";
import { ReportPhotos } from "@/components/reports/ReportPhotos";
import { useGenerateReport } from "@/components/reports/generate/GenerateReportProvider";
import { colors } from "@/lib/design-tokens/colors";
import { createEmptyReport } from "@/lib/report-edit-helpers";

interface ReportTabPaneProps {
  width: number;
}

/**
 * Report tab. Pure display: pulls report state from `useGenerateReport()`
 * and renders the read-only `ReportView`. Manual editing happens in the
 * dedicated Edit tab.
 */
export const ReportTabPane = forwardRef<ScrollView, ReportTabPaneProps>(
  function ReportTabPane({ width }, ref) {
    const { generation, draft, handleRegenerate, tabs, projectId, notes, members, preview } =
      useGenerateReport();

    // Skeleton shown on the "no report yet" empty state. Built via
    // `createEmptyReport()` so the same defaults (e.g. `visitDate` = today)
    // apply whether the user is staring at the empty Report tab or has just
    // tapped "Edit manually". Memoized once per mount — `createEmptyReport`
    // calls `new Date()`, which would otherwise change identity every render
    // and force CompletenessCard to re-render.
    const emptyReportSkeleton = useMemo(() => createEmptyReport(), []);

    return (
      <View style={{ width }} className="flex-1">
        <ScrollView
          ref={ref}
          className="flex-1 px-5"
          contentContainerStyle={{ paddingBottom: 100 }}
          keyboardShouldPersistTaps="handled"
        >
          {/* Error banner — render before any skeleton/content so the
              regeneration failure is the first thing the user sees. */}
          {generation.error && (
            <Animated.View entering={FadeIn}>
              <InlineNotice tone="danger" className="mb-3">
                {generation.error}
              </InlineNotice>
              <View className="mb-3">
                <Button variant="secondary" size="sm" onPress={handleRegenerate}>
                  <View className="flex-row items-center gap-1.5">
                    <RotateCcw size={14} color={colors.foreground} />
                    <Text className="text-base font-semibold text-foreground">
                      Retry
                    </Text>
                  </View>
                </Button>
              </View>
            </Animated.View>
          )}

          {/* No report yet — show skeleton of missing fields */}
          {!generation.report && !generation.isUpdating && (
            <View className="gap-3">
              <CompletenessCard report={emptyReportSkeleton} />
              <Button
                testID="btn-edit-manually"
                variant="secondary"
                size="default"
                className="w-full"
                onPress={tabs.editManually}
              >
                <View className="flex-row items-center gap-1.5">
                  <Pencil size={14} color={colors.foreground} />
                  <Text className="text-base font-semibold text-foreground">
                    Edit manually
                  </Text>
                </View>
              </Button>
            </View>
          )}

          {/* Generating shimmer */}
          {generation.isUpdating && !generation.report && (
            <View className="gap-3">
              <InlineNotice tone="info">
                Generating your report from the notes collected so far...
              </InlineNotice>
              {[1, 2, 3, 4].map((i) => (
                <Animated.View
                  key={i}
                  entering={FadeIn}
                  className="h-20 rounded-lg bg-secondary"
                />
              ))}
            </View>
          )}

          {/* Live report */}
          {generation.report && (
            <View className="gap-3">
              {generation.isUpdating && (
                <Animated.View entering={FadeIn}>
                  <InlineNotice tone="info">
                    Updating the draft with your newest notes...
                  </InlineNotice>
                </Animated.View>
              )}

              <CompletenessCard report={generation.report} />

              <ReportView report={generation.report} />

              <ReportPhotos
                projectId={projectId}
                noteRows={notes.rows}
                memberNames={members}
                onOpenFile={preview.openFile}
              />

              {draft.finalizeError && (
                <Animated.View entering={FadeIn}>
                  <InlineNotice tone="danger">
                    {draft.finalizeError instanceof Error
                      ? draft.finalizeError.message
                      : "Failed to finalize report."}
                  </InlineNotice>
                </Animated.View>
              )}
            </View>
          )}
        </ScrollView>
      </View>
    );
  },
);
