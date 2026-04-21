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
  setLastProcessedCount: (count: number) => void;
}

interface GenerateReportResult {
  report: GeneratedSiteReport;
  requestBody: Record<string, unknown>;
  rawResponse: unknown;
}

export interface ReportPhotoMarker {
  id: string;
  afterNoteIndex: number;
}

async function generateReport(
  notes: readonly string[],
  existingReport: GeneratedSiteReport | null,
  lastProcessedNoteCount: number,
  projectId?: string,
  photos?: readonly ReportPhotoMarker[],
  onRequest?: (body: Record<string, unknown>) => void,
  onRawResponse?: (raw: unknown) => void,
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
  if (photos && photos.length > 0) {
    body.photos = photos.map((p) => ({
      id: p.id,
      afterNoteIndex: p.afterNoteIndex,
    }));
  }

  onRequest?.(body);

  const { data, error } = await backend.functions.invoke("generate-report", {
    body,
  });

  if (error) {
    const status = (error as { status?: number }).status;
    const message = error instanceof Error ? error.message : String(error);
    onRawResponse?.({ _error: true, status: status ?? null, message });
    throw new Error(
      status
        ? `Edge function returned HTTP ${status}: ${message}`
        : `Edge function call failed: ${message}`,
    );
  }

  // Always surface whatever the edge function returned
  onRawResponse?.(data);

  const normalized = normalizeGeneratedReportPayload(data);
  if (!normalized) {
    throw new Error(
      `Unexpected response format — the edge function returned data that doesn't match the report schema. Check the LLM Response in the Debug tab.`,
    );
  }

  return { report: normalized, requestBody: body, rawResponse: data };
}

export function useReportGeneration(
  notesList: readonly string[],
  projectId?: string,
  photos: readonly ReportPhotoMarker[] = [],
): UseReportGenerationResult {
  const [report, setReport] = useState<GeneratedSiteReport | null>(null);
  const [rawRequest, setRawRequest] = useState<Record<string, unknown> | null>(null);
  const [rawResponse, setRawResponse] = useState<unknown>(null);
  const [notesVersion, setNotesVersion] = useState(0);
  const notesListRef = useRef(notesList);
  const photosRef = useRef(photos);
  const reportRef = useRef<GeneratedSiteReport | null>(null);
  const pendingRef = useRef(false);
  const inFlightRef = useRef(false);
  const lastProcessedCountRef = useRef(0);

  notesListRef.current = notesList;
  photosRef.current = photos;
  reportRef.current = report;

  const mutation = useMutation({
    mutationFn: ({
      notes,
      existing,
      lastProcessedCount,
      photos,
    }: {
      notes: readonly string[];
      existing: GeneratedSiteReport | null;
      lastProcessedCount: number;
      photos: readonly ReportPhotoMarker[];
    }) => {
      setRawResponse(null);
      return generateReport(
        notes,
        existing,
        lastProcessedCount,
        projectId,
        photos,
        (body) => setRawRequest(body),
        (raw) => setRawResponse(raw),
      );
    },
    onSuccess: (data, variables) => {
      setReport(data.report);
      setRawResponse(data.rawResponse);
      reportRef.current = data.report;
      lastProcessedCountRef.current = variables.notes.length;
    },
    onSettled: () => {
      inFlightRef.current = false;
      if (pendingRef.current) {
        pendingRef.current = false;
        setNotesVersion((v) => v + 1);
      }
    },
  });

  const bumpNotesVersion = useCallback(() => {
    setNotesVersion((v) => v + 1);
  }, []);

  const setLastProcessedCount = useCallback((count: number) => {
    lastProcessedCountRef.current = count;
  }, []);

  useEffect(() => {
    if (notesListRef.current.length === 0) return;

    const timer = setTimeout(() => {
      const currentNotes = notesListRef.current;

      if (currentNotes.length === 0) return;

      if (inFlightRef.current) {
        pendingRef.current = true;
        return;
      }

      if (currentNotes.length < lastProcessedCountRef.current) {
        lastProcessedCountRef.current = 0;
      }

      inFlightRef.current = true;
      mutation.mutate({
        notes: currentNotes,
        existing: reportRef.current,
        lastProcessedCount: lastProcessedCountRef.current,
        photos: photosRef.current,
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
    setLastProcessedCount,
  };
}
