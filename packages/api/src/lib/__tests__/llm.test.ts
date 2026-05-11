import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock external dependencies
vi.mock('ai', () => ({
  generateText: vi.fn(),
}));
vi.mock('../../db/instance.js', () => ({
  getDb: vi.fn(),
}));

import { generateText } from 'ai';
import { getDb } from '../../db/instance.js';
import { invokeTextModel } from '../llm.js';

const mockGenerateText = vi.mocked(generateText);
const mockGetDb = vi.mocked(getDb);

describe('llm', () => {
  const baseParams = {
    model: { id: 'test' } as unknown,
    modelId: 'gpt-4o-mini',
    provider: 'openai',
    system: 'You are a helpful assistant.',
    prompt: 'Hello',
    temperature: 0.7,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    // Suppress console.log / console.error in tests
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns text and normalized usage from generateText', async () => {
    mockGenerateText.mockResolvedValue({
      text: 'Hello world',
      usage: { inputTokens: 10, outputTokens: 5, cachedTokens: 2 },
      finishReason: 'stop',
    } as never);

    const result = await invokeTextModel(baseParams);

    expect(result.text).toBe('Hello world');
    expect(result.usage).toEqual({
      inputTokens: 10,
      outputTokens: 5,
      cachedTokens: 2,
    });
    expect(result.provider).toBe('openai');
    expect(result.model).toBe('gpt-4o-mini');
  });

  it('returns null usage when generateText returns no usage', async () => {
    mockGenerateText.mockResolvedValue({
      text: 'Hi',
      usage: null,
      finishReason: 'stop',
    } as never);

    const result = await invokeTextModel(baseParams);
    expect(result.usage).toBeNull();
  });

  it('normalizes non-numeric usage fields to 0', async () => {
    mockGenerateText.mockResolvedValue({
      text: 'Hi',
      usage: { inputTokens: 'bad', outputTokens: undefined, cachedTokens: null },
      finishReason: 'stop',
    } as never);

    const result = await invokeTextModel(baseParams);
    expect(result.usage).toEqual({
      inputTokens: 0,
      outputTokens: 0,
      cachedTokens: 0,
    });
  });

  it('records usage to DB when usageContext is provided', async () => {
    const mockInsert = vi.fn().mockReturnValue({
      values: vi.fn().mockResolvedValue(undefined),
    });
    mockGetDb.mockReturnValue({ insert: mockInsert } as never);

    mockGenerateText.mockResolvedValue({
      text: 'result',
      usage: { inputTokens: 100, outputTokens: 50, cachedTokens: 10 },
      finishReason: 'stop',
    } as never);

    await invokeTextModel({
      ...baseParams,
      usageContext: {
        userId: 'user-1',
        projectId: 'proj-1',
        reportId: 'report-1',
      },
    });

    expect(mockInsert).toHaveBeenCalled();
  });

  it('skips recording usage when userId is null', async () => {
    mockGenerateText.mockResolvedValue({
      text: 'result',
      usage: { inputTokens: 10, outputTokens: 5, cachedTokens: 0 },
      finishReason: 'stop',
    } as never);

    await invokeTextModel({
      ...baseParams,
      usageContext: { userId: null, projectId: null },
    });

    expect(mockGetDb).not.toHaveBeenCalled();
  });

  it('does not throw when DB insert fails (logs error)', async () => {
    const mockInsert = vi.fn().mockReturnValue({
      values: vi.fn().mockRejectedValue(new Error('DB down')),
    });
    mockGetDb.mockReturnValue({ insert: mockInsert } as never);

    mockGenerateText.mockResolvedValue({
      text: 'result',
      usage: { inputTokens: 10, outputTokens: 5, cachedTokens: 0 },
      finishReason: 'stop',
    } as never);

    // Should not throw
    const result = await invokeTextModel({
      ...baseParams,
      usageContext: { userId: 'user-1', projectId: null },
    });

    expect(result.text).toBe('result');
    expect(console.error).toHaveBeenCalledWith(
      'token_usage insert failed:',
      expect.any(Error),
    );
  });

  it('does not record usage when usageContext is not provided', async () => {
    mockGenerateText.mockResolvedValue({
      text: 'result',
      usage: { inputTokens: 10, outputTokens: 5, cachedTokens: 0 },
      finishReason: 'stop',
    } as never);

    await invokeTextModel(baseParams);
    expect(mockGetDb).not.toHaveBeenCalled();
  });
});
