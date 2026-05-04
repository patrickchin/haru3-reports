import { useEffect, useState } from "react";
import { View, Text, TextInput, Pressable } from "react-native";
import { AlertTriangle, Trash2, Plus } from "lucide-react-native";
import { Card } from "@/components/ui/Card";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { CardEditButtons } from "@/components/reports/CardEditButtons";
import { toTitleCase, formatSourceNotes } from "@/lib/report-helpers";
import { getIssueSeverityTone } from "@/lib/mobile-ui";
import { colors } from "@/lib/design-tokens/colors";
import { blankIssue } from "@/lib/report-edit-helpers";
import type { GeneratedReportIssue } from "@/lib/generated-report";

const SEVERITY_STYLES: Record<
  string,
  { stripe: string; bg: string; text: string }
> = {
  danger: {
    stripe: "bg-danger-border",
    bg: "bg-danger-soft",
    text: "text-danger-text",
  },
  warning: {
    stripe: "bg-warning-border",
    bg: "bg-warning-soft",
    text: "text-warning-text",
  },
  neutral: {
    stripe: "bg-border",
    bg: "bg-secondary",
    text: "text-muted-foreground",
  },
};

function getSeverityStyle(severity: string) {
  return SEVERITY_STYLES[getIssueSeverityTone(severity)];
}

interface IssuesCardProps {
  issues: readonly GeneratedReportIssue[];
  editable?: boolean;
  /** Whole-array setter — parent feeds it through `setIssues(report, next)`. */
  onChange?: (next: GeneratedReportIssue[]) => void;
}

function toDraft(issues: readonly GeneratedReportIssue[]): GeneratedReportIssue[] {
  return issues.map((i) => ({ ...i, sourceNoteIndexes: [...i.sourceNoteIndexes] }));
}

function trimOrNull(v: string): string | null {
  return v.trim() === "" ? null : v;
}

