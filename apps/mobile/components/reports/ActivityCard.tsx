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

const STATUS_LABEL: Record<string, string> = {
  completed: "COMPLETED",
  "in-progress": "IN PROGRESS",
  in_progress: "IN PROGRESS",
  blocked: "BLOCKED",
  delayed: "DELAYED",
};

function getStatusLabel(status: string): string {
  return STATUS_LABEL[status.toLowerCase()] ?? status.toUpperCase();
}

interface ActivityCardProps {
  activity: GeneratedReportActivity;
  index: number;
}

export function ActivityCard({ activity, index }: ActivityCardProps) {
  const chips = getActivitySummaryChips(activity);
  const crewLines = getManpowerLines(activity.manpower);
  const statusLabel = getStatusLabel(activity.status);

  return (
    <Animated.View entering={FadeInDown.duration(150).delay(index * 50)}>
      <Card variant="default" padding="lg" className="gap-3">
        <View className="gap-2">
          <View className="self-start rounded-md border border-border bg-secondary px-2.5 py-1">
            <Text className="text-sm font-bold tracking-wider text-muted-foreground">
              [{statusLabel}]
            </Text>
          </View>
          <Text className="text-title-sm text-foreground">
            {activity.name}
          </Text>
          {chips.length > 0 && (
            <View className="flex-row flex-wrap gap-2">
              {chips.map((chip) => (
                <View
                  key={`${activity.name}-${chip}`}
                  className="max-w-full rounded-md border border-border bg-surface-muted px-3 py-1.5"
                >
                  <Text className="text-sm font-medium text-secondary-foreground">
                    {chip}
                  </Text>
                </View>
              ))}
            </View>
          )}
        </View>

        <Text className="text-base leading-relaxed text-muted-foreground">
          {activity.summary}
        </Text>

        {crewLines.length > 0 && (
          <View className="mt-3 gap-1">
            <Text className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Crew
            </Text>
            {crewLines.map((line, i) => (
              <Text
                key={`crew-${i}`}
                className="text-base text-muted-foreground"
              >
                {line}
              </Text>
            ))}
          </View>
        )}

        {activity.materials.length > 0 && (
          <View className="mt-3 gap-1.5">
            <Text className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
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
                  className="rounded-md bg-surface-muted px-3 py-3"
                >
                  <Text className="text-base font-medium text-foreground">
                    {item.name}
                  </Text>
                  {meta ? (
                    <Text className="mt-0.5 text-sm text-muted-foreground">
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
            <Text className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
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
                  className="rounded-md bg-surface-muted px-3 py-3"
                >
                  <Text className="text-base font-medium text-foreground">
                    {item.name}
                  </Text>
                  {meta ? (
                    <Text className="mt-0.5 text-sm text-muted-foreground">
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
            <Text className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Observations
            </Text>
            {activity.observations.map((obs, i) => (
              <Text
                key={`obs-${i}`}
                className="text-base leading-relaxed text-muted-foreground"
              >
                {obs}
              </Text>
            ))}
          </View>
        )}

        {activity.issues.length > 0 && (
          <View className="mt-3 gap-2">
            <Text className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Issues
            </Text>
            {activity.issues.map((issue, i) => (
              <View
                key={`issue-${issue.title}-${i}`}
                className="flex-row gap-3 rounded-md border border-warning-border bg-warning-soft px-3 py-3"
              >
                <View className="self-stretch rounded-full bg-warning-border" style={{ width: 3 }} />
                <View className="min-w-0 flex-1">
                  <Text className="text-base font-medium text-foreground">
                    {issue.title}
                  </Text>
                  <Text className="mt-0.5 text-sm text-muted-foreground">
                    {getIssueMeta(issue)}
                  </Text>
                  <Text className="mt-1 text-base text-muted-foreground">
                    {issue.details}
                  </Text>
                  {issue.actionRequired ? (
                    <Text className="mt-2 text-base font-medium text-warning-text">
                      → {issue.actionRequired}
                    </Text>
                  ) : null}
                </View>
              </View>
            ))}
          </View>
        )}

        {formatSourceNotes(activity.sourceNoteIndexes) ? (
          <Text className="mt-3 text-sm text-muted-foreground">
            {formatSourceNotes(activity.sourceNoteIndexes)}
          </Text>
        ) : null}
      </Card>
    </Animated.View>
  );
}
