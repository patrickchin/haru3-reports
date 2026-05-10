import { Stack } from 'expo-router';
import { AudioProvider } from '@/features/audio';
import { UploadQueueProvider } from '@/features/upload-queue';

export default function AppLayout() {
  return (
    <AudioProvider>
      <UploadQueueProvider>
        <Stack screenOptions={{ headerShown: false }} />
      </UploadQueueProvider>
    </AudioProvider>
  );
}
