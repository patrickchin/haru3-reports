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
      <Card>
        <View className="mb-2 flex-row items-center gap-2">
          <View className="h-8 w-8 items-center justify-center border border-amber-500">
            <AlertTriangle size={16} color="#f59e0b" />
          </View>
          <Text className="text-sm font-semibold uppercase tracking-wider text-foreground">
            Not yet mentioned ({missingFields.length})
          </Text>
        </View>
        <Text className="mb-2 text-xs text-muted-foreground">
          Add a note about these to complete your report:
        </Text>
        <View className="flex-row flex-wrap gap-2">
          {missingFields.map((field) => (
            <View
              key={field.label}
              className="flex-row items-center gap-1.5 border border-amber-600 bg-amber-50 px-3 py-1.5"
            >
              <field.icon size={12} color="#d97706" />
              <Text className="text-xs font-semibold uppercase tracking-wider text-amber-700">
                {field.label}
              </Text>
            </View>
          ))}
        </View>
      </Card>
    </Animated.View>
  );
}
