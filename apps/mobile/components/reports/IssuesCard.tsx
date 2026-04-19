import { View, Text } from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";
import { AlertTriangle } from "lucide-react-native";
import { Card } from "@/components/ui/Card";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { toTitleCase, formatSourceNotes } from "@/lib/report-helpers";
import { getIssueSeverityTone } from "@/lib/mobile-ui";
import type { GeneratedReportIssue } from "@/lib/generated-report";

const SEVERITY_STYLES: Record<
  string,
  { border: string; bg: string; text: string }
> = {
  danger: {
    border: "#b3261e",
    bg: "bg-danger-soft",
    text: "text-danger-text",
  },
  warning: {
    border: "#b66916",
    bg: "bg-warning-soft",
    text: "text-warning-text",
  },
  neutral: {
    border: "#7b7782",
    bg: "bg-secondary",
    text: "text-muted-foreground",
  },
};

function getSeverityStyle(severity: string) {
  return SEVERITY_STYLES[getIssueSeverityTone(severity)];
}

interface IssuesCardProps {
  issues: readonly GeneratedReportIssue[];
}

export function IssuesCard({ issues }: IssuesCardProps) {
  if (issues.length === 0) return null;

  return (
    <Animated.View entering={FadeInDown.duration(150)}>
      <Card variant="default" padding="lg">
        <SectionHeader
          title="Issues"
          subtitle={issues.length === 1 ? "1 item needs follow-up." : `${issues.length} items need follow-up.`}
          icon={<AlertTriangle size={16} color="#b66916" />}
          trailing={
            <View className="rounded-md border border-warning-border bg-warning-soft px-3 py-1.5">
              <Text className="text-sm font-semibold text-warning-text">
                {issues.length}
              </Text>
            </View>
          }
        />
        <View className="mt-4 gap-4">
          {issues.map((issue, index) => {
            const style = getSeverityStyle(issue.severity);
            return (
              <View
                key={`${issue.title}-${index}`}
                className="flex-row gap-3 rounded-md border border-border bg-surface-muted p-4"
              >
                <View
                  className="self-stretch rounded-full"
                  style={{ width: 4, backgroundColor: style.border }}
                />
                <View className="min-w-0 flex-1">
                  <View className="flex-row items-start gap-3">
                    <Text className="flex-1 text-base font-semibold text-foreground">
                      {issue.title}
                    </Text>
                    <View className={`${style.bg} shrink-0 rounded-md border border-current px-2.5 py-1.5`}>
                      <Text className={`text-sm font-semibold uppercase tracking-wider ${style.text}`}>
                        {toTitleCase(issue.severity)}
                      </Text>
                    </View>
                  </View>
                  <Text className="mt-2 text-sm text-muted-foreground">
                    {[issue.category, issue.status]
                      .filter(Boolean)
                      .map(toTitleCase)
                      .join(" · ")}
                  </Text>
                  <Text className="mt-3 text-base leading-relaxed text-muted-foreground">
                    {issue.details}
                  </Text>
                  {issue.actionRequired ? (
                    <View className="mt-4 rounded-md border border-warning-border bg-warning-soft p-3">
                      <Text className="text-base font-medium text-warning-text">
                        → {issue.actionRequired}
                      </Text>
                    </View>
                  ) : null}
                  {formatSourceNotes(issue.sourceNoteIndexes) ? (
                    <Text className="mt-3 text-sm text-muted-foreground">
                      {formatSourceNotes(issue.sourceNoteIndexes)}
                    </Text>
                  ) : null}
                </View>
              </View>
            );
          })}
        </View>
      </Card>
    </Animated.View>
  );
}
