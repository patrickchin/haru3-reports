import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Mock all SDK factories before importing the module under test
vi.mock('@ai-sdk/openai', () => ({
  createOpenAI: vi.fn(() => vi.fn((model: string) => ({ provider: 'openai', model }))),
}));
vi.mock('@ai-sdk/anthropic', () => ({
  createAnthropic: vi.fn(() => vi.fn((model: string) => ({ provider: 'anthropic', model }))),
}));
vi.mock('@ai-sdk/google', () => ({
  createGoogleGenerativeAI: vi.fn(() => vi.fn((model: string) => ({ provider: 'google', model }))),
}));
vi.mock('@ai-sdk/openai-compatible', () => ({
  createOpenAICompatible: vi.fn(() => vi.fn((model: string) => ({ provider: 'compatible', model }))),
}));

import {
  isProviderKey,
  getDefaultModel,
  isValidModelForProvider,
  getAvailableProviders,
  getModel,
  PROVIDER_ENV_KEYS,
} from '../ai-providers.js';

describe('ai-providers', () => {
  const savedEnv: Record<string, string | undefined> = {};

  beforeEach(() => {
    // Save and clear all provider env keys
    for (const key of Object.values(PROVIDER_ENV_KEYS)) {
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
  // isProviderKey
  // -----------------------------------------------------------------------
  describe('isProviderKey', () => {
    it('returns true for valid provider keys', () => {
      expect(isProviderKey('openai')).toBe(true);
      expect(isProviderKey('anthropic')).toBe(true);
      expect(isProviderKey('kimi')).toBe(true);
      expect(isProviderKey('google')).toBe(true);
      expect(isProviderKey('zai')).toBe(true);
      expect(isProviderKey('deepseek')).toBe(true);
    });

    it('returns false for invalid provider keys', () => {
      expect(isProviderKey('invalid')).toBe(false);
      expect(isProviderKey('')).toBe(false);
      expect(isProviderKey('OPENAI')).toBe(false);
    });
  });

  // -----------------------------------------------------------------------
  // getDefaultModel
  // -----------------------------------------------------------------------
  describe('getDefaultModel', () => {
    it('returns the default model for each provider', () => {
      expect(getDefaultModel('openai')).toBe('gpt-4o-mini');
      expect(getDefaultModel('anthropic')).toBe('claude-sonnet-4-20250514');
      expect(getDefaultModel('kimi')).toBe('kimi-k2-0905-preview');
    });
  });

  // -----------------------------------------------------------------------
  // isValidModelForProvider
  // -----------------------------------------------------------------------
  describe('isValidModelForProvider', () => {
    it('returns true for a valid model', () => {
      expect(isValidModelForProvider('openai', 'gpt-4o')).toBe(true);
      expect(isValidModelForProvider('openai', 'gpt-4o-mini')).toBe(true);
    });

    it('returns false for an invalid model', () => {
      expect(isValidModelForProvider('openai', 'nonexistent-model')).toBe(false);
    });
  });

  // -----------------------------------------------------------------------
  // getAvailableProviders
  // -----------------------------------------------------------------------
  describe('getAvailableProviders', () => {
    it('returns only providers whose env key is set', () => {
      process.env.OPENAI_API_KEY = 'test-key';
      process.env.ANTHROPIC_API_KEY = 'test-key';

      const available = getAvailableProviders();
      expect(available).toContain('openai');
      expect(available).toContain('anthropic');
      expect(available).not.toContain('google');
      expect(available).not.toContain('deepseek');
    });

    it('returns empty array when no keys are set', () => {
      expect(getAvailableProviders()).toEqual([]);
    });
  });

  // -----------------------------------------------------------------------
  // getModel
  // -----------------------------------------------------------------------
  describe('getModel', () => {
    it('throws when the API key env var is not set', () => {
      expect(() => getModel('openai')).toThrow('OPENAI_API_KEY not set');
    });

    it('returns an instance and the default model when no modelId given', () => {
      process.env.OPENAI_API_KEY = 'sk-test';
      const result = getModel('openai');
      expect(result.modelId).toBe('gpt-4o-mini');
      expect(result.instance).toBeDefined();
    });

    it('uses the requested model when it is in the available list', () => {
      process.env.OPENAI_API_KEY = 'sk-test';
      const result = getModel('openai', 'gpt-4o');
      expect(result.modelId).toBe('gpt-4o');
    });

    it('falls back to the default model when the requested model is invalid', () => {
      process.env.OPENAI_API_KEY = 'sk-test';
      const result = getModel('openai', 'nonexistent');
      expect(result.modelId).toBe('gpt-4o-mini');
    });

    it('falls back to DEFAULT_PROVIDER when provider key is invalid', () => {
      // DEFAULT_PROVIDER is 'kimi', needs MOONSHOT_API_KEY
      process.env.MOONSHOT_API_KEY = 'test-key';
      const result = getModel('not-a-provider');
      expect(result.modelId).toBe('kimi-k2-0905-preview');
    });

    it('creates anthropic provider instance', () => {
      process.env.ANTHROPIC_API_KEY = 'sk-test';
      const result = getModel('anthropic');
      expect(result.modelId).toBe('claude-sonnet-4-20250514');
      expect(result.instance).toBeDefined();
    });

    it('creates google provider instance', () => {
      process.env.GOOGLE_AI_API_KEY = 'sk-test';
      const result = getModel('google');
      expect(result.modelId).toBe('gemini-2.0-flash');
    });

    it('creates zai provider instance (OpenAI-compatible)', () => {
      process.env.ZAI_API_KEY = 'sk-test';
      const result = getModel('zai');
      expect(result.modelId).toBe('glm-4.6');
    });

    it('creates deepseek provider instance (OpenAI-compatible)', () => {
      process.env.DEEPSEEK_API_KEY = 'sk-test';
      const result = getModel('deepseek');
      expect(result.modelId).toBe('deepseek-chat');
    });

    it('creates kimi provider instance (OpenAI-compatible)', () => {
      process.env.MOONSHOT_API_KEY = 'sk-test';
      const result = getModel('kimi');
      expect(result.modelId).toBe('kimi-k2-0905-preview');
    });

    it('respects opts.defaultModels override', () => {
      process.env.OPENAI_API_KEY = 'sk-test';
      const result = getModel('openai', undefined, {
        defaultModels: { openai: 'gpt-4o' },
      });
      expect(result.modelId).toBe('gpt-4o');
    });
  });
});
