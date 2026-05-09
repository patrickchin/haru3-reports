import { forwardRef, useCallback, useMemo, useState } from "react";
import { ScrollView, Text, View } from "react-native";
import Animated, { FadeIn } from "react-native-reanimated";
import { Pencil, RotateCcw } from "lucide-react-native";
import { Button } from "@/components/ui/Button";
import { InlineNotice } from "@/components/ui/InlineNotice";
import { CompletenessCard } from "@/components/reports/CompletenessCard";
import { ReportView } from "@/components/reports/ReportView";
import { useGenerateReport } from "@/components/reports/generate/GenerateReportProvider";
import { colors } from "@/lib/design-tokens/colors";
import { createEmptyReport } from "@/lib/report-edit-helpers";

interface ReportTabPaneProps {
  width: number;
}

/**
 * Report tab. Owns its inline section-edit state (only consumer) and
 * pulls the rest from `useGenerateReport()`.
 */
export const ReportTabPane = forwardRef<ScrollView, ReportTabPaneProps>(
  function ReportTabPane({ width }, ref) {
    const { generation, draft, handleRegenerate, tabs } = useGenerateReport();

    // Skeleton shown on the "no report yet" empty state. Built via
    // `createEmptyReport()` so the same defaults (e.g. `visitDate` = today)
    // apply whether the user is staring at the empty Report tab or has just
    // tapped "Edit manually". Memoized once per mount — `createEmptyReport`
    // calls `new Date()`, which would otherwise change identity every render
    // and force CompletenessCard to re-render.
    const emptyReportSkeleton = useMemo(() => createEmptyReport(), []);

    // Local-only: nothing else on the screen reads or writes the
    // currently-edited section, so it lives here instead of in context.
    const [editingIndex, setEditingIndex] = useState<number | null>(null);
    const [editingContent, setEditingContent] = useState("");

    const startEditing = useCallback(
      (index: number) => {
        setEditingIndex(index);
        setEditingContent(generation.report!.report.sections[index].content);
      },
      [generation.report],
    );

    const saveEdit = useCallback(() => {
      if (editingIndex === null || !generation.report) return;
      generation.setReport((prev) =>
        prev
          ? {
              ...prev,
              report: {
                ...prev.report,
                sections: prev.report.sections.map((block, i) =>
                  i === editingIndex
                    ? { ...block, content: editingContent }
                    : block,
                ),
              },
            }
          : prev,
      );
      setEditingIndex(null);
      setEditingContent("");
    }, [editingIndex, editingContent, generation]);

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

              <ReportView
                report={generation.report}
                editable
                editingIndex={editingIndex}
                editingContent={editingContent}
                onEditStart={startEditing}
                onEditChange={setEditingContent}
                onEditSave={saveEdit}
              />

              <Animated.View entering={FadeIn} className="gap-2">
                {draft.finalizeError && (
                  <InlineNotice tone="danger">
                    {draft.finalizeError instanceof Error
                      ? draft.finalizeError.message
                      : "Failed to finalize report."}
                  </InlineNotice>
                )}
                <Button
                  testID="btn-finalize-report"
                  variant="hero"
                  size="xl"
                  className="mt-4 w-full"
                  onPress={() => draft.setIsFinalizeConfirmVisible(true)}
                  disabled={draft.isFinalizing || !generation.report}
                >
                  {draft.isFinalizing ? "Finalizing..." : "Finalize Report"}
                </Button>
                <Button
                  variant="secondary"
                  size="default"
                  className="w-full"
                  onPress={handleRegenerate}
                  disabled={draft.isFinalizing || generation.isUpdating}
                >
                  <View className="flex-row items-center gap-1.5">
                    <RotateCcw size={14} color={colors.foreground} />
                    <Text className="text-base font-semibold text-foreground">
                      Regenerate
                    </Text>
                  </View>
                </Button>
              </Animated.View>
            </View>
          )}
        </ScrollView>
      </View>
    );
  },
);
