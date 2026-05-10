import { vi } from 'vitest';

/**
 * Mock AI provider for testing. Replaces the real AI provider factory
 * and LLM invocation modules so routes can be tested without API keys.
 *
 * Usage in test files:
 *   import { mockAI } from '../test-utils/mock-ai.js';
 *   vi.mock('../lib/ai-providers.js', () => mockAI.providers);
 *   vi.mock('../lib/llm.js', () => mockAI.llm);
 *   vi.mock('../lib/transcription.js', () => mockAI.transcription);
 */

export const mockGenerateText = vi.fn().mockResolvedValue({
  text: JSON.stringify({
    reportTitle: 'Mock Report',
    sections: [{ heading: 'Summary', content: 'Mock content' }],
  }),
  usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
});

export const mockTranscribe = vi.fn().mockResolvedValue({
  text: 'This is a mock transcription of the audio file.',
});

export const mockSummarize = vi.fn().mockResolvedValue({
  text: JSON.stringify({
    title: 'Mock Voice Note',
    summary: 'This is a mock summary of the voice note.',
  }),
  usage: { promptTokens: 50, completionTokens: 25, totalTokens: 75 },
});

export const mockAI = {
  providers: {
    getProvider: vi.fn().mockReturnValue({
      name: 'mock',
      generateText: mockGenerateText,
    }),
    listProviders: vi.fn().mockReturnValue([
      { name: 'openai', models: ['gpt-4o', 'gpt-4o-mini'] },
      { name: 'anthropic', models: ['claude-sonnet-4-20250514'] },
    ]),
  },
  llm: {
    invokeLLM: mockGenerateText,
    recordTokenUsage: vi.fn().mockResolvedValue(undefined),
  },
  transcription: {
    transcribeAudio: mockTranscribe,
  },
};
