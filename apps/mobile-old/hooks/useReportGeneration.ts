import { useState, useRef, useCallback } from "react";
import { useMutation } from "@tanstack/react-query";
import { backend } from "@/lib/backend";
import {
  normalizeGeneratedReportPayload,
  type GeneratedSiteReport,
} from "@/lib/generated-report";
import { getStoredProvider, getStoredModel } from "@/hooks/useAiProvider";

export interface LastGeneration {
  generatedAt: string;
  durationMs: number;
  provider: string | null;
  model: string | null;
  request: Record<string, unknown> | null;
  systemPrompt: string | null;
  userPrompt: string | null;
  response: unknown;
  usage: unknown;
  error: string | null;
}

interface UseReportGenerationResult {
  report: GeneratedSiteReport | null;
  setReport: React.Dispatch<React.SetStateAction<GeneratedSiteReport | null>>;
  isUpdating: boolean;
  error: string | null;
  regenerate: () => void;
  notesSinceLastGeneration: number;
  rawRequest: Record<string, unknown> | null;
  rawResponse: unknown;
  lastGeneration: LastGeneration | null;
  setLastGeneration: React.Dispatch<React.SetStateAction<LastGeneration | null>>;
  mutationStatus: string;
}

interface GenerateReportResult {
  report: GeneratedSiteReport;
  requestBody: Record<string, unknown>;
  rawResponse: unknown;
}

async function generateReport(
  notes: readonly string[],
  projectId: string | undefined,
  onRequest: (body: Record<string, unknown>) => void,
  onRawResponse: (raw: unknown) => void,
): Promise<GenerateReportResult> {
  const provider = await getStoredProvider();
  const model = await getStoredModel(provider);
  const body: Record<string, unknown> = { notes: [...notes], provider, model };
  if (projectId) body.projectId = projectId;

  onRequest(body);

  const { data, error } = await backend.functions.invoke("generate-report", {
    body,
  });

  if (error) {
    const status = (error as { status?: number }).status;
    const message = error instanceof Error ? error.message : String(error);
    onRawResponse({ _error: true, status: status ?? null, message });
    throw new Error(
      status
        ? `Edge function returned HTTP ${status}: ${message}`
        : `Edge function call failed: ${message}`,
    );
  }

  onRawResponse(data);

  const normalized = normalizeGeneratedReportPayload(data);
  if (!normalized) {
    throw new Error(
      `Unexpected response format — the edge function returned data that doesn't match the report schema. Check the LLM Response in the Debug tab.`,
    );
  }

  return { report: normalized, requestBody: body, rawResponse: data };
}

function extractMeta(raw: unknown): {
  provider: string | null;
  model: string | null;
  systemPrompt: string | null;
  userPrompt: string | null;
  usage: unknown;
} {
  if (!raw || typeof raw !== "object") {
    return { provider: null, model: null, systemPrompt: null, userPrompt: null, usage: null };
  }
  const r = raw as Record<string, unknown>;
  return {
    provider: typeof r.provider === "string" ? r.provider : null,
    model: typeof r.model === "string" ? r.model : null,
    systemPrompt: typeof r.systemPrompt === "string" ? r.systemPrompt : null,
    userPrompt: typeof r.userPrompt === "string" ? r.userPrompt : null,
    usage: r.usage ?? null,
  };
}

export function useReportGeneration(
  notesList: readonly string[],
  projectId?: string,
): UseReportGenerationResult {
  const [report, setReport] = useState<GeneratedSiteReport | null>(null);
  const [rawRequest, setRawRequest] = useState<Record<string, unknown> | null>(null);
  const [rawResponse, setRawResponse] = useState<unknown>(null);
  const [lastGeneration, setLastGeneration] = useState<LastGeneration | null>(null);
  const [lastSuccessNoteCount, setLastSuccessNoteCount] = useState(0);
  const startTimeRef = useRef<number>(0);

  const notesListRef = useRef(notesList);
  notesListRef.current = notesList;

  const mutation = useMutation({
    mutationFn: (notes: readonly string[]) => {
      startTimeRef.current = Date.now();
      return generateReport(
        notes,
        projectId,
        (body) => setRawRequest(body),
        (raw) => setRawResponse(raw),
      );
    },
    onSuccess: (data, notes) => {
      setReport(data.report);
      setRawResponse(data.rawResponse);
      setLastSuccessNoteCount(notes.length);
      const meta = extractMeta(data.rawResponse);
      setLastGeneration({
        generatedAt: new Date().toISOString(),
        durationMs: Date.now() - startTimeRef.current,
        provider: meta.provider,
        model: meta.model,
        systemPrompt: meta.systemPrompt,
        userPrompt: meta.userPrompt,
        request: data.requestBody,
        response: data.rawResponse,
        usage: meta.usage,
        error: null,
      });
    },
    onError: (err) => {
      const message = err instanceof Error ? err.message : String(err);
      setLastGeneration({
        generatedAt: new Date().toISOString(),
        durationMs: Date.now() - startTimeRef.current,
        provider: null,
        model: null,
        systemPrompt: null,
        userPrompt: null,
        request: rawRequest,
        response: null,
        usage: null,
        error: message,
      });
    },
  });

  const regenerate = useCallback(() => {
    if (mutation.isPending) return;
    if (notesListRef.current.length === 0) return;
    mutation.mutate(notesListRef.current);
  }, [mutation]);

  const errorMessage = mutation.error
    ? mutation.error instanceof Error
      ? mutation.error.message
      : "Report generation failed"
    : null;

  const notesSinceLastGeneration = Math.max(
    0,
    notesList.length - lastSuccessNoteCount,
  );

  return {
    report,
    setReport,
    isUpdating: mutation.isPending,
    error: errorMessage,
    regenerate,
    notesSinceLastGeneration,
    rawRequest,
    rawResponse,
    lastGeneration,
    setLastGeneration,
    mutationStatus: mutation.status,
  };
}