export function IssuesCard({ issues, editable = false, onChange }: IssuesCardProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState<GeneratedReportIssue[]>(() => toDraft(issues));

  useEffect(() => {
    if (!isEditing) setDraft(toDraft(issues));
  }, [issues, isEditing]);

  if (issues.length === 0 && !editable) return null;

  const handleEdit = () => {
    setDraft(toDraft(issues));
    setIsEditing(true);
  };

  const handleCancel = () => {
    setDraft(toDraft(issues));
    setIsEditing(false);
  };

  const handleSave = () => {
    onChange?.(draft.map((i) => ({ ...i, sourceNoteIndexes: [...i.sourceNoteIndexes] })));
    setIsEditing(false);
  };

  const updateIssue = (index: number, patch: Partial<GeneratedReportIssue>) => {
    setDraft((d) => d.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  };

  const addIssue = () => {
    setDraft((d) => [...d, blankIssue()]);
  };

  const removeIssue = (index: number) => {
    setDraft((d) => d.filter((_, i) => i !== index));
  };

  const trailing = editable ? (
    <CardEditButtons
      testID="issues"
      isEditing={isEditing}
      onEdit={handleEdit}
      onSave={handleSave}
      onCancel={handleCancel}
    />
  ) : (
    issues.length > 0 ? (
      <View className="rounded-md border border-warning-border bg-warning-soft px-3 py-1.5">
        <Text className="text-sm font-semibold text-warning-text">
          {issues.length}
        </Text>
      </View>
    ) : undefined
  );

  return (
    <Card variant="default" padding="lg">
      <SectionHeader
        title="Issues"
        icon={<AlertTriangle size={16} color={colors.warning.text} />}
        trailing={trailing}
      />
      <View className="mt-4 gap-4">
        {isEditing
          ? draft.map((issue, index) => (
              <View
                key={`issue-edit-${index}`}
                className={
                  index > 0
                    ? "gap-2 border-t border-border pt-4"
                    : "gap-2"
                }
              >
                <View className="flex-row items-center gap-2">
                  <TextInput
                    testID={`issues-${index}-title-input`}
                    value={issue.title}
                    onChangeText={(next) => updateIssue(index, { title: next })}
                    placeholder="Title"
                    placeholderTextColor={colors.muted.foreground}
                    className="flex-1 rounded-md border border-border bg-card px-2 py-1 text-base font-semibold text-foreground"
                  />
                  <Pressable
                    testID={`issues-${index}-trash`}
                    onPress={() => removeIssue(index)}
                    accessibilityRole="button"
                    accessibilityLabel="Remove issue"
                    hitSlop={8}
                  >
                    <Trash2 size={16} color={colors.muted.foreground} />
                  </Pressable>
                </View>
                <View className="flex-row items-center gap-2">
                  <Text className="text-sm text-muted-foreground">Category:</Text>
                  <TextInput
                    testID={`issues-${index}-category-input`}
                    value={issue.category}
                    onChangeText={(next) => updateIssue(index, { category: next })}
                    placeholder="Category"
                    placeholderTextColor={colors.muted.foreground}
                    className="flex-1 rounded-md border border-border bg-card px-2 py-1 text-sm text-foreground"
                  />
                </View>
                <View className="flex-row items-center gap-2">
                  <Text className="text-sm text-muted-foreground">Severity:</Text>
                  <TextInput
                    testID={`issues-${index}-severity-input`}
                    value={issue.severity}
                    onChangeText={(next) => updateIssue(index, { severity: next })}
                    placeholder="Severity"
                    placeholderTextColor={colors.muted.foreground}
                    className="flex-1 rounded-md border border-border bg-card px-2 py-1 text-sm text-foreground"
                  />
                </View>
                <View className="flex-row items-center gap-2">
                  <Text className="text-sm text-muted-foreground">Status:</Text>
                  <TextInput
                    testID={`issues-${index}-status-input`}
                    value={issue.status}
                    onChangeText={(next) => updateIssue(index, { status: next })}
                    placeholder="Status"
                    placeholderTextColor={colors.muted.foreground}
                    className="flex-1 rounded-md border border-border bg-card px-2 py-1 text-sm text-foreground"
                  />
                </View>
                <TextInput
                  testID={`issues-${index}-details-input`}
                  value={issue.details}
                  onChangeText={(next) => updateIssue(index, { details: next })}
                  multiline
                  placeholder="Details"
                  placeholderTextColor={colors.muted.foreground}
                  className="rounded-md border border-border bg-card px-2 py-1 text-base text-muted-foreground"
                />
                <TextInput
                  testID={`issues-${index}-actionRequired-input`}
                  value={issue.actionRequired ?? ""}
                  onChangeText={(next) =>
                    updateIssue(index, { actionRequired: trimOrNull(next) })
                  }
                  multiline
                  placeholder="Action required"
                  placeholderTextColor={colors.muted.foreground}
                  className="rounded-md border border-border bg-card px-2 py-1 text-base text-muted-foreground"
                />
              </View>
            ))
          : (issues as GeneratedReportIssue[]).map((issue, index) => {
              const style = getSeverityStyle(issue.severity);
              return (
                <View
                  key={`issue-${index}`}
                  className={index > 0 ? "border-t border-border pt-4" : ""}
                >
                  <View className="flex-row gap-3">
                    <View
                      className={`${style.stripe} self-stretch rounded-full`}
                      style={{ width: 4 }}
                    />
                    <View className="min-w-0 flex-1">
                      <View className="flex-row items-start gap-3">
                        <View className="flex-1">
                          <Text
                            className="text-base font-semibold text-foreground"
                            testID={editable ? `issues-${index}-title` : undefined}
                          >
                            {issue.title}
                          </Text>
                        </View>
                        <View
                          className={`${style.bg} shrink-0 rounded-md border border-current px-2.5 py-1.5`}
                        >
                          <Text
                            className={`text-sm font-semibold uppercase tracking-wider ${style.text}`}
                            testID={editable ? `issues-${index}-severity` : undefined}
                          >
                            {toTitleCase(issue.severity)}
                          </Text>
                        </View>
                      </View>

                      <Text
                        className="mt-2 text-sm text-muted-foreground"
                        testID={editable ? `issues-${index}-category` : undefined}
                      >
                        {[issue.category, issue.status]
                          .filter(Boolean)
                          .map(toTitleCase)
                          .join(" · ")}
                      </Text>

                      <Text
                        className="mt-3 text-base leading-relaxed text-muted-foreground"
                        testID={editable ? `issues-${index}-details` : undefined}
                      >
                        {issue.details}
                      </Text>

                      {issue.actionRequired ? (
                        <View className="mt-4 rounded-md border border-warning-border bg-warning-soft p-3">
                          <Text
                            className="text-base font-medium text-warning-text"
                            testID={editable ? `issues-${index}-actionRequired` : undefined}
                          >
                            → {issue.actionRequired}
                          </Text>
                        </View>
                      ) : null}

                      {!editable && formatSourceNotes(issue.sourceNoteIndexes) ? (
                        <Text className="mt-3 text-sm text-muted-foreground">
                          {formatSourceNotes(issue.sourceNoteIndexes)}
                        </Text>
                      ) : null}
                    </View>
                  </View>
                </View>
              );
            })}

        {isEditing && (
          <Pressable
            testID="issues-add"
            onPress={addIssue}
            accessibilityRole="button"
            accessibilityLabel="Add issue"
            className="flex-row items-center gap-2 self-start rounded-md border border-border px-3 py-2"
          >
            <Plus size={14} color={colors.foreground} />
            <Text className="text-sm text-foreground">Add issue</Text>
          </Pressable>
        )}
      </View>
    </Card>
  );
}
