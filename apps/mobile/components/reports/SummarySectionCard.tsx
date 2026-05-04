import { useEffect, useState } from "react";
import { View, Pressable, Text, TextInput } from "react-native";
import { ClipboardList, Trash2 } from "lucide-react-native";
import { Card } from "@/components/ui/Card";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { CardEditButtons } from "@/components/reports/CardEditButtons";
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

interface SectionDraft {
  title: string;
  content: string;
}

function toDraft(s: GeneratedReportSection): SectionDraft {
  return { title: s.title ?? "", content: s.content ?? "" };
}

export function SummarySectionCard({
  section,
  index,
  editable = false,
  onChange,
  onRemove,
}: SummarySectionCardProps) {
  const Icon = SECTION_ICONS[section.title] || ClipboardList;
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState<SectionDraft>(() => toDraft(section));

  useEffect(() => {
    if (!isEditing) setDraft(toDraft(section));
  }, [section, isEditing]);

  const handleEdit = () => {
    setDraft(toDraft(section));
    setIsEditing(true);
  };

  const handleCancel = () => {
    setDraft(toDraft(section));
    setIsEditing(false);
  };

  const handleSave = () => {
    onChange?.({
      ...section,
      title: draft.title,
      content: draft.content,
    });
    setIsEditing(false);
  };

  const trash =
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
    ) : null;

  if (!editable) {
    return (
      <Card variant="default" padding="lg">
        <SectionHeader
          title={section.title}
          icon={<Icon size={16} color={colors.foreground} />}
        />
        <View className="mt-4">
          <Text className="text-base leading-relaxed text-muted-foreground">
            {section.content}
          </Text>
        </View>
        {formatSourceNotes(section.sourceNoteIndexes) ? (
          <Text className="mt-3 text-sm text-muted-foreground">
            {formatSourceNotes(section.sourceNoteIndexes)}
          </Text>
        ) : null}
      </Card>
    );
  }

  return (
    <Card variant="default" padding="lg">
      <View className="flex-row items-start justify-between gap-3">
        <View className="flex-1 flex-row items-start gap-3">
          <View className="mt-0.5 h-9 w-9 items-center justify-center rounded-sm border border-border bg-card">
            <Icon size={16} color={colors.foreground} />
          </View>
          <View className="flex-1">
            {isEditing ? (
              <TextInput
                testID={`section-${index}-title-input`}
                value={draft.title}
                onChangeText={(next) =>
                  setDraft((d) => ({ ...d, title: next }))
                }
                placeholder="Section title"
                placeholderTextColor={colors.muted.foreground}
                className="rounded-md border border-border bg-card px-2 py-1 text-label text-foreground"
              />
            ) : (
              <Text
                className="text-label text-foreground"
                testID={`section-${index}-title`}
              >
                {section.title || "Section title"}
              </Text>
            )}
          </View>
        </View>
        <View className="flex-row items-center gap-2">
          <CardEditButtons
            testID={`section-${index}`}
            isEditing={isEditing}
            onEdit={handleEdit}
            onSave={handleSave}
            onCancel={handleCancel}
          />
          {trash}
        </View>
      </View>

      <View className="mt-4">
        {isEditing ? (
          <TextInput
            testID={`section-${index}-content-input`}
            value={draft.content}
            onChangeText={(next) =>
              setDraft((d) => ({ ...d, content: next }))
            }
            multiline
            placeholder="Add section content"
            placeholderTextColor={colors.muted.foreground}
            className="rounded-md border border-border bg-card px-2 py-1 text-base leading-relaxed text-muted-foreground"
          />
        ) : (
          <Text
            className="text-base leading-relaxed text-muted-foreground"
            testID={`section-${index}-content`}
          >
            {section.content || "Add section content"}
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
