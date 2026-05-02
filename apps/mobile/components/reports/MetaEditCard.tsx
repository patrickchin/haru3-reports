import { View, Text } from "react-native";
import { FileText } from "lucide-react-native";
import { Card } from "@/components/ui/Card";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { EditableField } from "@/components/reports/EditableField";
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
 */
export function MetaEditCard({ meta, editable = false, onChange }: MetaEditCardProps) {
  if (!editable) return null;

  const patch = (p: Partial<GeneratedReportMeta>) => onChange?.(p);
  const trimOrNull = (v: string) => (v.trim() === "" ? null : v);

  return (
    <Card variant="default" padding="lg">
      <SectionHeader
        title="Report details"
        icon={<FileText size={16} color={colors.foreground} />}
      />

      <View className="mt-4 gap-3">
        <View className="gap-1">
          <Text className="text-sm text-muted-foreground">Title</Text>
          <EditableField
            value={meta.title}
            onChange={(next) => patch({ title: next })}
            editable
            emptyDisplay="—"
            placeholder="Report title"
            textClassName="text-base font-semibold text-foreground"
            testID="meta-title"
          />
        </View>

        <View className="gap-1">
          <Text className="text-sm text-muted-foreground">Summary</Text>
          <EditableField
            value={meta.summary}
            onChange={(next) => patch({ summary: next })}
            editable
            multiline
            emptyDisplay="—"
            placeholder="Report summary"
            textClassName="text-base leading-relaxed text-foreground"
            testID="meta-summary"
          />
        </View>

        <View className="gap-1">
          <Text className="text-sm text-muted-foreground">Report type</Text>
          <EditableField
            value={meta.reportType}
            onChange={(next) => patch({ reportType: next.trim() === "" ? "site_visit" : next })}
            editable
            emptyDisplay="site_visit"
            placeholder="site_visit"
            textClassName="text-base text-foreground"
            testID="meta-report-type"
          />
        </View>

        <View className="gap-1">
          <Text className="text-sm text-muted-foreground">Visit date</Text>
          <EditableField
            value={meta.visitDate ?? ""}
            onChange={(next) => patch({ visitDate: trimOrNull(next) })}
            editable
            emptyDisplay="—"
            placeholder="YYYY-MM-DD"
            textClassName="text-base text-foreground"
            testID="meta-visit-date"
          />
        </View>
      </View>
    </Card>
  );
}
