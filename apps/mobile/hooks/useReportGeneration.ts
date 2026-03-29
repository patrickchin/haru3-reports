import { useState, useEffect, useRef, useCallback } from "react";
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

export function useReportGeneration(
  notesList: readonly string[]
): UseReportGenerationResult {
  const [report, setReport] = useState<GeneratedSiteReport | null>(null);
  const [isUpdating, setIsUpdating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notesVersion, setNotesVersion] = useState(0);

  const inflightRef = useRef(false);
  const pendingRef = useRef(false);

  const bumpNotesVersion = useCallback(() => {
    setNotesVersion((v) => v + 1);
  }, []);

  const updateReport = useCallback(
    async (
      notes: readonly string[],
      existingReport: GeneratedSiteReport | null
    ) => {
      if (notes.length === 0) return;
      if (inflightRef.current) {
        pendingRef.current = true;
        return;
      }

      inflightRef.current = true;
      setIsUpdating(true);
      setError(null);

      try {
        const body: Record<string, unknown> = { notes: [...notes] };
        if (existingReport) {
          body.existingReport = existingReport;
        }

        const { data, error: fnError } = await backend.functions.invoke(
          "generate-report",
          { body }
        );

        if (fnError) throw fnError;

        const normalizedReport = normalizeGeneratedReportPayload(data);
        if (!normalizedReport) {
          throw new Error("Unexpected response format");
        }

        setReport(normalizedReport);
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Report generation failed";
        setError(message);
      } finally {
        setIsUpdating(false);
        inflightRef.current = false;

        if (pendingRef.current) {
          pendingRef.current = false;
          setNotesVersion((v) => v + 1);
        }
      }
    },
    []
  );

  useEffect(() => {
    if (notesList.length === 0) return;

    const timer = setTimeout(() => {
      updateReport(notesList, report);
    }, 1500);

    return () => clearTimeout(timer);
  }, [notesVersion]);

  const handleFullRegenerate = useCallback(() => {
    setReport(null);
    setNotesVersion((v) => v + 1);
  }, []);

  return {
    report,
    isUpdating,
    error,
    notesVersion,
    bumpNotesVersion,
    setReport,
    handleFullRegenerate,
  };
}
