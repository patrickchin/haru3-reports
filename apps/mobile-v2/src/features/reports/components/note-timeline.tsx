/**
 * Notes timeline — list of notes with add-note input at bottom.
 *
 * Supports text notes, voice notes, file attachments, and pending uploads.
 */
import { useState, useRef, useCallback } from "react";
import { View, Text, TextInput, ScrollView, Linking } from "react-native";
import { useRouter, useFocusEffect } from "expo-router";
import { Paperclip, Camera as CameraIcon } from "lucide-react-native";
import { Button } from "@/shared/components/Button";
import { Sheet } from "@/shared/components/Sheet";
import { EmptyState } from "@/shared/components/EmptyState";
import { ImageLightbox } from "@/shared/components/ImageLightbox";
import { testIds } from "@/infra/test-ids";
import {
  createCameraSession,
  consumeCameraSession,
} from "@/infra/camera-session-registry";
import { useReportNotes } from "../queries";
import { useAddTextNote, useSoftDeleteNote } from "../mutations";
import { NoteRow } from "./note-row";
import { RecordButton, useVoicePipeline } from "@/features/voice-notes";
import { useAuth } from "@/features/auth";
import {
  getUploadQueue,
  useProjectUploadJobs,
  PendingRow,
  FileCard,
  pickPhotos,
  pickDocuments,
  useSignedUrl,
  type EnqueueInput,
} from "@/features/uploads";
import type { ReportNoteWithFile } from "../queries";
import type { FileMetadata } from "@/infra/db-types";

type NoteTimelineProps = {
  reportId: string;
  projectId: string;
};

