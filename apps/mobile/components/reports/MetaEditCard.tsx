import { useEffect, useState } from "react";
import { View, Text, TextInput } from "react-native";
import { FileText } from "lucide-react-native";
import { Card } from "@/components/ui/Card";
import { CardEditButtons } from "@/components/reports/CardEditButtons";
import type { GeneratedReportMeta } from "@/lib/report-edit-helpers";
import { colors } from "@/lib/design-tokens/colors";

interface MetaEditCardProps {
  meta: GeneratedReportMeta;
  editable?: boolean;
  onChange?: (patch: Partial<GeneratedReportMeta>) => void;
}

interface MetaDraft {
  title: string;
  reportType: string;
  summary: string;
  visitDate: string;
}

function toDraft(m: GeneratedReportMeta): MetaDraft {
  return {
    title: m.title ?? "",
    reportType: m.reportType ?? "",
    summary: m.summary ?? "",
    visitDate: m.visitDate ?? "",
  };
}

/**
 * Editable card for the report's `meta` slice. Only renders when
 * `editable=true` — read-only mode is handled by the existing Summary block
 * inside `ReportView`. Exposes every field of `meta`: `title`, `summary`
 * (multiline), `reportType`, and `visitDate`.
 *
 * Per-card edit toggle pattern: read-only display by default with a pencil
 * affordance, switching to TextInputs + Save/Cancel on tap.
 */
export function MetaEditCard({
  meta,
  editable = false,
  onChange,
}: MetaEditCardProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState<MetaDraft>(() => toDraft(meta));

  useEffect(() => {
    if (!isEditing) setDraft(toDraft(meta));
  }, [meta, isEditing]);

  if (!editable) return null;

  const handleEdit = () => {
    setDraft(toDraft(meta));
    setIsEditing(true);
  };

  const handleCancel = () => {
    setDraft(toDraft(meta));
    setIsEditing(false);
  };

  const handleSave = () => {
    const reportTypeTrimmed = draft.reportType.trim();
    const patch: Partial<GeneratedReportMeta> = {
      title: draft.title,
      summary: draft.summary,
      reportType: reportTypeTrimmed === "" ? "site_visit" : draft.reportType,
      visitDate: draft.visitDate.trim() === "" ? null : draft.visitDate,
    };
    onChange?.(patch);
    setIsEditing(false);
  };

  return (
    <Card variant="default" padding="lg">
      <View className="flex-row items-center justify-between">
        <View className="flex-row items-center gap-2">
          <FileText size={16} color={colors.foreground} />
          <Text className="text-label text-foreground">Report details</Text>
        </View>
        <CardEditButtons
          testID="meta"
          isEditing={isEditing}
          onEdit={handleEdit}
          onSave={handleSave}
          onCancel={handleCancel}
        />
      </View>

      <View className="mt-4 gap-3">
        <View className="gap-1">
          <Text className="text-sm text-muted-foreground">Title</Text>
          {isEditing ? (
            <TextInput
              testID="meta-title-input"
              value={draft.title}
              onChangeText={(next) => setDraft((d) => ({ ...d, title: next }))}
              placeholder="Report title"
              placeholderTextColor={colors.muted.foreground}
              className="rounded-md border border-border bg-card px-2 py-1 text-base font-semibold text-foreground"
            />
          ) : (
            <Text
              className="text-base font-semibold text-foreground"
              testID="meta-title"
            >
              {meta.title || "—"}
            </Text>
          )}
        </View>

        <View className="gap-1">
          <Text className="text-sm text-muted-foreground">Summary</Text>
          {isEditing ? (
            <TextInput
              testID="meta-summary-input"
              value={draft.summary}
              onChangeText={(next) =>
                setDraft((d) => ({ ...d, summary: next }))
              }
              multiline
              placeholder="Report summary"
              placeholderTextColor={colors.muted.foreground}
              className="rounded-md border border-border bg-card px-2 py-1 text-base leading-relaxed text-foreground"
            />
          ) : (
            <Text
              className="text-base leading-relaxed text-foreground"
              testID="meta-summary"
            >
              {meta.summary || "—"}
            </Text>
          )}
        </View>

        <View className="gap-1">
          <Text className="text-sm text-muted-foreground">Report type</Text>
          {isEditing ? (
            <TextInput
              testID="meta-report-type-input"
              value={draft.reportType}
              onChangeText={(next) =>
                setDraft((d) => ({ ...d, reportType: next }))
              }
              placeholder="site_visit"
              placeholderTextColor={colors.muted.foreground}
              className="rounded-md border border-border bg-card px-2 py-1 text-base text-foreground"
            />
          ) : (
            <Text
              className="text-base text-foreground"
              testID="meta-report-type"
            >
              {meta.reportType || "site_visit"}
            </Text>
          )}
        </View>

        <View className="gap-1">
          <Text className="text-sm text-muted-foreground">Visit date</Text>
          {isEditing ? (
            <TextInput
              testID="meta-visit-date-input"
              value={draft.visitDate}
              onChangeText={(next) =>
                setDraft((d) => ({ ...d, visitDate: next }))
              }
              placeholder="YYYY-MM-DD"
              placeholderTextColor={colors.muted.foreground}
              className="rounded-md border border-border bg-card px-2 py-1 text-base text-foreground"
            />
          ) : (
            <Text className="text-base text-foreground" testID="meta-visit-date">
              {meta.visitDate ?? "—"}
            </Text>
          )}
        </View>
      </View>
    </Card>
  );
}
