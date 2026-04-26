import { useState, useRef, useCallback } from "react";
import { useMutation } from "@tanstack/react-query";
import {
  callPlaygroundFunction,
  InvalidKeyError,
  type PlaygroundResponse,
} from "../lib/playground-client";
import type { GeneratedSiteReport } from "../lib/generated-report";

export interface UseReportGenerationResult {
  report: GeneratedSiteReport | null;
  isUpdating: boolean;
  error: string | null;
  generate: () => void;
  setReport: React.Dispatch<React.SetStateAction<GeneratedSiteReport | null>>;
  handleFullRegenerate: () => void;
  setLastProcessedCount: (count: number) => void;
  lastResponse: PlaygroundResponse | null;
}

export function useReportGeneration(
  notesList: readonly string[],
  provider: string,
  model: string,
  onInvalidKey: () => void,
): UseReportGenerationResult {
  const [report, setReport] = useState<GeneratedSiteReport | null>(null);
  const [lastResponse, setLastResponse] = useState<PlaygroundResponse | null>(null);
  const notesListRef = useRef(notesList);
  const reportRef = useRef<GeneratedSiteReport | null>(null);
  const pendingRef = useRef(false);
  const inFlightRef = useRef(false);
  const lastProcessedCountRef = useRef(0);
  const providerRef = useRef(provider);
  const modelRef = useRef(model);

  notesListRef.current = notesList;
  reportRef.current = report;
  providerRef.current = provider;
  modelRef.current = model;

  const mutation = useMutation({
    mutationFn: ({
      notes,
      existing,
      lastProcessedCount,
    }: {
      notes: readonly string[];
      existing: GeneratedSiteReport | null;
      lastProcessedCount: number;
    }) =>
      callPlaygroundFunction({
        notes: [...notes],
        provider: providerRef.current,
        model: modelRef.current,
        existingReport: existing,
        lastProcessedNoteCount:
          lastProcessedCount > 0 ? lastProcessedCount : undefined,
      }),
    onSuccess: (data, variables) => {
      setReport(data.report);
      setLastResponse(data);
      reportRef.current = data.report;
      lastProcessedCountRef.current = variables.notes.length;
    },
    onError: (err) => {
      if (err instanceof InvalidKeyError) {
        onInvalidKey();
      }
    },
    onSettled: () => {
      inFlightRef.current = false;
      pendingRef.current = false;
    },
  });

  const setLastProcessedCount = useCallback((count: number) => {
    lastProcessedCountRef.current = count;
  }, []);

  const generate = useCallback(() => {
    const currentNotes = notesListRef.current;
    if (currentNotes.length === 0) return;

    if (inFlightRef.current) {
      pendingRef.current = true;
      return;
    }

    // Notes removed → force full regeneration
    if (currentNotes.length < lastProcessedCountRef.current) {
      lastProcessedCountRef.current = 0;
    }

    inFlightRef.current = true;
    mutation.mutate({
      notes: currentNotes,
      existing: reportRef.current,
      lastProcessedCount: lastProcessedCountRef.current,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleFullRegenerate = useCallback(() => {
    lastProcessedCountRef.current = 0;
    // Trigger immediately
    const currentNotes = notesListRef.current;
    if (currentNotes.length === 0) return;
    if (inFlightRef.current) {
      pendingRef.current = true;
      return;
    }
    inFlightRef.current = true;
    mutation.mutate({
      notes: currentNotes,
      existing: null,
      lastProcessedCount: 0,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
    generate,
    setReport,
    handleFullRegenerate,
    setLastProcessedCount,
    lastResponse,
  };
}
