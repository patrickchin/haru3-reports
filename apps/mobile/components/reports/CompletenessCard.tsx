import { View, Text } from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";
import {
  AlertTriangle,
  Cloud,
  Users,
  TrendingUp,
  HardHat,
  ClipboardList,
} from "lucide-react-native";
import { Card } from "@/components/ui/Card";
import { SectionHeader } from "@/components/ui/SectionHeader";
import type { GeneratedSiteReport } from "@/lib/generated-report";

type MissingField = {
  label: string;
  icon: React.ComponentType<{ size: number; color: string }>;
};

function getMissingFields(report: GeneratedSiteReport): MissingField[] {
  const missing: MissingField[] = [];

  if (!report.report.meta.visitDate) {
    missing.push({ label: "Visit date", icon: ClipboardList });
  }
  if (!report.report.weather) {
    missing.push({ label: "Weather conditions", icon: Cloud });
  }
  if (!report.report.manpower) {
    missing.push({ label: "Manpower / crew info", icon: Users });
  }
  if (report.report.activities.length === 0) {
    missing.push({ label: "Activities", icon: TrendingUp });
  }
  if (report.report.siteConditions.length === 0) {
    missing.push({ label: "Site conditions", icon: HardHat });
  }
  if (report.report.issues.length === 0) {
    missing.push({ label: "Issues / risks", icon: AlertTriangle });
  }
  if (report.report.nextSteps.length === 0) {
    missing.push({ label: "Next steps", icon: ClipboardList });
  }

  return missing;
}

interface CompletenessCardProps {
  report: GeneratedSiteReport;
}

export function CompletenessCard({ report }: CompletenessCardProps) {
  const missingFields = getMissingFields(report);

  if (missingFields.length === 0) {
    return null;
  }

  return (
    <Animated.View entering={FadeInDown.duration(150)}>
      <Card variant="emphasis">
        <SectionHeader
          title={`Still missing (${missingFields.length})`}
          subtitle="Add a note about the topics below to complete the report."
          icon={<AlertTriangle size={16} color="#b66916" />}
        />
        <View className="mt-3 flex-row flex-wrap gap-2">
          {missingFields.map((field) => (
            <View
              key={field.label}
              className="flex-row items-center gap-1.5 rounded-md border border-warning-border bg-warning-soft px-3 py-2"
            >
              <field.icon size={12} color="#8e510e" />
              <Text className="text-sm font-semibold uppercase tracking-wider text-warning-text">
                {field.label}
              </Text>
            </View>
          ))}
        </View>
      </Card>
    </Animated.View>
  );
}
