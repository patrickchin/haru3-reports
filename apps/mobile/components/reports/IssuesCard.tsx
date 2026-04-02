import { View, Text } from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";
import { AlertTriangle } from "lucide-react-native";
import { Card } from "@/components/ui/Card";
import { toTitleCase, formatSourceNotes } from "@/lib/report-helpers";
import type { GeneratedReportIssue } from "@/lib/generated-report";

const SEVERITY_STYLES: Record<
  string,
  { border: string; bg: string; text: string }
> = {
  high: { border: "#dc2626", bg: "bg-red-50", text: "text-red-700" },
  medium: { border: "#d97706", bg: "bg-amber-50", text: "text-amber-700" },
  low: { border: "#6b7280", bg: "bg-gray-50", text: "text-gray-600" },
};

function getSeverityStyle(severity: string) {
  return SEVERITY_STYLES[severity.toLowerCase()] ?? SEVERITY_STYLES.low;
}

interface IssuesCardProps {
  issues: readonly GeneratedReportIssue[];
}

export function IssuesCard({ issues }: IssuesCardProps) {
  if (issues.length === 0) return null;

  return (
    <Animated.View entering={FadeInDown.duration(150)}>
      <Card>
        <View className="mb-3 flex-row items-center justify-between">
          <View className="flex-row items-center gap-2">
            <View className="h-8 w-8 items-center justify-center border border-border">
              <AlertTriangle size={16} color="#d97706" />
            </View>
            <Text className="text-base font-semibold uppercase tracking-wider text-foreground">
              Issues
            </Text>
          </View>
          <View className="border border-amber-700 bg-amber-50 px-2 py-0.5">
            <Text className="text-sm font-semibold text-amber-700">
              {issues.length}
            </Text>
          </View>
        </View>
        <View className="gap-3">
          {issues.map((issue, index) => {
            const style = getSeverityStyle(issue.severity);
            return (
              <View
                key={`${issue.title}-${index}`}
                className="overflow-hidden"
                style={{ borderLeftWidth: 3, borderLeftColor: style.border }}
              >
                <View className="px-3 py-3">
                  <View className="flex-row items-center gap-2">
                    <Text className="flex-1 text-base font-semibold text-foreground">
                      {issue.title}
                    </Text>
                    <View className={`${style.bg} border border-current px-2 py-0.5`}>
                      <Text className={`text-sm font-semibold uppercase tracking-wider ${style.text}`}>
                        {toTitleCase(issue.severity)}
                      </Text>
                    </View>
                  </View>
                  <Text className="mt-1 text-sm text-muted-foreground">
                    {[issue.category, issue.status]
                      .filter(Boolean)
                      .map(toTitleCase)
                      .join(" · ")}
                  </Text>
                  <Text className="mt-2 text-base leading-relaxed text-muted-foreground">
                    {issue.details}
                  </Text>
                  {issue.actionRequired ? (
                    <View className="mt-2 border-l-2 border-amber-600 bg-amber-50 p-2">
                      <Text className="text-base font-medium text-amber-800">
                        → {issue.actionRequired}
                      </Text>
                    </View>
                  ) : null}
                  {formatSourceNotes(issue.sourceNoteIndexes) ? (
                    <Text className="mt-2 text-sm text-muted-foreground">
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
