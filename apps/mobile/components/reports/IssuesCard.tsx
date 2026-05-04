import { View, Text, Pressable } from "react-native";
import { AlertTriangle, Trash2, Plus } from "lucide-react-native";
import { Card } from "@/components/ui/Card";
import { SectionHeader } from "@/components/ui/SectionHeader";
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

export function IssuesCard({ issues, editable = false, onChange }: IssuesCardProps) {
  if (issues.length === 0 && !editable) return null;

  const list = issues as GeneratedReportIssue[];

  const handleAddIssue = () => {
    onChange?.([...list, blankIssue()]);
  };

  const handleRemoveIssue = (index: number) => {
    onChange?.(list.filter((_, i) => i !== index));
  };

  return (
    <Card variant="default" padding="lg">
      <SectionHeader
        title="Issues"
        icon={<AlertTriangle size={16} color={colors.warning.text} />}
        trailing={
          issues.length > 0 ? (
            <View className="rounded-md border border-warning-border bg-warning-soft px-3 py-1.5">
              <Text className="text-sm font-semibold text-warning-text">
                {issues.length}
              </Text>
            </View>
          ) : undefined
        }
      />
      <View className="mt-4 gap-4">
        {list.map((issue, index) => {
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
                    {editable && (
                      <Pressable
                        testID={`issues-${index}-trash`}
                        onPress={() => handleRemoveIssue(index)}
                        accessibilityRole="button"
                        accessibilityLabel="Remove issue"
                        hitSlop={8}
                      >
                        <Trash2 size={16} color={colors.muted.foreground} />
                      </Pressable>
                    )}
                  </View>

                  <Text className="mt-2 text-sm text-muted-foreground">
                    {[issue.category, issue.status]
                      .filter(Boolean)
                      .map(toTitleCase)
                      .join(" · ")}
                  </Text>

                  <Text
                    className="mt-3 text-base leading-relaxed text-muted-foreground"
                    testID={editable ? `issues-${index}-description` : undefined}
                  >
                    {issue.details}
                  </Text>

                  {issue.actionRequired ? (
                    <View className="mt-4 rounded-md border border-warning-border bg-warning-soft p-3">
                      <Text
                        className="text-base font-medium text-warning-text"
                        testID={editable ? `issues-${index}-notes` : undefined}
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

        {editable && (
          <Pressable
            testID="issues-add"
            onPress={handleAddIssue}
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
