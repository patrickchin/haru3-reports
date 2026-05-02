import { View, Text } from "react-native";
import type { GeneratedSiteReport } from "@/lib/generated-report";
import { StatBar } from "./StatBar";
import { WeatherStrip } from "./WeatherStrip";
import { WorkersCard } from "./WorkersCard";
import { MaterialsCard } from "./MaterialsCard";
import { IssuesCard } from "./IssuesCard";
import { NextStepsCard } from "./NextStepsCard";
import { SummarySectionCard } from "./SummarySectionCard";
import { MetaEditCard } from "./MetaEditCard";
import { FileText } from "lucide-react-native";
import { Card } from "@/components/ui/Card";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { colors } from "@/lib/design-tokens/colors";
import {
  updateMeta,
  updateWeather,
  updateWorkers,
  setMaterials,
  setIssues,
  setNextSteps,
  setSections,
} from "@/lib/report-edit-helpers";

interface ReportViewProps {
  report: GeneratedSiteReport;
  /** When true, every card receives an `editable` prop and edit affordances. */
  editable?: boolean;
  /**
   * Called with a NEW `GeneratedSiteReport` wrapper whenever any card commits
   * a change. The parent (screen) is responsible for storing this — typically
   * by calling its draft setter directly: `onReportChange={setReport}`.
   *
   * Composing slice patches into a full report is handled inside ReportView
   * via the `report-edit-helpers` kit, so screens don't have to know which
   * helper goes with which card.
   */
  onReportChange?: (next: GeneratedSiteReport) => void;
}

export function ReportView({
  report,
  editable = false,
  onReportChange,
}: ReportViewProps) {
  const { sections } = report.report;
  const isEditable = editable && !!onReportChange;

  return (
    <View className="gap-3">
      {/* Key metrics at a glance */}
      <StatBar report={report} />

      {/* Meta edit form — only when editable */}
      {isEditable ? (
        <MetaEditCard
          meta={report.report.meta}
          editable
          onChange={(patch) => onReportChange?.(updateMeta(report, patch))}
        />
      ) : null}

      {/* Weather context — compact strip */}
      <WeatherStrip
        report={report}
        editable={isEditable}
        onChange={
          isEditable
            ? (patch) => onReportChange?.(updateWeather(report, patch))
            : undefined
        }
      />

      {/* Summary (read-only — editable summary lives in MetaEditCard above) */}
      {!isEditable && report.report.meta.summary ? (
        <Card variant="default" padding="lg">
          <SectionHeader
            title="Summary"
            icon={<FileText size={16} color={colors.foreground} />}
          />
          <Text className="mt-4 text-base leading-relaxed text-muted-foreground">
            {report.report.meta.summary}
          </Text>
        </Card>
      ) : null}

      {/* Issues first — highest priority for action */}
      <IssuesCard
        issues={report.report.issues}
        editable={isEditable}
        onChange={
          isEditable
            ? (next) => onReportChange?.(setIssues(report, next))
            : undefined
        }
      />

      {/* Workers breakdown */}
      <WorkersCard
        workers={report.report.workers}
        editable={isEditable}
        onChange={
          isEditable
            ? (patch) => onReportChange?.(updateWorkers(report, patch))
            : undefined
        }
      />

      {/* Materials */}
      <MaterialsCard
        materials={report.report.materials}
        editable={isEditable}
        onChange={
          isEditable
            ? (next) => onReportChange?.(setMaterials(report, next))
            : undefined
        }
      />

      {/* Next steps — numbered action items */}
      <NextStepsCard
        steps={report.report.nextSteps}
        editable={isEditable}
        onChange={
          isEditable
            ? (next) => onReportChange?.(setNextSteps(report, next))
            : undefined
        }
      />

      {/* Summary sections */}
      {(sections.length > 0 || isEditable) && (
        <View className="gap-3">
          <Text className="mt-1 text-sm font-semibold uppercase tracking-[1.2px] text-muted-foreground">
            Summary Sections
          </Text>
          {sections.map((section, i) => (
            <SummarySectionCard
              key={`${section.title}-${i}`}
              section={section}
              index={i}
              editable={isEditable}
              onChange={
                isEditable
                  ? (next) =>
                      onReportChange?.(
                        setSections(
                          report,
                          sections.map((s, j) => (j === i ? next : s)),
                        ),
                      )
                  : undefined
              }
              onRemove={
                isEditable
                  ? () =>
                      onReportChange?.(
                        setSections(
                          report,
                          sections.filter((_, j) => j !== i),
                        ),
                      )
                  : undefined
              }
            />
          ))}
        </View>
      )}
    </View>
  );
}