export function NoteTimeline({ reportId, projectId }: NoteTimelineProps) {
  const router = useRouter();
  const { data: notes, isLoading } = useReportNotes(reportId);
  const addTextNote = useAddTextNote();
  const deleteNote = useSoftDeleteNote();
  const voicePipeline = useVoicePipeline();
  const { user } = useAuth();
  const uploadJobs = useProjectUploadJobs(projectId);

  const [noteText, setNoteText] = useState("");
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [showVoiceRecorder, setShowVoiceRecorder] = useState(false);
  const [showAttachmentSheet, setShowAttachmentSheet] = useState(false);
  const [previewImage, setPreviewImage] = useState<string | null>(null);

  const cameraSessionIdRef = useRef<string | null>(null);

  const handleAddNote = async () => {
    if (!noteText.trim()) return;
    await addTextNote.mutateAsync({
      reportId,
      projectId,
      noteText: noteText.trim(),
    });
    setNoteText("");
  };

  const handleDeleteNote = async (noteId: string) => {
    await deleteNote.mutateAsync({ noteId, reportId });
    setDeleteConfirm(null);
  };

  const handleRecordingComplete = async (result: { uri: string; durationMs: number }) => {
    if (!user) return;
    setShowVoiceRecorder(false);
    try {
      await voicePipeline.mutateAsync({
        audioUri: result.uri,
        durationMs: result.durationMs,
        projectId,
        reportId,
        uploaderId: user.id,
      });
    } catch (err) {
      // Error handling via voicePipeline.error
    }
  };

  const handlePickPhotos = async () => {
    setShowAttachmentSheet(false);
    if (!user) return;
    try {
      const files = await pickPhotos();
      for (const file of files) {
        const input: EnqueueInput = {
          kind: "photo",
          sourceUri: file.uri,
          filename: file.filename,
          mimeType: file.mimeType,
          sizeBytes: file.fileSize,
          projectId,
          reportId,
          uploadedBy: user.id,
          isImage: true,
          width: file.width,
          height: file.height,
        };
        getUploadQueue().enqueueUpload(input);
      }
    } catch (err) {
      console.error("Photo picker error:", err);
    }
  };

  const handlePickDocuments = async () => {
    setShowAttachmentSheet(false);
    if (!user) return;
    try {
      const files = await pickDocuments();
      for (const file of files) {
        const input: EnqueueInput = {
          kind: "document",
          sourceUri: file.uri,
          filename: file.filename,
          mimeType: file.mimeType,
          sizeBytes: file.fileSize,
          projectId,
          reportId,
          uploadedBy: user.id,
          isImage: false,
        };
        getUploadQueue().enqueueUpload(input);
      }
    } catch (err) {
      console.error("Document picker error:", err);
    }
  };

  const handleCameraCapture = useCallback(() => {
    if (!projectId || !reportId) return;
    setShowAttachmentSheet(false);
    const sessionId = createCameraSession({
      returnTo: `/projects/${projectId}/reports/${reportId}`,
      context: { projectId, reportId },
    });
    cameraSessionIdRef.current = sessionId;
    router.push({
      pathname: "/(camera)/capture",
      params: { sessionId },
    });
  }, [projectId, reportId, router]);

  const enqueueCapturedPhoto = useCallback(
    async (uri: string) => {
      if (!projectId || !reportId || !user) return;
      try {
        const input: EnqueueInput = {
          kind: "photo",
          sourceUri: uri,
          filename: `photo-${Date.now()}.jpg`,
          mimeType: "image/jpeg",
          sizeBytes: 0, // Will be determined during preprocessing
          projectId,
          reportId,
          uploadedBy: user.id,
          isImage: true,
        };
        getUploadQueue().enqueueUpload(input);
      } catch (err) {
        console.error("Could not enqueue captured photo:", err);
      }
    },
    [projectId, reportId, user],
  );

  // Drain the camera-session registry whenever this screen regains focus
  useFocusEffect(
    useCallback(() => {
      const id = cameraSessionIdRef.current;
      if (!id) return;
      cameraSessionIdRef.current = null;
      const uris = consumeCameraSession(id);
      if (!uris || uris.length === 0) return;
      void (async () => {
        for (const uri of uris) {
          await enqueueCapturedPhoto(uri);
        }
      })();
    }, [enqueueCapturedPhoto]),
  );

  const handleOpenFile = (file: FileMetadata) => {
    if (file.mime_type.startsWith("image/")) {
      // Image files open in lightbox
      setPreviewImage(file.storage_path || null);
    } else {
      // Documents open externally (requires signed URL)
      // For now, just log - Wave M will add signed URL fetch for external opening
      console.log("Open document:", file.id);
    }
  };

  // Filter pending uploads for this report
  const pendingUploads = uploadJobs.filter(
    (job) =>
      job.input.reportId === reportId &&
      (job.state === "pending" ||
        job.state === "preprocessing" ||
        job.state === "uploading" ||
        job.state === "failed"),
  );

  // Extract completed image/document files from notes
  const completedFiles =
    notes
      ?.filter((note) => note.file && note.kind !== "voice")
      .map((note) => note.file!)
      .filter((file) => !file.deleted_at) ?? [];

  if (isLoading) {
    return (
      <View className="flex-1 items-center justify-center">
        <Text className="text-gray-500">Loading notes...</Text>
      </View>
    );
  }

  return (
    <View className="flex-1" testID={testIds.notes.timeline}>
      <ScrollView className="flex-1 p-4" contentContainerClassName="pb-4 gap-3">
        {/* Pending uploads */}
        {pendingUploads.map((job) => (
          <PendingRow key={job.id} jobId={job.id} />
        ))}

        {/* Completed files */}
        {completedFiles.map((file) => (
          <FileCard
            key={file.id}
            fileId={file.id}
            filename={file.file_name}
            mimeType={file.mime_type}
            storagePath={file.storage_path}
            sizeBytes={file.file_size}
            onPress={() => handleOpenFile(file)}
          />
        ))}

        {/* Notes */}
        {notes && notes.length > 0 ? (
          <View testID={testIds.voiceNotes.list}>
            {notes.map((note) => (
              <NoteRow
                key={note.id}
                note={note}
                file={note.file ?? undefined}
                reportId={reportId}
                onDelete={(id) => setDeleteConfirm(id)}
              />
            ))}
          </View>
        ) : !pendingUploads.length && !completedFiles.length ? (
          <EmptyState title="No notes yet" message="Add your first note below." />
        ) : null}
      </ScrollView>

      {/* Add note input */}
      <View className="p-4 border-t border-gray-200 bg-white">
        <TextInput
          className="rounded-md border border-gray-300 bg-white px-3 py-2 text-base text-gray-900 mb-3"
          value={noteText}
          onChangeText={setNoteText}
          placeholder="Add a note..."
          multiline
          numberOfLines={3}
          testID={testIds.notes.addNoteInput}
        />
        <View className="flex-row gap-3">
          <View className="flex-1">
            <Button
              variant="primary"
              onPress={handleAddNote}
              disabled={!noteText.trim() || addTextNote.isPending}
              loading={addTextNote.isPending}
              testID={testIds.notes.addNoteButton}
            >
              <Text className="text-white font-medium">Add Note</Text>
            </Button>
          </View>
          <Button
            variant="secondary"
            onPress={() => setShowAttachmentSheet(true)}
            testID={testIds.notes.attachmentButton}
          >
            <Paperclip size={20} color="#666" />
          </Button>
          <Button
            variant="secondary"
            onPress={() => setShowVoiceRecorder(true)}
            testID={testIds.notes.addVoiceButton}
          >
            <Text className="font-medium">🎤</Text>
          </Button>
        </View>
      </View>

      {/* Attachment sheet */}
      <Sheet visible={showAttachmentSheet} onClose={() => setShowAttachmentSheet(false)}>
        <Sheet.Title>Add attachment</Sheet.Title>
        <Sheet.Body>
          <View className="gap-3">
            <Button variant="secondary" onPress={handleCameraCapture}>
              <CameraIcon size={20} color="#666" />
              <Text className="font-medium ml-2">Camera</Text>
            </Button>
            <Button variant="secondary" onPress={handlePickPhotos}>
              <Text className="font-medium">Photo Library</Text>
            </Button>
            <Button variant="secondary" onPress={handlePickDocuments}>
              <Text className="font-medium">Document</Text>
            </Button>
          </View>
        </Sheet.Body>
        <Sheet.Actions>
          <Button variant="ghost" onPress={() => setShowAttachmentSheet(false)}>
            <Text>Cancel</Text>
          </Button>
        </Sheet.Actions>
      </Sheet>

      {/* Voice recorder sheet */}
      <Sheet visible={showVoiceRecorder} onClose={() => setShowVoiceRecorder(false)}>
        <Sheet.Title>Record Voice Note</Sheet.Title>
        <Sheet.Body>
          <View className="items-center py-8">
            <RecordButton
              onRecordingComplete={handleRecordingComplete}
              onError={(err) => console.error("Recording error:", err)}
            />
            {voicePipeline.isPending && (
              <Text className="text-sm text-muted mt-4">Processing voice note...</Text>
            )}
            {voicePipeline.error && (
              <Text className="text-sm text-destructive mt-4">
                {voicePipeline.error.message}
              </Text>
            )}
          </View>
        </Sheet.Body>
        <Sheet.Actions>
          <Button variant="ghost" onPress={() => setShowVoiceRecorder(false)}>
            <Text>Cancel</Text>
          </Button>
        </Sheet.Actions>
      </Sheet>

      {/* Delete confirmation sheet */}
      <Sheet visible={!!deleteConfirm} onClose={() => setDeleteConfirm(null)}>
        <Sheet.Title>Delete Note</Sheet.Title>
        <Sheet.Body>
          <Text className="text-gray-700">Are you sure you want to delete this note?</Text>
        </Sheet.Body>
        <Sheet.Actions>
          <Button variant="ghost" onPress={() => setDeleteConfirm(null)}>
            <Text className="text-gray-700">Cancel</Text>
          </Button>
          <Button
            variant="destructive"
            onPress={() => deleteConfirm && handleDeleteNote(deleteConfirm)}
            loading={deleteNote.isPending}
          >
            <Text className="text-white">Delete</Text>
          </Button>
        </Sheet.Actions>
      </Sheet>

      {/* Image preview */}
      <ImageLightboxWithSignedUrl
        visible={!!previewImage}
        storagePath={previewImage}
        onClose={() => setPreviewImage(null)}
      />
    </View>
  );
}

// Helper component to fetch signed URL for image preview
function ImageLightboxWithSignedUrl({
  visible,
  storagePath,
  onClose,
}: {
  visible: boolean;
  storagePath: string | null;
  onClose: () => void;
}) {
  const { data: signedUrl } = useSignedUrl(storagePath);
  return <ImageLightbox visible={visible} imageUri={signedUrl || null} onClose={onClose} />;
}

