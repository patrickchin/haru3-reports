/**
 * Hook for AI report generation via generate-report edge function.
 */
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { GeneratedSiteReport } from "@harpa/report-core";
import { supabase } from "@/infra/supabase";
import { reportKeys } from "./queries";

type GenerateReportInput = {
  reportId: string;
  projectId: string;
  notes: string[];
};

type GenerateReportResponse = {
  report: GeneratedSiteReport;
};

export function useGenerateReport() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ reportId, notes }: GenerateReportInput) => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) throw new Error("Not authenticated");

      const response = await fetch(
        `${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/generate-report`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            reportId,
            notes,
          }),
        }
      );

      if (!response.ok) {
        const text = await response.text();
        throw new Error(`Generate report failed: ${response.status} ${text}`);
      }

      const result = (await response.json()) as GenerateReportResponse;
      return result.report;
    },
    onSuccess: (_data, { reportId, projectId }) => {
      queryClient.invalidateQueries({ queryKey: reportKeys.byId(reportId) });
      queryClient.invalidateQueries({
        queryKey: reportKeys.byProject(projectId),
      });
    },
  });
}
