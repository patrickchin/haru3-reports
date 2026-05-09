import { ScrollView, Text, View } from "react-native";
import { FileText } from "lucide-react-native";
import { EmptyState } from "@/components/ui/EmptyState";
import { ReportEditForm } from "@/components/reports/ReportEditForm";
import { colors } from "@/lib/design-tokens/colors";
import type { GeneratedSiteReport } from "@/lib/generated-report";

interface EditTabPaneProps {
  width: number;
  report: GeneratedSiteReport | null;
  onChange: React.Dispatch<React.SetStateAction<GeneratedSiteReport | null>>;
  isAutoSaving: boolean;
  lastSavedAt: number | null;
}

export function EditTabPane({
  width,
  report,
  onChange,
  isAutoSaving,
  lastSavedAt,
}: EditTabPaneProps) {
  return (
    <View style={{ width }} className="flex-1">
      {report ? (
        <View className="flex-1">
          <View className="flex-row items-center justify-between px-5 pt-2 pb-1">
            <Text className="text-sm font-medium text-muted-foreground">
              Edit report
            </Text>
            <Text
              className="text-xs text-muted-foreground"
              testID="edit-autosave-status"
            >
              {isAutoSaving ? "Saving…" : lastSavedAt ? "Saved" : ""}
            </Text>
          </View>
          <ReportEditForm report={report} onChange={onChange} />
        </View>
      ) : (
        <ScrollView
          className="flex-1 px-5"
          contentContainerStyle={{ paddingBottom: 100 }}
        >
          <EmptyState
            icon={<FileText size={28} color={colors.muted.foreground} />}
            title="Generate a report first to edit"
            description="Once your report is generated from the notes, you can edit any field here."
          />
        </ScrollView>
      )}
    </View>
  );
}
