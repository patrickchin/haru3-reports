import { View, Pressable, Text } from "react-native";
import { ClipboardList, Trash2 } from "lucide-react-native";
import { Card } from "@/components/ui/Card";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { EditableField } from "@/components/reports/EditableField";
import { formatSourceNotes } from "@/lib/report-helpers";
import { SECTION_ICONS } from "@/lib/section-icons";
import type { GeneratedReportSection } from "@/lib/generated-report";
import { colors } from "@/lib/design-tokens/colors";

interface SummarySectionCardProps {
  section: GeneratedReportSection;
  index: number;
  editable?: boolean;
  onChange?: (next: GeneratedReportSection) => void;
  onRemove?: () => void;
}

export function SummarySectionCard({
  section,
  index,
  editable = false,
  onChange,
  onRemove,
}: SummarySectionCardProps) {
  const Icon = SECTION_ICONS[section.title] || ClipboardList;

  const handleTitleChange = (next: string) => {
    onChange?.({ ...section, title: next });
  };
  const handleContentChange = (next: string) => {
    onChange?.({ ...section, content: next });
  };

  const trailing =
    editable && onRemove ? (
      <Pressable
        testID={`section-${index}-trash`}
        onPress={onRemove}
        accessibilityRole="button"
        accessibilityLabel="Remove section"
        hitSlop={8}
      >
        <Trash2 size={16} color={colors.muted.foreground} />
      </Pressable>
    ) : undefined;

  return (
    <Card variant="default" padding="lg">
      {editable ? (
        <View className="flex-row items-start justify-between gap-3">
          <View className="flex-1 flex-row items-start gap-3">
            <View className="mt-0.5 h-9 w-9 items-center justify-center rounded-sm border border-border bg-card">
              <Icon size={16} color={colors.foreground} />
            </View>
            <View className="flex-1">
              <EditableField
                value={section.title}
                onChange={handleTitleChange}
                editable
                emptyDisplay="Section title"
                placeholder="Section title"
                textClassName="text-label text-foreground"
                testID={`section-${index}-title`}
              />
            </View>
          </View>
          {trailing ? <View>{trailing}</View> : null}
        </View>
      ) : (
        <SectionHeader
          title={section.title}
          icon={<Icon size={16} color={colors.foreground} />}
        />
      )}
      <View className="mt-4">
        {editable ? (
          <EditableField
            value={section.content}
            onChange={handleContentChange}
            editable
            multiline
            emptyDisplay="Add section content"
            placeholder="Section content"
            textClassName="text-base leading-relaxed text-muted-foreground"
            testID={`section-${index}-content`}
          />
        ) : (
          <Text className="text-base leading-relaxed text-muted-foreground">
            {section.content}
          </Text>
        )}
      </View>
      {formatSourceNotes(section.sourceNoteIndexes) ? (
        <Text className="mt-3 text-sm text-muted-foreground">
          {formatSourceNotes(section.sourceNoteIndexes)}
        </Text>
      ) : null}
    </Card>
  );
}
