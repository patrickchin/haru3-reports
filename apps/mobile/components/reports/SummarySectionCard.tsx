import { View, Text } from "react-native";
import { ClipboardList } from "lucide-react-native";
import { Card } from "@/components/ui/Card";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { SECTION_ICONS } from "@/lib/section-icons";
import type { GeneratedReportSection } from "@/lib/generated-report";
import { colors } from "@/lib/design-tokens/colors";

interface SummarySectionCardProps {
  section: GeneratedReportSection;
}

export function SummarySectionCard({ section }: SummarySectionCardProps) {
  const Icon = SECTION_ICONS[section.title] || ClipboardList;

  return (
    <Card variant="default" padding="lg">
      <SectionHeader
        title={section.title}
        icon={<Icon size={16} color={colors.foreground} />}
      />
      <Text className="mt-4 text-base leading-relaxed text-muted-foreground">
        {section.content}
      </Text>
    </Card>
  );
}
