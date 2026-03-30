import { useState, useEffect, useRef, useCallback } from "react";
import { useMutation } from "@tanstack/react-query";
import { backend } from "@/lib/backend";
import {
  normalizeGeneratedReportPayload,
  type GeneratedSiteReport,
} from "@/lib/generated-report";

interface UseReportGenerationResult {
  report: GeneratedSiteReport | null;
  isUpdating: boolean;
  error: string | null;
  notesVersion: number;
  bumpNotesVersion: () => void;
  setReport: React.Dispatch<React.SetStateAction<GeneratedSiteReport | null>>;
  handleFullRegenerate: () => void;
}

async function generateReport(
  notes: readonly string[],
  existingReport: GeneratedSiteReport | null
): Promise<GeneratedSiteReport> {
  const body: Record<string, unknown> = { notes: [...notes] };
  if (existingReport) {
    body.existingReport = existingReport;
  }

  const { data, error } = await backend.functions.invoke("generate-report", {
    body,
  });

  if (error) throw error;

  const normalized = normalizeGeneratedReportPayload(data);
  if (!normalized) throw new Error("Unexpected response format");

  return normalized;
}

export function useReportGeneration(
  notesList: readonly string[]
): UseReportGenerationResult {
  const [report, setReport] = useState<GeneratedSiteReport | null>(null);
  const [notesVersion, setNotesVersion] = useState(0);
  const pendingRef = useRef(false);

  const mutation = useMutation({
    mutationFn: ({
      notes,
      existing,
    }: {
      notes: readonly string[];
      existing: GeneratedSiteReport | null;
    }) => generateReport(notes, existing),
    onSuccess: (data) => {
      setReport(data);
    },
    onSettled: () => {
      if (pendingRef.current) {
        pendingRef.current = false;
        setNotesVersion((v) => v + 1);
      }
    },
  });

  const bumpNotesVersion = useCallback(() => {
    setNotesVersion((v) => v + 1);
  }, []);

  useEffect(() => {
    if (notesList.length === 0) return;

    const timer = setTimeout(() => {
      if (mutation.isPending) {
        pendingRef.current = true;
        return;
      }
      mutation.mutate({ notes: notesList, existing: report });
    }, 1500);

    return () => clearTimeout(timer);
  }, [notesVersion]);

  const handleFullRegenerate = useCallback(() => {
    setReport(null);
    setNotesVersion((v) => v + 1);
  }, []);

  const errorMessage = mutation.error
    ? mutation.error instanceof Error
      ? mutation.error.message
      : "Report generation failed"
    : null;

  return {
    report,
    isUpdating: mutation.isPending,
    error: errorMessage,
    notesVersion,
    bumpNotesVersion,
    setReport,
    handleFullRegenerate,
  };
}
