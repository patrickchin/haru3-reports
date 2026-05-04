import { View, Text } from "react-native";
import { FileText } from "lucide-react-native";
import { Card } from "@/components/ui/Card";
import { SectionHeader } from "@/components/ui/SectionHeader";
import type { GeneratedReportMeta } from "@/lib/report-edit-helpers";
import { colors } from "@/lib/design-tokens/colors";

interface MetaEditCardProps {
  meta: GeneratedReportMeta;
  editable?: boolean;
  onChange?: (patch: Partial<GeneratedReportMeta>) => void;
}

/**
 * Editable form for the report's `meta` slice. Only renders when
 * `editable=true` — read-only mode is handled by the existing Summary block
 * inside `ReportView`. Exposes every field of `meta`: `title`, `summary`
 * (multiline), `reportType`, and `visitDate`.
 *
 * NOTE: Temporarily read-only pending Commit 2 of
 * manual-report-edit-card-toggle (re-introduces editing under the new
 * card-level toggle pattern).
 */
export function MetaEditCard({ meta, editable = false }: MetaEditCardProps) {
  if (!editable) return null;

  return (
    <Card variant="default" padding="lg">
      <SectionHeader
        title="Report details"
        icon={<FileText size={16} color={colors.foreground} />}
      />

      <View className="mt-4 gap-3">
        <View className="gap-1">
          <Text className="text-sm text-muted-foreground">Title</Text>
          <Text className="text-base font-semibold text-foreground" testID="meta-title">
            {meta.title || "—"}
          </Text>
        </View>

        <View className="gap-1">
          <Text className="text-sm text-muted-foreground">Summary</Text>
          <Text className="text-base leading-relaxed text-foreground" testID="meta-summary">
            {meta.summary || "—"}
          </Text>
        </View>

        <View className="gap-1">
          <Text className="text-sm text-muted-foreground">Report type</Text>
          <Text className="text-base text-foreground" testID="meta-report-type">
            {meta.reportType || "site_visit"}
          </Text>
        </View>

        <View className="gap-1">
          <Text className="text-sm text-muted-foreground">Visit date</Text>
          <Text className="text-base text-foreground" testID="meta-visit-date">
            {meta.visitDate ?? "—"}
          </Text>
        </View>
      </View>
    </Card>
  );
}
