import { Keyboard, Pressable, Text, View, ActivityIndicator } from "react-native";
import { Code, FileText, MessageSquare, Pencil } from "lucide-react-native";
import { useGenerateReport } from "@/components/reports/generate/GenerateReportProvider";
import { TAB_ORDER, type TabKey } from "@/components/reports/generate/tabs";
import { colors } from "@/lib/design-tokens/colors";
import { getGenerateReportTabLabel } from "@/lib/generate-report-ui";

// Re-export so consumers (provider, screen) can keep their existing imports.
export { TAB_ORDER, type TabKey };

export function GenerateReportTabBar() {
  const { tabs, notes, generation } = useGenerateReport();
  const notesCount = notes.totalCount;

  const select = (tab: TabKey) => {
    Keyboard.dismiss();
    tabs.set(tab);
  };

  return (
    <View className="mx-5 mt-3 mb-2 flex-row rounded-lg border border-border bg-card p-1">
      <Pressable
        testID="btn-tab-notes"
        onPress={() => select("notes")}
        className={`flex-1 flex-row items-center justify-center gap-2 rounded-md py-3 ${
          tabs.active === "notes" ? "bg-secondary border-b-2 border-accent" : ""
        }`}
      >
        <MessageSquare
          size={16}
          color={tabs.active === "notes" ? colors.foreground : colors.muted.foreground}
          style={{ marginTop: 1 }}
        />
        <Text
          className={`text-sm font-semibold ${
            tabs.active === "notes" ? "text-foreground" : "text-muted-foreground"
          }`}
        >
          {getGenerateReportTabLabel("notes", notesCount)}
        </Text>
      </Pressable>
      <Pressable
        testID="btn-tab-report"
        onPress={() => select("report")}
        className={`flex-1 flex-row items-center justify-center gap-2 rounded-md py-3 ${
          tabs.active === "report" ? "bg-secondary border-b-2 border-accent" : ""
        }`}
      >
        <FileText
          size={16}
          color={tabs.active === "report" ? colors.foreground : colors.muted.foreground}
          style={{ marginTop: 1 }}
        />
        <Text
          className={`text-sm font-semibold ${
            tabs.active === "report" ? "text-foreground" : "text-muted-foreground"
          }`}
        >
          {getGenerateReportTabLabel("report", notesCount)}
        </Text>
        {generation.isUpdating && <ActivityIndicator size="small" color={colors.foreground} />}
      </Pressable>
      <Pressable
        testID="btn-tab-edit"
        onPress={tabs.openEdit}
        className={`flex-1 flex-row items-center justify-center gap-2 rounded-md py-3 ${
          tabs.active === "edit" ? "bg-secondary border-b-2 border-accent" : ""
        }`}
      >
        <Pencil
          size={16}
          color={tabs.active === "edit" ? colors.foreground : colors.muted.foreground}
          style={{ marginTop: 1 }}
        />
        <Text
          className={`text-sm font-semibold ${
            tabs.active === "edit" ? "text-foreground" : "text-muted-foreground"
          }`}
        >
          {getGenerateReportTabLabel("edit", notesCount)}
        </Text>
      </Pressable>
      <Pressable
        onPress={() => select("debug")}
        className={`flex-1 flex-row items-center justify-center gap-2 rounded-md py-3 ${
          tabs.active === "debug" ? "bg-secondary border-b-2 border-accent" : ""
        }`}
      >
        <Code
          size={16}
          color={tabs.active === "debug" ? colors.foreground : colors.muted.foreground}
          style={{ marginTop: 1 }}
        />
        <Text
          className={`text-sm font-semibold ${
            tabs.active === "debug" ? "text-foreground" : "text-muted-foreground"
          }`}
        >
          Debug
        </Text>
      </Pressable>
    </View>
  );
}
