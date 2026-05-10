/**
 * Platform detection helpers — consolidated from v1 scattered checks.
 */
import { Platform } from 'react-native';

export const isIOS = Platform.OS === 'ios';
export const isAndroid = Platform.OS === 'android';
export const isWeb = Platform.OS === 'web';

/**
 * Monospace font family appropriate for the current platform.
 */
export const monoFontFamily = isIOS ? 'Menlo' : 'monospace';

/**
 * Whether the current build is running in an E2E/mock environment.
 * Checks EXPO_PUBLIC_E2E_MOCK_VOICE_NOTE (inlined at bundle time).
 */
export const isE2EMock =
  process.env.EXPO_PUBLIC_E2E_MOCK_VOICE_NOTE === 'true';
