/**
 * Voice recorder wrapper using expo-audio.
 *
 * Pure state machine (no side effects except Audio I/O).
 */
import {
  RecordingPresets,
  setAudioModeAsync,
  requestRecordingPermissionsAsync,
  type RecordingOptions,
} from "expo-audio";
// Import AudioRecorder class from internal module
import AudioModule from "expo-audio/build/AudioModule";
import type { AudioRecorder as ExpoAudioRecorder } from "expo-audio/build/AudioModule.types";

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

export class VoiceRecorder {
  private recording: ExpoAudioRecorder | null = null;
  private statusInterval: NodeJS.Timeout | null = null;
  private onStatusChange: ((state: RecordingState) => void) | null = null;

  async start(onStatusChange: (state: RecordingState) => void): Promise<void> {
    this.onStatusChange = onStatusChange;

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
    if (!this.recording) {
      throw new Error("No active recording");
    }

    if (this.statusInterval) {
      clearInterval(this.statusInterval);
      this.statusInterval = null;
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
    if (!this.recording) return;

    if (this.statusInterval) {
      clearInterval(this.statusInterval);
      this.statusInterval = null;
    }

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
