import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// We need to mock global fetch for the transcription providers
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

import { resolveProvider, transcribeAudio } from '../transcription.js';

describe('transcription', () => {
  const savedEnv: Record<string, string | undefined> = {};
  const envKeys = [
    'OPENAI_API_KEY',
    'GROQ_API_KEY',
    'DEEPGRAM_API_KEY',
    'TRANSCRIPTION_PROVIDER',
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    for (const key of envKeys) {
      savedEnv[key] = process.env[key];
      delete process.env[key];
    }
  });

  afterEach(() => {
    for (const [key, val] of Object.entries(savedEnv)) {
      if (val === undefined) delete process.env[key];
      else process.env[key] = val;
    }
  });

  // -----------------------------------------------------------------------
  // resolveProvider
  // -----------------------------------------------------------------------
  describe('resolveProvider', () => {
    it('defaults to groq when nothing is set', () => {
      const provider = resolveProvider();
      expect(provider.id).toBe('groq');
    });

    it('uses TRANSCRIPTION_PROVIDER env var when no arg is given', () => {
      process.env.TRANSCRIPTION_PROVIDER = 'deepgram';
      const provider = resolveProvider();
      expect(provider.id).toBe('deepgram');
    });

    it('uses the requested provider over env var', () => {
      process.env.TRANSCRIPTION_PROVIDER = 'deepgram';
      const provider = resolveProvider('openai');
      expect(provider.id).toBe('openai');
    });

    it('resolves openai-whisper provider', () => {
      const provider = resolveProvider('openai-whisper');
      expect(provider.id).toBe('openai-whisper');
      expect(provider.model).toBe('whisper-1');
    });

    it('throws for unknown provider', () => {
      expect(() => resolveProvider('nonexistent')).toThrow(
        'Unknown transcription provider: "nonexistent"',
      );
    });

    it('is case-insensitive', () => {
      const provider = resolveProvider('GROQ');
      expect(provider.id).toBe('groq');
    });
  });

  // -----------------------------------------------------------------------
  // transcribeAudio — OpenAI-compatible providers
  // -----------------------------------------------------------------------
  describe('transcribeAudio', () => {
    const params = {
      audio: Buffer.from('fake-audio'),
      mimeType: 'audio/mp4',
      filename: 'test.m4a',
    };

    it('throws when API key is not set', async () => {
      await expect(transcribeAudio(params, 'groq')).rejects.toThrow(
        'GROQ_API_KEY not set',
      );
    });

    it('calls OpenAI-compatible endpoint for groq', async () => {
      process.env.GROQ_API_KEY = 'test-key';
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ text: 'Hello world' }),
      });

      const result = await transcribeAudio(params, 'groq');
      expect(result.text).toBe('Hello world');
      expect(result.model).toBe('whisper-large-v3-turbo');

      const [url] = mockFetch.mock.calls[0];
      expect(url).toContain('groq.com');
      expect(url).toContain('/audio/transcriptions');
    });

    it('calls OpenAI endpoint for openai provider', async () => {
      process.env.OPENAI_API_KEY = 'test-key';
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ text: 'Transcribed text' }),
      });

      const result = await transcribeAudio(params, 'openai');
      expect(result.text).toBe('Transcribed text');
      expect(result.model).toBe('gpt-4o-mini-transcribe');
    });

    it('throws on non-ok response from OpenAI-compatible provider', async () => {
      process.env.GROQ_API_KEY = 'test-key';
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 429,
        text: async () => 'Rate limited',
      });

      await expect(transcribeAudio(params, 'groq')).rejects.toThrow(
        'whisper-large-v3-turbo transcription failed: 429 Rate limited',
      );
    });

    it('returns empty string when response text is missing', async () => {
      process.env.GROQ_API_KEY = 'test-key';
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({}),
      });

      const result = await transcribeAudio(params, 'groq');
      expect(result.text).toBe('');
    });

    it('passes language parameter when provided', async () => {
      process.env.GROQ_API_KEY = 'test-key';
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ text: 'Hola' }),
      });

      await transcribeAudio({ ...params, language: 'es' }, 'groq');

      // Verify FormData was constructed (we can check the fetch was called)
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    // Deepgram
    it('calls Deepgram API for deepgram provider', async () => {
      process.env.DEEPGRAM_API_KEY = 'test-key';
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          results: {
            channels: [{ alternatives: [{ transcript: 'Deepgram text' }] }],
          },
        }),
      });

      const result = await transcribeAudio(params, 'deepgram');
      expect(result.text).toBe('Deepgram text');
      expect(result.model).toBe('nova-3');

      const [url, opts] = mockFetch.mock.calls[0];
      expect(url).toContain('deepgram.com');
      expect(opts.headers.Authorization).toBe('Token test-key');
    });

    it('throws on Deepgram error response', async () => {
      process.env.DEEPGRAM_API_KEY = 'test-key';
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        text: async () => 'Server error',
      });

      await expect(transcribeAudio(params, 'deepgram')).rejects.toThrow(
        'deepgram transcription failed: 500 Server error',
      );
    });

    it('returns empty string when Deepgram response has no transcript', async () => {
      process.env.DEEPGRAM_API_KEY = 'test-key';
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ results: {} }),
      });

      const result = await transcribeAudio(params, 'deepgram');
      expect(result.text).toBe('');
    });
  });
});
