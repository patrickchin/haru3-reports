import React, {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  useReport,
  useNotes,
  useCreateNote,
  useDeleteNote,
  useGenerateReport,
  useFinalizeReport,
  useUpdateReport,
} from '@/lib/api/hooks';
import { useVoiceNotePipeline } from '@/features/voice/useVoiceNotePipeline';
import { useNoteTimeline, type TimelineEntry, type Note } from './useNoteTimeline';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type TabKey = 'notes' | 'report' | 'edit';

export interface GenerateReportContextValue {
  // Data
  reportId: string;
  projectId: string;
  report: any;
  reportLoading: boolean;
  notes: Note[] | undefined;
  notesLoading: boolean;
  timeline: TimelineEntry[];

  // Tab state
  activeTab: TabKey;
  setActiveTab: (tab: TabKey) => void;

  // Notes CRUD
  addTextNote: (text: string) => Promise<void>;
  deleteNote: (noteId: string) => Promise<void>;

  // Voice
  startRecording: () => Promise<void>;
  stopRecording: () => Promise<void>;
  isRecording: boolean;
  amplitudes: number[];
  retryVoiceNote: (noteId: string) => void;

  // Generation
  generateReport: () => Promise<void>;
  isGenerating: boolean;
  finalizeReport: () => Promise<void>;
  isFinalizing: boolean;

  // Report editing
  reportData: any;
  setReportData: (data: any) => void;
  saveReportData: () => Promise<void>;
  isSaving: boolean;

  // Freshness
  notesSinceLastGeneration: number;
  hasBeenGenerated: boolean;
}

const GenerateReportContext = createContext<GenerateReportContextValue | null>(null);

export function useGenerateReportContext(): GenerateReportContextValue {
  const ctx = useContext(GenerateReportContext);
  if (!ctx) throw new Error('useGenerateReportContext must be used within GenerateReportProvider');
  return ctx;
}

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export interface GenerateReportProviderProps {
  reportId: string;
  projectId: string;
  children: React.ReactNode;
}

export function GenerateReportProvider({
  reportId,
  projectId,
  children,
}: GenerateReportProviderProps) {
  // ---- Tab state ----------------------------------------------------------
  const [activeTab, setActiveTab] = useState<TabKey>('notes');

  // ---- API data -----------------------------------------------------------
  const { data: report, isLoading: reportLoading } = useReport(reportId) as {
    data: any;
    isLoading: boolean;
  };
  const { data: notes, isLoading: notesLoading } = useNotes(reportId) as {
    data: Note[] | undefined;
    isLoading: boolean;
  };

  // ---- Voice pipeline -----------------------------------------------------
  const voice = useVoiceNotePipeline(reportId, projectId);

  // ---- Timeline -----------------------------------------------------------
  const timeline = useNoteTimeline(notes, voice.pendingNotes);

  // ---- Mutations ----------------------------------------------------------
  const createNoteMutation = useCreateNote();
  const deleteNoteMutation = useDeleteNote();
  const generateMutation = useGenerateReport();
  const finalizeMutation = useFinalizeReport();
  const updateMutation = useUpdateReport();

  // ---- Notes CRUD ---------------------------------------------------------
  const addTextNote = useCallback(
    async (text: string) => {
      await createNoteMutation.mutateAsync({
        reportId,
        kind: 'text',
        body: text,
      });
    },
    [createNoteMutation, reportId],
  );

  const deleteNote = useCallback(
    async (noteId: string) => {
      await deleteNoteMutation.mutateAsync({ reportId, id: noteId });
    },
    [deleteNoteMutation, reportId],
  );

  // ---- Generation ---------------------------------------------------------
  const lastGeneratedNoteCountRef = useRef<number>(0);

  const hasBeenGenerated = !!report?.reportData;

  const notesSinceLastGeneration = useMemo(() => {
    const total = (notes?.length ?? 0) + voice.pendingNotes.filter((p) => p.status !== 'saved').length;
    return Math.max(0, total - lastGeneratedNoteCountRef.current);
  }, [notes, voice.pendingNotes]);

  // Sync ref when report data arrives (means generation happened before this session)
  useMemo(() => {
    if (hasBeenGenerated && notes) {
      lastGeneratedNoteCountRef.current = notes.length;
    }
  }, [hasBeenGenerated, notes]);

  const handleGenerate = useCallback(async () => {
    await generateMutation.mutateAsync(reportId);
    lastGeneratedNoteCountRef.current = notes?.length ?? 0;
    setActiveTab('report');
  }, [generateMutation, reportId, notes]);

  const handleFinalize = useCallback(async () => {
    await finalizeMutation.mutateAsync(reportId);
  }, [finalizeMutation, reportId]);

  // ---- Report editing -----------------------------------------------------
  const [editedData, setEditedData] = useState<any>(null);
  const reportData = editedData ?? report?.reportData ?? null;

  const setReportData = useCallback((data: any) => {
    setEditedData(data);
  }, []);

  const saveReportData = useCallback(async () => {
    if (!editedData) return;
    await updateMutation.mutateAsync({ id: reportId, reportData: editedData });
    setEditedData(null);
  }, [editedData, updateMutation, reportId]);

  // ---- Context value ------------------------------------------------------
  const value = useMemo<GenerateReportContextValue>(
    () => ({
      reportId,
      projectId,
      report,
      reportLoading,
      notes,
      notesLoading,
      timeline,
      activeTab,
      setActiveTab,
      addTextNote,
      deleteNote,
      startRecording: voice.startRecording,
      stopRecording: voice.stopRecording,
      isRecording: voice.isRecording,
      amplitudes: voice.amplitudes,
      retryVoiceNote: voice.retry,
      generateReport: handleGenerate,
      isGenerating: generateMutation.isPending,
      finalizeReport: handleFinalize,
      isFinalizing: finalizeMutation.isPending,
      reportData,
      setReportData,
      saveReportData,
      isSaving: updateMutation.isPending,
      notesSinceLastGeneration,
      hasBeenGenerated,
    }),
    [
      reportId,
      projectId,
      report,
      reportLoading,
      notes,
      notesLoading,
      timeline,
      activeTab,
      addTextNote,
      deleteNote,
      voice.startRecording,
      voice.stopRecording,
      voice.isRecording,
      voice.amplitudes,
      voice.retry,
      handleGenerate,
      generateMutation.isPending,
      handleFinalize,
      finalizeMutation.isPending,
      reportData,
      setReportData,
      saveReportData,
      updateMutation.isPending,
      notesSinceLastGeneration,
      hasBeenGenerated,
    ],
  );

  return (
    <GenerateReportContext.Provider value={value}>
      {children}
    </GenerateReportContext.Provider>
  );
}
