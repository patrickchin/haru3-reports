import { Text, View } from "react-native";
import { RotateCcw, Sparkles } from "lucide-react-native";
import { Button } from "@/components/ui/Button";
import { useGenerateReport } from "@/components/reports/generate/GenerateReportProvider";
import { colors } from "@/lib/design-tokens/colors";

/**
 * Persistent action row above the tab bar. Two states:
 *
 *  1. Out of date (no report yet, or new notes since last generation):
 *     a single full-width secondary "Update (N)" / "Generate" button.
 *  2. Up to date: small icon-only "Regenerate" on the left, primary
 *     "Finalize" button filling the rest.
 */
export function GenerateReportActionRow() {
  const { generation, draft, timeline, handleRegenerate } = useGenerateReport();

  const hasReport = generation.report !== null;
  const hasNotes = timeline.items.length > 0;
  const upToDate = hasReport && generation.notesSinceLastGeneration === 0;
  const busy = generation.isUpdating || draft.isFinalizing;

  // State 1: needs (re)generation — single full-width Update/Generate.
  if (!upToDate) {
    const label = generation.isUpdating
      ? "Generating…"
      : !hasReport
        ? "Generate report"
        : `Update report (${generation.notesSinceLastGeneration})`;

    return (
      <View className="mx-5 mt-3">
        <Button
          testID="btn-generate-update-report"
          variant="secondary"
          size="default"
          className="w-full"
          onPress={handleRegenerate}
          disabled={busy || (!hasReport && !hasNotes)}
        >
          <View className="flex-row items-center gap-1.5">
            <Sparkles size={16} color={colors.foreground} />
            <Text
              className="text-base font-semibold text-foreground"
              numberOfLines={1}
            >
              {label}
            </Text>
          </View>
        </Button>
      </View>
    );
  }

  // State 2: up to date — small Regenerate + primary Finalize.
  return (
    <View className="mx-5 mt-3 flex-row gap-2">
      <Button
        testID="btn-generate-update-report"
        variant="secondary"
        size="default"
        accessibilityLabel="Regenerate report"
        onPress={handleRegenerate}
        disabled={busy}
      >
        <RotateCcw size={18} color={colors.foreground} />
      </Button>
      <View className="flex-1">
        <Button
          testID="btn-finalize-report"
          variant="hero"
          size="default"
          className="w-full"
          onPress={() => draft.setIsFinalizeConfirmVisible(true)}
          disabled={busy}
        >
          <Text
            className="text-base font-semibold text-primary-foreground"
            numberOfLines={1}
          >
            {draft.isFinalizing ? "Finalizing…" : "Finalize report"}
          </Text>
        </Button>
      </View>
    </View>
  );
}
