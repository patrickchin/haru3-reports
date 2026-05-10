import { observable } from '@legendapp/state';

export const auth$ = observable({
  session: null as any,
  user: null as any,
  profile: null as { id: string; phone: string; fullName: string | null; companyName: string | null; avatarUrl: string | null } | null,
  isLoading: true,
  isInitialized: false,
});

export const ui$ = observable({
  activeModal: null as string | null,
  isKeyboardVisible: false,
});

export const audio$ = observable({
  isRecording: false,
  recordingDuration: 0,
  playingFileId: null as string | null,
  playbackPosition: 0,
});

export const aiSettings$ = observable({
  provider: 'kimi' as string,
  model: 'kimi-k2-0905-preview' as string,
});
