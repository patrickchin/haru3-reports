import { KeyboardAvoidingView, ScrollView, View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { SafeAreaView } from "@/components/ui/SafeAreaView";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { DeleteDraftButton } from "@/components/reports/DeleteDraftButton";
import {
  GenerateReportProvider,
  useGenerateReport,
} from "@/components/reports/generate/GenerateReportProvider";
import { GenerateReportTabBar } from "@/components/reports/generate/GenerateReportTabBar";
import { NotesTabPane } from "@/components/reports/generate/NotesTabPane";
import { ReportTabPane } from "@/components/reports/generate/ReportTabPane";
import { EditTabPane } from "@/components/reports/generate/EditTabPane";
import { DebugTabPane } from "@/components/reports/generate/DebugTabPane";
import { GenerateReportInputBar } from "@/components/reports/generate/GenerateReportInputBar";
import { GenerateReportDialogs } from "@/components/reports/generate/GenerateReportDialogs";

export default function GenerateReportScreen() {
  const { projectId, reportId } = useLocalSearchParams<{
    projectId: string;
    reportId?: string;
  }>();

  return (
    <SafeAreaView className="flex-1 bg-background">
      <KeyboardAvoidingView
        behavior="padding"
        className="flex-1"
        keyboardVerticalOffset={0}
      >
        <GenerateReportProvider projectId={projectId!} reportId={reportId}>
          <GenerateReportLayout />
        </GenerateReportProvider>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

/**
 * Inner body — split out so it can `useGenerateReport()` from inside the
 * provider. Pure layout: header, tab bar, horizontal pager of panes,
 * bottom input bar, and the dialog stack. All state lives in the
 * provider; panes pull what they need themselves.
 */
function GenerateReportLayout() {
  const {
    reportId,
    draft,
    menuActions,
    refs,
    tabs,
  } = useGenerateReport();

  return (
    <>
      <View className="px-5 pt-4 pb-2">
        <ScreenHeader
          title="New Report"
          onBack={draft.handleBack}
          backLabel="Reports"
          trailing={
            reportId ? (
              <DeleteDraftButton
                isDeleting={draft.isDeletingDraft}
                onConfirmDelete={() => draft.deleteDraft()}
                extraActions={menuActions}
              />
            ) : null
          }
        />
      </View>

      <GenerateReportTabBar />

      <ScrollView
        ref={refs.pager}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        onMomentumScrollEnd={tabs.onPagerMomentumEnd}
        contentOffset={{ x: tabs.windowWidth, y: 0 }}
        className="flex-1"
        // Disable parent's horizontal pan from intercepting taps inside
        // children (e.g. note rows, buttons) on Android.
        nestedScrollEnabled
      >
        <NotesTabPane ref={refs.notesScroll} width={tabs.windowWidth} />
        <ReportTabPane ref={refs.reportScroll} width={tabs.windowWidth} />
        <EditTabPane width={tabs.windowWidth} />
        <DebugTabPane width={tabs.windowWidth} />
      </ScrollView>

      <GenerateReportInputBar />

      <GenerateReportDialogs />
    </>
  );
}
