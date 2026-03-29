import { View, Text } from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";
import { Card } from "@/components/ui/Card";
import {
  toTitleCase,
  getActivitySummaryChips,
  getManpowerLines,
  getItemMeta,
  getIssueMeta,
  formatSourceNotes,
} from "@/lib/report-helpers";
import type { GeneratedReportActivity } from "@/lib/generated-report";

const STATUS_DOT: Record<string, string> = {
  completed: "bg-emerald-500",
  "in-progress": "bg-blue-500",
  in_progress: "bg-blue-500",
  blocked: "bg-red-500",
  delayed: "bg-amber-500",
};

function getStatusDotClass(status: string): string {
  return STATUS_DOT[status.toLowerCase()] ?? "bg-gray-400";
}

interface ActivityCardProps {
  activity: GeneratedReportActivity;
  index: number;
}

export function ActivityCard({ activity, index }: ActivityCardProps) {
  const chips = getActivitySummaryChips(activity);
  const crewLines = getManpowerLines(activity.manpower);
  const dotClass = getStatusDotClass(activity.status);

  return (
    <Animated.View entering={FadeInDown.duration(150).delay(index * 50)}>
      <Card>
        {/* Header with status dot */}
        <View className="mb-2 flex-row items-start gap-2.5">
          <View className={`mt-1.5 h-2.5 w-2.5 rounded-full ${dotClass}`} />
          <View className="flex-1">
            <Text className="text-base font-semibold text-foreground">
              {activity.name}
            </Text>
            {chips.length > 0 && (
              <View className="mt-1.5 flex-row flex-wrap gap-1.5">
                {chips.map((chip) => (
                  <View
                    key={`${activity.name}-${chip}`}
                    className="rounded-full bg-secondary px-2 py-0.5"
                  >
                    <Text className="text-xs font-medium text-secondary-foreground">
                      {chip}
                    </Text>
                  </View>
                ))}
              </View>
            )}
          </View>
        </View>

        <Text className="text-sm leading-relaxed text-muted-foreground">
          {activity.summary}
        </Text>

        {crewLines.length > 0 && (
          <View className="mt-3 gap-1">
            <Text className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Crew
            </Text>
            {crewLines.map((line, i) => (
              <Text
                key={`crew-${i}`}
                className="text-sm text-muted-foreground"
              >
                {line}
              </Text>
            ))}
          </View>
        )}

        {activity.materials.length > 0 && (
          <View className="mt-3 gap-1.5">
            <Text className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Materials
            </Text>
            {activity.materials.map((item, i) => {
              const meta = getItemMeta([
                item.quantity,
                item.status ? toTitleCase(item.status) : null,
                item.notes,
              ]);
              return (
                <View
                  key={`mat-${item.name}-${i}`}
                  className="rounded-md bg-secondary/60 px-2.5 py-2"
                >
                  <Text className="text-sm font-medium text-foreground">
                    {item.name}
                  </Text>
                  {meta ? (
                    <Text className="mt-0.5 text-xs text-muted-foreground">
                      {meta}
                    </Text>
                  ) : null}
                </View>
              );
            })}
          </View>
        )}

        {activity.equipment.length > 0 && (
          <View className="mt-3 gap-1.5">
            <Text className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Equipment
            </Text>
            {activity.equipment.map((item, i) => {
              const meta = getItemMeta([
                item.quantity,
                item.status ? toTitleCase(item.status) : null,
                item.hoursUsed ? `Hours: ${item.hoursUsed}` : null,
                item.notes,
              ]);
              return (
                <View
                  key={`eq-${item.name}-${i}`}
                  className="rounded-md bg-secondary/60 px-2.5 py-2"
                >
                  <Text className="text-sm font-medium text-foreground">
                    {item.name}
                  </Text>
                  {meta ? (
                    <Text className="mt-0.5 text-xs text-muted-foreground">
                      {meta}
                    </Text>
                  ) : null}
                </View>
              );
            })}
          </View>
        )}

        {activity.observations.length > 0 && (
          <View className="mt-3 gap-1">
            <Text className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Observations
            </Text>
            {activity.observations.map((obs, i) => (
              <Text
                key={`obs-${i}`}
                className="text-sm leading-relaxed text-muted-foreground"
              >
                {obs}
              </Text>
            ))}
          </View>
        )}

        {activity.issues.length > 0 && (
          <View className="mt-3 gap-2">
            <Text className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Issues
            </Text>
            {activity.issues.map((issue, i) => (
              <View
                key={`issue-${issue.title}-${i}`}
                className="rounded-md bg-amber-50 px-2.5 py-2"
                style={{ borderLeftWidth: 2, borderLeftColor: "#f59e0b" }}
              >
                <Text className="text-sm font-medium text-foreground">
                  {issue.title}
                </Text>
                <Text className="mt-0.5 text-xs text-muted-foreground">
                  {getIssueMeta(issue)}
                </Text>
                <Text className="mt-1 text-sm text-muted-foreground">
                  {issue.details}
                </Text>
                {issue.actionRequired ? (
                  <Text className="mt-1 text-sm font-medium text-amber-800">
                    → {issue.actionRequired}
                  </Text>
                ) : null}
              </View>
            ))}
          </View>
        )}

        {formatSourceNotes(activity.sourceNoteIndexes) ? (
          <Text className="mt-3 text-xs text-muted-foreground">
            {formatSourceNotes(activity.sourceNoteIndexes)}
          </Text>
        ) : null}
      </Card>
    </Animated.View>
  );
}
