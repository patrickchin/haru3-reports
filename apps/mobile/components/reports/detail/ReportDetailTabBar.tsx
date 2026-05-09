import { View, Text, Pressable } from "react-native";
import { FileText, Pencil } from "lucide-react-native";
import { colors } from "@/lib/design-tokens/colors";

export type ReportDetailTab = "report" | "edit";

interface ReportDetailTabBarProps {
  activeTab: ReportDetailTab;
  onChange: (tab: ReportDetailTab) => void;
}

export function ReportDetailTabBar({ activeTab, onChange }: ReportDetailTabBarProps) {
  return (
    <View className="mx-5 mb-2 flex-row rounded-lg border border-border bg-card p-1">
      <Pressable
        testID="btn-tab-report"
        onPress={() => onChange("report")}
        className={`flex-1 flex-row items-center justify-center gap-2 rounded-md py-3 ${
          activeTab === "report" ? "bg-foreground" : ""
        }`}
      >
        <FileText
          size={16}
          color={
            activeTab === "report"
              ? colors.primary.foreground
              : colors.muted.foreground
          }
          style={{ marginTop: 1 }}
        />
        <Text
          className={`text-sm font-semibold ${
            activeTab === "report"
              ? "text-primary-foreground"
              : "text-muted-foreground"
          }`}
        >
          Report
        </Text>
      </Pressable>
      <Pressable
        testID="btn-tab-edit"
        onPress={() => onChange("edit")}
        className={`flex-1 flex-row items-center justify-center gap-2 rounded-md py-3 ${
          activeTab === "edit" ? "bg-foreground" : ""
        }`}
      >
        <Pencil
          size={16}
          color={
            activeTab === "edit"
              ? colors.primary.foreground
              : colors.muted.foreground
          }
          style={{ marginTop: 1 }}
        />
        <Text
          className={`text-sm font-semibold ${
            activeTab === "edit"
              ? "text-primary-foreground"
              : "text-muted-foreground"
          }`}
        >
          Edit
        </Text>
      </Pressable>
    </View>
  );
}
