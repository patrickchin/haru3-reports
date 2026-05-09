import { Keyboard, Pressable, Text, View, ActivityIndicator } from "react-native";
import { Code, FileText, MessageSquare, Pencil } from "lucide-react-native";
import { colors } from "@/lib/design-tokens/colors";
import { getGenerateReportTabLabel } from "@/lib/generate-report-ui";

export const TAB_ORDER = ["notes", "report", "edit", "debug"] as const;
export type TabKey = (typeof TAB_ORDER)[number];

interface GenerateReportTabBarProps {
  activeTab: TabKey;
  notesCount: number;
  isUpdating: boolean;
  onSelectTab: (tab: TabKey) => void;
  onOpenEditTab: () => void;
}

export function GenerateReportTabBar({
  activeTab,
  notesCount,
  isUpdating,
  onSelectTab,
  onOpenEditTab,
}: GenerateReportTabBarProps) {
  const select = (tab: TabKey) => {
    Keyboard.dismiss();
    onSelectTab(tab);
  };

  return (
    <View className="mx-5 mt-3 mb-2 flex-row rounded-lg border border-border bg-card p-1">
      <Pressable
        testID="btn-tab-notes"
        onPress={() => select("notes")}
        className={`flex-1 flex-row items-center justify-center gap-2 rounded-md py-3 ${
          activeTab === "notes" ? "bg-secondary border-b-2 border-accent" : ""
        }`}
      >
        <MessageSquare
          size={16}
          color={activeTab === "notes" ? colors.foreground : colors.muted.foreground}
          style={{ marginTop: 1 }}
        />
        <Text
          className={`text-sm font-semibold ${
            activeTab === "notes" ? "text-foreground" : "text-muted-foreground"
          }`}
        >
          {getGenerateReportTabLabel("notes", notesCount)}
        </Text>
      </Pressable>
      <Pressable
        testID="btn-tab-report"
        onPress={() => select("report")}
        className={`flex-1 flex-row items-center justify-center gap-2 rounded-md py-3 ${
          activeTab === "report" ? "bg-secondary border-b-2 border-accent" : ""
        }`}
      >
        <FileText
          size={16}
          color={activeTab === "report" ? colors.foreground : colors.muted.foreground}
          style={{ marginTop: 1 }}
        />
        <Text
          className={`text-sm font-semibold ${
            activeTab === "report" ? "text-foreground" : "text-muted-foreground"
          }`}
        >
          {getGenerateReportTabLabel("report", notesCount)}
        </Text>
        {isUpdating && <ActivityIndicator size="small" color={colors.foreground} />}
      </Pressable>
      <Pressable
        testID="btn-tab-edit"
        onPress={onOpenEditTab}
        className={`flex-1 flex-row items-center justify-center gap-2 rounded-md py-3 ${
          activeTab === "edit" ? "bg-secondary border-b-2 border-accent" : ""
        }`}
      >
        <Pencil
          size={16}
          color={activeTab === "edit" ? colors.foreground : colors.muted.foreground}
          style={{ marginTop: 1 }}
        />
        <Text
          className={`text-sm font-semibold ${
            activeTab === "edit" ? "text-foreground" : "text-muted-foreground"
          }`}
        >
          {getGenerateReportTabLabel("edit", notesCount)}
        </Text>
      </Pressable>
      <Pressable
        onPress={() => select("debug")}
        className={`flex-1 flex-row items-center justify-center gap-2 rounded-md py-3 ${
          activeTab === "debug" ? "bg-secondary border-b-2 border-accent" : ""
        }`}
      >
        <Code
          size={16}
          color={activeTab === "debug" ? colors.foreground : colors.muted.foreground}
          style={{ marginTop: 1 }}
        />
        <Text
          className={`text-sm font-semibold ${
            activeTab === "debug" ? "text-foreground" : "text-muted-foreground"
          }`}
        >
          Debug
        </Text>
      </Pressable>
    </View>
  );
}
