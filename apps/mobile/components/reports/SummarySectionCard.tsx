import { View, Text, TextInput, Pressable } from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";
import { Pencil, Check, ClipboardList } from "lucide-react-native";
import { Card } from "@/components/ui/Card";
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
    <Animated.View entering={FadeInDown.duration(150).delay(index * 50)}>
      <Card>
        <View className="mb-2 flex-row items-center gap-2">
          <View className="h-8 w-8 items-center justify-center rounded-md bg-primary/10">
            <Icon size={16} color="#f47316" />
          </View>
          <Text className="flex-1 text-base font-semibold text-foreground">
            {section.title}
          </Text>
          {editable &&
            (isEditing ? (
              <Pressable onPress={onEditSave} hitSlop={8}>
                <Check size={16} color="#f47316" />
              </Pressable>
            ) : (
              <Pressable onPress={() => onEditStart?.(index)} hitSlop={8}>
                <Pencil size={14} color="#6e6e77" />
              </Pressable>
            ))}
        </View>
        {isEditing ? (
          <TextInput
            value={editingContent}
            onChangeText={onEditChange}
            multiline
            autoFocus
            className="min-h-[60px] rounded-md bg-secondary p-2 text-base leading-relaxed text-foreground"
            onBlur={onEditSave}
          />
        ) : editable ? (
          <Pressable onPress={() => onEditStart?.(index)}>
            <Text className="text-base leading-relaxed text-muted-foreground">
              {section.content}
            </Text>
          </Pressable>
        ) : (
          <Text className="text-base leading-relaxed text-muted-foreground">
            {section.content}
          </Text>
        )}
        {formatSourceNotes(section.sourceNoteIndexes) ? (
          <Text className="mt-3 text-xs text-muted-foreground">
            {formatSourceNotes(section.sourceNoteIndexes)}
          </Text>
        ) : null}
      </Card>
    </Animated.View>
  );
}
