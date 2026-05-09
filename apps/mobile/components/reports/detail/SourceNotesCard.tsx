import { View, Text, Pressable } from "react-native";
import { ChevronDown, ChevronRight, MessageSquare } from "lucide-react-native";
import { Card } from "@/components/ui/Card";
import { ReportLinkedFiles } from "@/components/files/ReportLinkedFiles";
import { colors } from "@/lib/design-tokens/colors";
import type { FileMetadataRow } from "@/lib/file-upload";

interface SourceNotesCardProps {
  expanded: boolean;
  onToggle: () => void;
  notes: string[];
  noteRows: Parameters<typeof ReportLinkedFiles>[0]["noteRows"];
  projectId: string;
  onOpenFile: (file: FileMetadataRow) => void;
}

export function SourceNotesCard({
  expanded,
  onToggle,
  notes,
  noteRows,
  projectId,
  onOpenFile,
}: SourceNotesCardProps) {
  return (
    <View className="mt-4 px-5">
      <Card variant="muted" padding="md">
        <Pressable
          onPress={onToggle}
          accessibilityRole="button"
          accessibilityLabel={expanded ? "Hide source notes" : "Show source notes"}
          className="flex-row items-center justify-between"
        >
          <View className="flex-row items-center gap-2">
            <MessageSquare size={16} color={colors.foreground} />
            <Text className="text-base font-semibold text-foreground">
              Source Notes
            </Text>
            {notes.length > 0 ? (
              <Text className="text-sm text-muted-foreground">({notes.length})</Text>
            ) : null}
          </View>
          {expanded ? (
            <ChevronDown size={18} color={colors.muted.foreground} />
          ) : (
            <ChevronRight size={18} color={colors.muted.foreground} />
          )}
        </Pressable>

        {expanded && (
          <View className="mt-3 gap-3">
            <Text className="text-sm text-muted-foreground">
              The original notes this report was generated from.
            </Text>

            {notes.length > 0 && (
              <View className="gap-2">
                {notes.map((note, index) => (
                  <View
                    key={`source-note-${index}`}
                    className="flex-row items-start gap-3 rounded-lg border border-border bg-card p-3"
                  >
                    <View className="min-h-8 min-w-8 items-center justify-center rounded-md bg-secondary px-2 py-1">
                      <Text className="text-sm font-semibold text-foreground">
                        {index + 1}
                      </Text>
                    </View>
                    <Text className="flex-1 text-body text-foreground">{note}</Text>
                  </View>
                ))}
              </View>
            )}

            <ReportLinkedFiles
              projectId={projectId}
              noteRows={noteRows}
              onOpenFile={onOpenFile}
            />
          </View>
        )}
      </Card>
    </View>
  );
}
