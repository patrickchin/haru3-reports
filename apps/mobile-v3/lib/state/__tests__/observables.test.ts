import { describe, it, expect, beforeEach } from 'vitest';
import { observable } from '@legendapp/state';
import { auth$, ui$, audio$, aiSettings$ } from '../observables';

describe('observables', () => {
  // ---------------------------------------------------------------------------
  // auth$
  // ---------------------------------------------------------------------------

  describe('auth$', () => {
    it('has correct initial shape', () => {
      const state = auth$.get();
      expect(state.session).toBeNull();
      expect(state.user).toBeNull();
      expect(state.profile).toBeNull();
      expect(state.isLoading).toBe(true);
      expect(state.isInitialized).toBe(false);
    });

    it('can update individual fields', () => {
      auth$.isLoading.set(false);
      expect(auth$.isLoading.get()).toBe(false);
      // Reset
      auth$.isLoading.set(true);
    });

    it('can set profile', () => {
      const profile = {
        id: 'u1',
        phone: '+15551234567',
        fullName: 'Test User',
        companyName: 'ACME',
        avatarUrl: null,
      };
      auth$.profile.set(profile);
      expect(auth$.profile.get()).toEqual(profile);
      // Reset
      auth$.profile.set(null);
    });
  });

  // ---------------------------------------------------------------------------
  // ui$
  // ---------------------------------------------------------------------------

  describe('ui$', () => {
    it('has correct initial shape', () => {
      const state = ui$.get();
      expect(state.activeModal).toBeNull();
      expect(state.isKeyboardVisible).toBe(false);
    });

    it('can toggle keyboard visibility', () => {
      ui$.isKeyboardVisible.set(true);
      expect(ui$.isKeyboardVisible.get()).toBe(true);
      ui$.isKeyboardVisible.set(false);
    });

    it('can set active modal', () => {
      ui$.activeModal.set('confirm-delete');
      expect(ui$.activeModal.get()).toBe('confirm-delete');
      ui$.activeModal.set(null);
    });
  });

  // ---------------------------------------------------------------------------
  // audio$
  // ---------------------------------------------------------------------------

  describe('audio$', () => {
    it('has correct initial shape', () => {
      const state = audio$.get();
      expect(state.isRecording).toBe(false);
      expect(state.recordingDuration).toBe(0);
      expect(state.playingFileId).toBeNull();
      expect(state.playbackPosition).toBe(0);
    });

    it('can update recording state', () => {
      audio$.isRecording.set(true);
      audio$.recordingDuration.set(5);
      expect(audio$.isRecording.get()).toBe(true);
      expect(audio$.recordingDuration.get()).toBe(5);
      // Reset
      audio$.isRecording.set(false);
      audio$.recordingDuration.set(0);
    });

    it('can track playback', () => {
      audio$.playingFileId.set('file-1');
      audio$.playbackPosition.set(3.5);
      expect(audio$.playingFileId.get()).toBe('file-1');
      expect(audio$.playbackPosition.get()).toBe(3.5);
      // Reset
      audio$.playingFileId.set(null);
      audio$.playbackPosition.set(0);
    });
  });

  // ---------------------------------------------------------------------------
  // aiSettings$
  // ---------------------------------------------------------------------------

  describe('aiSettings$', () => {
    it('has correct defaults', () => {
      const state = aiSettings$.get();
      expect(state.provider).toBe('kimi');
      expect(state.model).toBe('kimi-k2-0905-preview');
    });

    it('can change provider and model', () => {
      aiSettings$.provider.set('openai');
      aiSettings$.model.set('gpt-4o');
      expect(aiSettings$.provider.get()).toBe('openai');
      expect(aiSettings$.model.get()).toBe('gpt-4o');
      // Reset
      aiSettings$.provider.set('kimi');
      aiSettings$.model.set('kimi-k2-0905-preview');
    });
  });
});
