import { useState, useCallback } from "react";
import {
  ExpoSpeechRecognitionModule,
  useSpeechRecognitionEvent,
} from "expo-speech-recognition";

interface UseSpeechToTextOptions {
  onResult: (transcript: string) => void;
}

interface UseSpeechToTextResult {
  isRecording: boolean;
  interimTranscript: string;
  error: string | null;
  start: () => Promise<void>;
  stop: () => void;
}

export function useSpeechToText({ onResult }: UseSpeechToTextOptions): UseSpeechToTextResult {
  const [isRecording, setIsRecording] = useState(false);
  const [interimTranscript, setInterimTranscript] = useState("");
  const [error, setError] = useState<string | null>(null);

  useSpeechRecognitionEvent("start", () => {
    setIsRecording(true);
    setInterimTranscript("");
    setError(null);
  });

  useSpeechRecognitionEvent("result", (event) => {
    const transcript = event.results[0]?.transcript ?? "";
    if (event.isFinal) {
      setInterimTranscript("");
      setIsRecording(false);
      if (transcript.trim()) {
        onResult(transcript.trim());
      }
    } else {
      setInterimTranscript(transcript);
    }
  });

  useSpeechRecognitionEvent("error", (event) => {
    const message = event.message ?? "Speech recognition failed";
    // "aborted" fires when the user manually stops — not a real error
    if (event.error !== "aborted") {
      setError(message);
    }
    setIsRecording(false);
    setInterimTranscript("");
  });

  useSpeechRecognitionEvent("end", () => {
    setIsRecording(false);
    setInterimTranscript("");
  });

  const start = useCallback(async () => {
    setError(null);
    const { granted } = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
    if (!granted) {
      setError("Microphone permission denied");
      return;
    }
    ExpoSpeechRecognitionModule.start({
      lang: "en-US",
      interimResults: true,
      continuous: false,
    });
  }, []);

  const stop = useCallback(() => {
    ExpoSpeechRecognitionModule.stop();
  }, []);

  return { isRecording, interimTranscript, error, start, stop };
}
