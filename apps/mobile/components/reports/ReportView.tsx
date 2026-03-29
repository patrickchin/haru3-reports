import { View, Text } from "react-native";
import type { GeneratedSiteReport } from "@/lib/generated-report";
import { StatBar } from "./StatBar";
import { WeatherStrip } from "./WeatherStrip";
import { ManpowerCard } from "./ManpowerCard";
import { SiteConditionsCard } from "./SiteConditionsCard";
import { ActivityCard } from "./ActivityCard";
import { IssuesCard } from "./IssuesCard";
import { NextStepsCard } from "./NextStepsCard";
import { SummarySectionCard } from "./SummarySectionCard";

interface ReportViewProps {
  report: GeneratedSiteReport;
  editable?: boolean;
  editingIndex?: number | null;
  editingContent?: string;
  onEditStart?: (index: number) => void;
  onEditChange?: (content: string) => void;
  onEditSave?: () => void;
}

export function ReportView({
  report,
  editable = false,
  editingIndex = null,
  editingContent = "",
  onEditStart,
  onEditChange,
  onEditSave,
}: ReportViewProps) {
  const { sections } = report.report;

  return (
    <View className="gap-3">
      {/* Key metrics at a glance */}
      <StatBar report={report} />

      {/* Weather context — compact strip */}
      <WeatherStrip report={report} />

      {/* Summary */}
      {report.report.meta.summary ? (
        <Text className="text-base leading-relaxed text-muted-foreground">
          {report.report.meta.summary}
        </Text>
      ) : null}

      {/* Issues first — highest priority for action */}
      <IssuesCard issues={report.report.issues} />

      {/* Work activities */}
      {report.report.activities.length > 0 && (
        <View className="gap-3">
          <Text className="mt-1 text-xs font-semibold uppercase tracking-[1.2px] text-muted-foreground">
            Work Progress
          </Text>
          {report.report.activities.map((activity, index) => (
            <ActivityCard
              key={`${activity.name}-${index}`}
              activity={activity}
              index={index}
            />
          ))}
        </View>
      )}

      {/* Manpower breakdown */}
      <ManpowerCard manpower={report.report.manpower} />

      {/* Site conditions */}
      <SiteConditionsCard conditions={report.report.siteConditions} />

      {/* Next steps — numbered action items */}
      <NextStepsCard steps={report.report.nextSteps} />

      {/* Summary sections (editable in generate mode) */}
      {sections.length > 0 && (
        <View className="gap-3">
          <Text className="mt-1 text-xs font-semibold uppercase tracking-[1.2px] text-muted-foreground">
            Summary Sections
          </Text>
          {sections.map((section, i) => (
            <SummarySectionCard
              key={`${section.title}-${i}`}
              section={section}
              index={i}
              editable={editable}
              isEditing={editingIndex === i}
              editingContent={editingContent}
              onEditStart={onEditStart}
              onEditChange={onEditChange}
              onEditSave={onEditSave}
            />
          ))}
        </View>
      )}
    </View>
  );
}
