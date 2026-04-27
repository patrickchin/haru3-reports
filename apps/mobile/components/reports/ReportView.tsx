import { View, Text } from "react-native";
import type { GeneratedSiteReport } from "@/lib/generated-report";
import { StatBar } from "./StatBar";
import { WeatherStrip } from "./WeatherStrip";
import { WorkersCard } from "./WorkersCard";
import { MaterialsCard } from "./MaterialsCard";
import { IssuesCard } from "./IssuesCard";
import { NextStepsCard } from "./NextStepsCard";
import { SummarySectionCard } from "./SummarySectionCard";
import Animated, { FadeInDown } from "react-native-reanimated";
import { FileText } from "lucide-react-native";
import { Card } from "@/components/ui/Card";
import { SectionHeader } from "@/components/ui/SectionHeader";

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
        <Animated.View entering={FadeInDown.duration(200)}>
          <Card variant="default" padding="lg">
            <SectionHeader
              title="Summary"
              icon={<FileText size={16} color="#1a1a2e" />}
            />
            <Text className="mt-4 text-base leading-relaxed text-muted-foreground" selectable>
              {report.report.meta.summary}
            </Text>
          </Card>
        </Animated.View>
      ) : null}

      {/* Issues first — highest priority for action */}
      <IssuesCard issues={report.report.issues} />

      {/* Workers breakdown */}
      <WorkersCard workers={report.report.workers} />

      {/* Materials */}
      <MaterialsCard materials={report.report.materials} />

      {/* Next steps — numbered action items */}
      <NextStepsCard steps={report.report.nextSteps} />

      {/* Summary sections (editable in generate mode) */}
      {sections.length > 0 && (
        <View className="gap-3">
          <Text className="mt-1 text-sm font-semibold uppercase tracking-[1.2px] text-muted-foreground">
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
