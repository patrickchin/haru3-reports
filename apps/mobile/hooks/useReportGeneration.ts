import { useState, useEffect, useRef, useCallback } from "react";
import { useMutation } from "@tanstack/react-query";
import { backend } from "@/lib/backend";
import {
  normalizeGeneratedReportPayload,
  type GeneratedSiteReport,
} from "@/lib/generated-report";
import { getStoredProvider } from "@/hooks/useAiProvider";

interface UseReportGenerationResult {
  report: GeneratedSiteReport | null;
  isUpdating: boolean;
  error: string | null;
  notesVersion: number;
  bumpNotesVersion: () => void;
  setReport: React.Dispatch<React.SetStateAction<GeneratedSiteReport | null>>;
  handleFullRegenerate: () => void;
  rawRequest: Record<string, unknown> | null;
  rawResponse: unknown;
  mutationStatus: string;
}

interface GenerateReportResult {
  report: GeneratedSiteReport;
  requestBody: Record<string, unknown>;
  rawResponse: unknown;
}

async function generateReport(
  notes: readonly string[],
  existingReport: GeneratedSiteReport | null,
  lastProcessedNoteCount: number,
  projectId?: string,
  onRequest?: (body: Record<string, unknown>) => void,
): Promise<GenerateReportResult> {
  const provider = await getStoredProvider();
  const body: Record<string, unknown> = { notes: [...notes], provider };
  if (existingReport) {
    body.existingReport = existingReport;
    if (lastProcessedNoteCount > 0) {
      body.lastProcessedNoteCount = lastProcessedNoteCount;
    }
  }
  if (projectId) {
    body.projectId = projectId;
  }

  onRequest?.(body);

  const { data, error } = await backend.functions.invoke("generate-report", {
    body,
  });

  if (error) throw error;

  const normalized = normalizeGeneratedReportPayload(data);
  if (!normalized) throw new Error("Unexpected response format");

  return { report: normalized, requestBody: body, rawResponse: data };
}

export function useReportGeneration(
  notesList: readonly string[],
  projectId?: string,
): UseReportGenerationResult {
  const [report, setReport] = useState<GeneratedSiteReport | null>(null);
  const [rawRequest, setRawRequest] = useState<Record<string, unknown> | null>(null);
  const [rawResponse, setRawResponse] = useState<unknown>(null);
  const [notesVersion, setNotesVersion] = useState(0);
  const pendingRef = useRef(false);
  const lastProcessedCountRef = useRef(0);

  const mutation = useMutation({
    mutationFn: ({
      notes,
      existing,
      lastProcessedCount,
    }: {
      notes: readonly string[];
      existing: GeneratedSiteReport | null;
      lastProcessedCount: number;
    }) => {
      setRawResponse(null);
      return generateReport(notes, existing, lastProcessedCount, projectId, (body) => {
        setRawRequest(body);
      });
    },
    onSuccess: (data, variables) => {
      setReport(data.report);
      setRawResponse(data.rawResponse);
      lastProcessedCountRef.current = variables.notes.length;
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
      if (notesList.length < lastProcessedCountRef.current) {
        lastProcessedCountRef.current = 0;
      }
      mutation.mutate({
        notes: notesList,
        existing: report,
        lastProcessedCount: lastProcessedCountRef.current,
      });
    }, 1500);

    return () => clearTimeout(timer);
  }, [notesVersion]);

  const handleFullRegenerate = useCallback(() => {
    lastProcessedCountRef.current = 0;
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
    rawRequest,
    rawResponse,
    mutationStatus: mutation.status,
  };
}
