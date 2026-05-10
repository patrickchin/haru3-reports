/**
 * Voice recorder wrapper using expo-audio.
 *
 * Pure state machine (no side effects except Audio I/O).
 * TODO(audio-port): Migrate from expo-av to expo-audio AudioRecorder API
 */
// import { Audio, type RecordingOptions } from "expo-av";

// Temporary stubs until audio migration
const Audio: any = {
  AndroidOutputFormat: { MPEG_4: 0 },
  AndroidAudioEncoder: { AAC: 0 },
  IOSOutputFormat: { MPEG4AAC: 0 },
  IOSAudioQuality: { HIGH: 0 },
  INTERRUPTION_MODE_IOS_DO_NOT_MIX: 1,
  INTERRUPTION_MODE_ANDROID_DO_NOT_MIX: 1,
  requestPermissionsAsync: async () => ({ status: { granted: true } }),
  setAudioModeAsync: async () => {},
  Recording: class {
    async prepareToRecordAsync(_opts: any) {}
    async startAsync() {}
    async pauseAsync() {}
    async stopAndUnloadAsync() {}
    getURI() { return ""; }
    async getStatusAsync() {
      return { durationMillis: 0, isRecording: false, metering: -160 };
    }
    async resumeAsync() {}
  },
};
type RecordingOptions = any;

export type RecordingState = {
  isRecording: boolean;
  isPaused: boolean;
  durationMs: number;
  meteringLevel: number; // -160 to 0 dB
};

const RECORDING_OPTIONS: RecordingOptions = {
  isMeteringEnabled: true,
  android: {
    extension: ".m4a",
    outputFormat: Audio.AndroidOutputFormat.MPEG_4,
    audioEncoder: Audio.AndroidAudioEncoder.AAC,
    sampleRate: 44100,
    numberOfChannels: 2,
    bitRate: 128000,
  },
  ios: {
    extension: ".m4a",
    outputFormat: Audio.IOSOutputFormat.MPEG4AAC,
    audioQuality: Audio.IOSAudioQuality.HIGH,
    sampleRate: 44100,
    numberOfChannels: 2,
    bitRate: 128000,
    linearPCMBitDepth: 16,
    linearPCMIsBigEndian: false,
    linearPCMIsFloat: false,
  },
  web: {
    mimeType: "audio/webm",
    bitsPerSecond: 128000,
  },
};

const RECORDING_AUDIO_MODE = {
  allowsRecordingIOS: true,
  playsInSilentModeIOS: true,
  shouldDuckAndroid: true,
  interruptionModeIOS: Audio.INTERRUPTION_MODE_IOS_DO_NOT_MIX,
  interruptionModeAndroid: Audio.INTERRUPTION_MODE_ANDROID_DO_NOT_MIX,
};

export class VoiceRecorder {
  // @ts-expect-error: Temporary Audio stub until expo-av → expo-audio migration
  private recording: Audio.Recording | null = null;
  private statusInterval: NodeJS.Timeout | null = null;
  private onStatusChange: ((state: RecordingState) => void) | null = null;

  async start(onStatusChange: (state: RecordingState) => void): Promise<void> {
    this.onStatusChange = onStatusChange;

    const { status } = await Audio.requestPermissionsAsync();
    if (!status.granted) {
      throw new Error("Microphone permission not granted");
    }

    await Audio.setAudioModeAsync(RECORDING_AUDIO_MODE);

    this.recording = new Audio.Recording();
    await this.recording.prepareToRecordAsync(RECORDING_OPTIONS);
    await this.recording.startAsync();

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

    await this.recording.stopAndUnloadAsync();
    const uri = this.recording.getURI();
    const status = await this.recording.getStatusAsync();
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
      await this.recording.stopAndUnloadAsync();
    } catch {
      // Ignore teardown errors
    }

    this.recording = null;
    this.onStatusChange = null;
  }

  private async updateStatus(): Promise<void> {
    if (!this.recording || !this.onStatusChange) return;

    try {
      const status = await this.recording.getStatusAsync();
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
