import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const getSessionMock = vi.fn();

vi.mock("./backend", () => ({
  backend: {
    auth: {
      getSession: (...args: unknown[]) => getSessionMock(...args),
    },
  },
}));

const ORIGINAL_FETCH = globalThis.fetch;
const ORIGINAL_SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL;

beforeEach(() => {
  process.env.EXPO_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
  getSessionMock.mockReset();
  vi.resetModules();
});

afterEach(() => {
  globalThis.fetch = ORIGINAL_FETCH;
  if (ORIGINAL_SUPABASE_URL === undefined) {
    delete process.env.EXPO_PUBLIC_SUPABASE_URL;
  } else {
    process.env.EXPO_PUBLIC_SUPABASE_URL = ORIGINAL_SUPABASE_URL;
  }
});

function mockFetchOk(body: unknown) {
  const fetchMock = vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    text: async () => JSON.stringify(body),
  });
  globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;
  return fetchMock;
}

function mockFetchError(status: number, body: unknown) {
  const text = typeof body === "string" ? body : JSON.stringify(body);
  const fetchMock = vi.fn().mockResolvedValue({
    ok: false,
    status,
    text: async () => text,
  });
  globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;
  return fetchMock;
}

function mockSession(token = "test-token") {
  getSessionMock.mockResolvedValue({
    data: { session: { access_token: token } },
  });
}

describe("transcribeAudio", () => {
  it("throws when no auth session is present", async () => {
    getSessionMock.mockResolvedValue({ data: { session: null } });
    const { transcribeAudio } = await import("./transcribe");
    await expect(transcribeAudio("file:///tmp/x.m4a")).rejects.toThrow(
      /not authenticated/i,
    );
  });

  it("posts to the transcribe-audio function with the bearer token", async () => {
    mockSession("abc123");
    const fetchMock = mockFetchOk({
      text: "hi",
      provider: "groq",
      model: "whisper",
      durationMs: 100,
    });
    const { transcribeAudio } = await import("./transcribe");
    const res = await transcribeAudio("file:///tmp/voice.m4a");
    expect(res.text).toBe("hi");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://example.supabase.co/functions/v1/transcribe-audio");
    expect(init.method).toBe("POST");
    const headers = init.headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer abc123");
    expect(init.body).toBeInstanceOf(FormData);
  });

  it("includes provider override in form data when supplied", async () => {
    mockSession();
    const fetchMock = mockFetchOk({
      text: "x",
      provider: "openai",
      model: "whisper-1",
      durationMs: 1,
    });
    const { transcribeAudio } = await import("./transcribe");
    await transcribeAudio("file:///tmp/x.m4a", { provider: "openai", language: "en" });
    const init = fetchMock.mock.calls[0]![1] as RequestInit;
    const fd = init.body as FormData;
    expect(fd.get("provider")).toBe("openai");
    expect(fd.get("language")).toBe("en");
  });

  it("does not append provider/language when not supplied", async () => {
    mockSession();
    const fetchMock = mockFetchOk({
      text: "x",
      provider: "groq",
      model: "whisper",
      durationMs: 1,
    });
    const { transcribeAudio } = await import("./transcribe");
    await transcribeAudio("file:///tmp/x.m4a");
    const init = fetchMock.mock.calls[0]![1] as RequestInit;
    const fd = init.body as FormData;
    expect(fd.get("provider")).toBeNull();
    expect(fd.get("language")).toBeNull();
  });

  it("parses { error } JSON in non-OK responses", async () => {
    mockSession();
    mockFetchError(503, { error: "provider down" });
    const { transcribeAudio } = await import("./transcribe");
    await expect(transcribeAudio("file:///tmp/x.m4a")).rejects.toThrow(
      /Transcription failed \(503\): provider down/,
    );
  });

  it("falls back to raw text body on non-JSON error", async () => {
    mockSession();
    mockFetchError(500, "internal boom");
    const { transcribeAudio } = await import("./transcribe");
    await expect(transcribeAudio("file:///tmp/x.m4a")).rejects.toThrow(
      /Transcription failed \(500\): internal boom/,
    );
  });

  it("guesses MIME type from file extension and uses trailing path as filename", async () => {
    mockSession();
    const cases: Array<[string, string, string]> = [
      ["file:///tmp/voice.m4a", "audio/m4a", "voice.m4a"],
      ["file:///tmp/clip.MP4", "audio/mp4", "clip.MP4"],
      ["file:///tmp/test.wav", "audio/wav", "test.wav"],
      ["file:///tmp/song.mp3", "audio/mpeg", "song.mp3"],
      ["file:///tmp/record.webm", "audio/webm", "record.webm"],
      ["file:///tmp/audio.ogg", "audio/ogg", "audio.ogg"],
      ["file:///tmp/voice.opus", "audio/ogg", "voice.opus"],
      ["file:///tmp/voice.caf", "audio/x-caf", "voice.caf"],
      ["file:///tmp/x.unknown", "audio/m4a", "x.unknown"],
      ["", "audio/m4a", "audio.m4a"],
    ];

    // Spy on FormData.prototype.append to capture the descriptor object.
    const captured: Array<{ key: string; value: unknown }> = [];
    const appendSpy = vi
      .spyOn(FormData.prototype, "append")
      .mockImplementation(function (this: FormData, key: string, value: unknown) {
        captured.push({ key, value });
      });

    try {
      for (const [uri, expectedMime, expectedName] of cases) {
        captured.length = 0;
        mockFetchOk({
          text: "ok",
          provider: "groq",
          model: "whisper",
          durationMs: 1,
        });
        const { transcribeAudio } = await import("./transcribe");
        await transcribeAudio(uri);
        const audio = captured.find((c) => c.key === "audio")?.value as {
          uri: string;
          name: string;
          type: string;
        };
        expect(audio.uri, `uri for ${uri}`).toBe(uri);
        expect(audio.type, `mime for ${uri}`).toBe(expectedMime);
        expect(audio.name, `name for ${uri}`).toBe(expectedName);
      }
    } finally {
      appendSpy.mockRestore();
    }
  });
});
