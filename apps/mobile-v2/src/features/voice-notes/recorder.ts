/**
 * Voice recorder wrapper using expo-audio.
 *
 * Pure state machine (no side effects except Audio I/O).
 * 
 * In E2E mock mode (EXPO_PUBLIC_E2E_MOCK_VOICE_NOTE=true), writes a tiny
 * placeholder file instead of recording from mic. The transcript is still
 * mocked server-side via USE_FIXTURES.
 */
import {
  RecordingPresets,
  setAudioModeAsync,
  requestRecordingPermissionsAsync,
  type RecordingOptions,
} from "expo-audio";
import * as FileSystem from "expo-file-system/legacy";
// Import AudioRecorder class from internal module
import AudioModule from "expo-audio/build/AudioModule";
import type { AudioRecorder as ExpoAudioRecorder } from "expo-audio/build/AudioModule.types";
import { E2E_MOCK_VOICE_NOTE } from "@/infra/env";

export type RecordingState = {
  isRecording: boolean;
  isPaused: boolean;
  durationMs: number;
  meteringLevel: number; // -160 to 0 dB
};

const RECORDING_OPTIONS: RecordingOptions = {
  ...RecordingPresets.HIGH_QUALITY,
  extension: ".m4a",
};

const RECORDING_AUDIO_MODE = {
  playsInSilentMode: true,
  allowsRecording: true,
  interruptionMode: "doNotMix" as const,
};

// Tiny placeholder audio file for E2E testing (4 bytes of MPEG-4 header)
const E2E_MOCK_AUDIO_BASE64 = "AAAA";

export class VoiceRecorder {
  private recording: ExpoAudioRecorder | null = null;
  private statusInterval: NodeJS.Timeout | null = null;
  private onStatusChange: ((state: RecordingState) => void) | null = null;
  private isE2EMock = false;
  private mockStartTime = 0;

  async start(onStatusChange: (state: RecordingState) => void): Promise<void> {
    this.onStatusChange = onStatusChange;

    // E2E mock mode: skip actual recorder, just simulate state
    if (E2E_MOCK_VOICE_NOTE) {
      this.isE2EMock = true;
      this.mockStartTime = Date.now();
      
      // Update status every 100ms to simulate recording
      this.statusInterval = setInterval(() => {
        const durationMs = Date.now() - this.mockStartTime;
        onStatusChange({
          isRecording: true,
          isPaused: false,
          durationMs,
          meteringLevel: -30 + Math.random() * 10, // Simulate some level variation
        });
      }, 100);

      onStatusChange({
        isRecording: true,
        isPaused: false,
        durationMs: 0,
        meteringLevel: -30,
      });
      return;
    }

    const { granted } = await requestRecordingPermissionsAsync();
    if (!granted) {
      throw new Error("Microphone permission not granted");
    }

    await setAudioModeAsync(RECORDING_AUDIO_MODE);

    // Create recorder using AudioModule
    this.recording = new AudioModule.AudioRecorder(RECORDING_OPTIONS);
    await this.recording.prepareToRecordAsync();
    this.recording.record();

    // Poll status every 100ms for level meter and duration
    this.statusInterval = setInterval(() => {
      void this.updateStatus();
    }, 100);

    this.updateStatus();
  }

  async stop(): Promise<{ uri: string; durationMs: number }> {
    if (this.statusInterval) {
      clearInterval(this.statusInterval);
      this.statusInterval = null;
    }

    // E2E mock mode: write placeholder file
    if (this.isE2EMock) {
      const durationMs = Date.now() - this.mockStartTime;
      const baseDirectory = FileSystem.cacheDirectory ?? FileSystem.documentDirectory;
      if (!baseDirectory) {
        throw new Error("No writable directory available for mock voice notes");
      }

      const uri = `${baseDirectory}e2e-voice-note-${Date.now()}.m4a`;
      await FileSystem.writeAsStringAsync(uri, E2E_MOCK_AUDIO_BASE64, {
        encoding: FileSystem.EncodingType.Base64,
      });

      this.isE2EMock = false;
      this.onStatusChange = null;
      return { uri, durationMs };
    }

    if (!this.recording) {
      throw new Error("No active recording");
    }

    await this.recording.stop();
    const uri = this.recording.uri;
    const status = this.recording.getStatus();
    this.recording = null;
    this.onStatusChange = null;

    if (!uri) {
      throw new Error("Recording URI not available");
    }

    return { uri, durationMs: status.durationMillis };
  }

  async cancel(): Promise<void> {
    if (this.statusInterval) {
      clearInterval(this.statusInterval);
      this.statusInterval = null;
    }

    // E2E mock mode: just reset state
    if (this.isE2EMock) {
      this.isE2EMock = false;
      this.onStatusChange = null;
      return;
    }

    if (!this.recording) return;

    try {
      await this.recording.stop();
    } catch {
      // Ignore teardown errors
    }

    this.recording = null;
    this.onStatusChange = null;
  }

  private async updateStatus(): Promise<void> {
    if (!this.recording || !this.onStatusChange) return;

    try {
      const status = this.recording.getStatus();
      if (!status.isRecording) return;

      this.onStatusChange({
        isRecording: true,
        isPaused: false,
        durationMs: status.durationMillis,
        meteringLevel: status.metering ?? -160,
      });
    } catch {
      // Ignore status poll errors
    }
  }
}
