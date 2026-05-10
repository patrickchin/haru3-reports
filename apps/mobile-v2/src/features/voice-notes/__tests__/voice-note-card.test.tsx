/**
 * Tests for VoiceNoteCard component.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, fireEvent } from "@testing-library/react-native";
import { VoiceNoteCard } from "../voice-note-card";
import * as audioModule from "@/features/audio";
import type { FileMetadata } from "@/infra/db-types";

vi.mock("@/features/audio");

describe("VoiceNoteCard", () => {
  const mockFile: FileMetadata = {
    id: "file-1",
    project_id: "proj-1",
    uploader_id: "user-1",
    file_name: "test.m4a",
    file_size: 1024,
    mime_type: "audio/m4a",
    storage_path: "/path/to/file",
    thumbnail_url: null,
    voice_title: "Test Voice Note",
    voice_transcript: "This is a test transcript.",
    voice_summary: "Summary of the test.",
    voice_duration_ms: 30000,
    created_at: "2026-05-01T00:00:00Z",
    updated_at: "2026-05-01T00:00:00Z",
    deleted_at: null,
  };

  const mockAudioPlayback = {
    trackId: null,
    isPlaying: false,
    isLoading: false,
    positionMs: 0,
    durationMs: 0,
    error: null,
    play: vi.fn(),
    pause: vi.fn(),
    resume: vi.fn(),
    seekTo: vi.fn(),
    stop: vi.fn(),
  };

  beforeEach(() => {
    vi.mocked(audioModule.useAudioPlayback).mockReturnValue(mockAudioPlayback);
  });

  it("renders title and summary when present", () => {
    const { getByText } = render(<VoiceNoteCard file={mockFile} />);

    expect(getByText("Test Voice Note")).toBeTruthy();
    expect(getByText("Summary of the test.")).toBeTruthy();
  });

  it("does not render title/summary when absent", () => {
    const fileWithoutSummary: FileMetadata = {
      ...mockFile,
      voice_title: null,
      voice_summary: null,
    };

    const { queryByText } = render(<VoiceNoteCard file={fileWithoutSummary} />);

    expect(queryByText("Test Voice Note")).toBeNull();
    expect(queryByText("Summary of the test.")).toBeNull();
  });

  it("calls audio.play when play button pressed", async () => {
    const { getByTestId } = render(<VoiceNoteCard file={mockFile} />);

    const playButton = getByTestId(`voice-notes:play-button:${mockFile.id}`);
    fireEvent.press(playButton);

    expect(mockAudioPlayback.play).toHaveBeenCalledWith({
      id: mockFile.id,
      uri: mockFile.storage_path,
      durationMs: mockFile.voice_duration_ms,
    });
  });

  it("calls audio.pause when pause button pressed", () => {
    vi.mocked(audioModule.useAudioPlayback).mockReturnValue({
      ...mockAudioPlayback,
      trackId: mockFile.id,
      isPlaying: true,
    });

    const { getByTestId } = render(<VoiceNoteCard file={mockFile} />);

    const pauseButton = getByTestId(`voice-notes:pause-button:${mockFile.id}`);
    fireEvent.press(pauseButton);

    expect(mockAudioPlayback.pause).toHaveBeenCalled();
  });

  it("opens transcript sheet when more button pressed", () => {
    const { getByTestId, getByText } = render(<VoiceNoteCard file={mockFile} />);

    const moreButton = getByTestId(`voice-notes:more-button:${mockFile.id}`);
    fireEvent.press(moreButton);

    expect(getByText("Transcript")).toBeTruthy();
    expect(getByText("This is a test transcript.")).toBeTruthy();
  });

  it("calls onDelete when delete confirmed", () => {
    const onDelete = vi.fn();
    const { getByTestId, getByText } = render(
      <VoiceNoteCard file={mockFile} onDelete={onDelete} />
    );

    // Open transcript sheet
    const moreButton = getByTestId(`voice-notes:more-button:${mockFile.id}`);
    fireEvent.press(moreButton);

    // Press delete button in transcript sheet
    const deleteButton = getByText("Delete");
    fireEvent.press(deleteButton);

    // Confirm in delete sheet
    const confirmButton = getByTestId(`voice-notes:delete-button:${mockFile.id}`);
    fireEvent.press(confirmButton);

    expect(onDelete).toHaveBeenCalled();
  });
});
