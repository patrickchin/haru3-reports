import { View, Text, TextInput, Pressable } from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";
import { Pencil, Check, ClipboardList } from "lucide-react-native";
import { Card } from "@/components/ui/Card";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { formatSourceNotes } from "@/lib/report-helpers";
import { SECTION_ICONS } from "@/lib/section-icons";
import type { GeneratedReportSection } from "@/lib/generated-report";

interface SummarySectionCardProps {
  section: GeneratedReportSection;
  index: number;
  editable?: boolean;
  isEditing?: boolean;
  editingContent?: string;
  onEditStart?: (index: number) => void;
  onEditChange?: (content: string) => void;
  onEditSave?: () => void;
}

export function SummarySectionCard({
  section,
  index,
  editable = false,
  isEditing = false,
  editingContent = "",
  onEditStart,
  onEditChange,
  onEditSave,
}: SummarySectionCardProps) {
  const Icon = SECTION_ICONS[section.title] || ClipboardList;

  return (
    <Animated.View entering={FadeInDown.duration(200).delay(index * 50)}>
      <Card variant="default" padding="lg">
        <SectionHeader
          title={section.title}
          icon={<Icon size={16} color="#1a1a2e" />}
          trailing={
            editable
              ? isEditing ? (
                  <Pressable onPress={onEditSave} hitSlop={8}>
                    <Check size={16} color="#1a1a2e" />
                  </Pressable>
                ) : (
                  <Pressable onPress={() => onEditStart?.(index)} hitSlop={8}>
                    <Pencil size={14} color="#5c5c6e" />
                  </Pressable>
                )
              : null
          }
        />
        {isEditing ? (
          <TextInput
            value={editingContent}
            onChangeText={onEditChange}
            multiline
            autoFocus
            className="mt-4 min-h-[72px] rounded-md border border-border bg-card p-3 text-base leading-relaxed text-foreground"
            onBlur={onEditSave}
          />
        ) : editable ? (
          <Pressable onPress={() => onEditStart?.(index)} className="mt-4">
            <Text className="text-base leading-relaxed text-muted-foreground" selectable>
              {section.content}
            </Text>
          </Pressable>
        ) : (
          <Text className="mt-4 text-base leading-relaxed text-muted-foreground" selectable>
            {section.content}
          </Text>
        )}
        {formatSourceNotes(section.sourceNoteIndexes) ? (
          <Text className="mt-3 text-sm text-muted-foreground" selectable>
            {formatSourceNotes(section.sourceNoteIndexes)}
          </Text>
        ) : null}
      </Card>
    </Animated.View>
  );
}
