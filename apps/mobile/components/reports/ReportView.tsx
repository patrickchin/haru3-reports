import { View, Text } from "react-native";
import type { GeneratedSiteReport } from "@/lib/generated-report";
import type { ReportImageView } from "@/hooks/useReportImages";
import { StatBar } from "./StatBar";
import { WeatherStrip } from "./WeatherStrip";
import { ManpowerCard } from "./ManpowerCard";
import { SiteConditionsCard } from "./SiteConditionsCard";
import { ActivityCard } from "./ActivityCard";
import { IssuesCard } from "./IssuesCard";
import { NextStepsCard } from "./NextStepsCard";
import { SummarySectionCard } from "./SummarySectionCard";
import Animated, { FadeInDown } from "react-native-reanimated";
import { FileText } from "lucide-react-native";
import { Card } from "@/components/ui/Card";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { ImageGalleryAppendix } from "./ImageGalleryAppendix";

interface ReportViewProps {
  report: GeneratedSiteReport;
  editable?: boolean;
  editingIndex?: number | null;
  editingContent?: string;
  onEditStart?: (index: number) => void;
  onEditChange?: (content: string) => void;
  onEditSave?: () => void;
  images?: ReportImageView[];
}

export function ReportView({
  report,
  editable = false,
  editingIndex = null,
  editingContent = "",
  onEditStart,
  onEditChange,
  onEditSave,
  images = [],
}: ReportViewProps) {
  const { sections } = report.report;

  // Partition images by linkedTo. "activity:{i}" → activityImages[i],
  // everything else (null, "issue:..." for MVP appendix) → appendix.
  const activityImages = new Map<number, ReportImageView[]>();
  const appendixImages: ReportImageView[] = [];
  for (const img of images) {
    const match = img.linkedTo
      ? /^activity:(\d+)$/.exec(img.linkedTo)
      : null;
    if (match) {
      const idx = Number(match[1]);
      const list = activityImages.get(idx) ?? [];
      list.push(img);
      activityImages.set(idx, list);
    } else {
      appendixImages.push(img);
    }
  }

  return (
    <View className="gap-3">
      {/* Key metrics at a glance */}
      <StatBar report={report} />

      {/* Weather context — compact strip */}
      <WeatherStrip report={report} />

      {/* Summary */}
      {report.report.meta.summary ? (
        <Animated.View entering={FadeInDown.duration(150)}>
          <Card variant="default" padding="lg">
            <SectionHeader
              title="Summary"
              icon={<FileText size={16} color="#1a1a2e" />}
            />
            <Text className="mt-4 text-base leading-relaxed text-muted-foreground">
              {report.report.meta.summary}
            </Text>
          </Card>
        </Animated.View>
      ) : null}

      {/* Issues first — highest priority for action */}
      <IssuesCard issues={report.report.issues} />

      {/* Work activities */}
      {report.report.activities.length > 0 && (
        <View className="gap-3">
          <Text className="mt-1 text-sm font-semibold uppercase tracking-[1.2px] text-muted-foreground">
            Work Progress
          </Text>
          {report.report.activities.map((activity, index) => (
            <ActivityCard
              key={`${activity.name}-${index}`}
              activity={activity}
              index={index}
              images={activityImages.get(index)}
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

      {/* Photo appendix — unlinked photos */}
      <ImageGalleryAppendix images={appendixImages} />
    </View>
  );
}
