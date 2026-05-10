import { describe, it, expect, vi, beforeEach } from 'vitest';

// The mock in __mocks__/react-native.ts stubs Platform.OS as 'ios'.
// platform.ts reads Platform.OS at module scope, so the mock must be set
// before the module is imported.

vi.mock('react-native', () => ({
  Platform: { OS: 'ios' },
}));

describe('platform helpers', () => {
  it('detects iOS', async () => {
    const mod = await import('../platform');
    expect(mod.isIOS).toBe(true);
    expect(mod.isAndroid).toBe(false);
    expect(mod.isWeb).toBe(false);
  });

  it('has correct mono font for iOS', async () => {
    const mod = await import('../platform');
    expect(mod.monoFontFamily).toBe('Menlo');
  });

  it('reads E2E mock env var', async () => {
    const mod = await import('../platform');
    // EXPO_PUBLIC_E2E_MOCK_VOICE_NOTE is not set in test env
    expect(mod.isE2EMock).toBe(false);
  });
});
