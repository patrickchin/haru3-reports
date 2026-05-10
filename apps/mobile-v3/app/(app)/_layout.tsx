import { Stack } from 'expo-router';
import { AudioProvider } from '@/features/audio';
import { UploadQueueProvider } from '@/features/upload-queue';
import { ErrorBoundary } from '@/components/ui/ErrorBoundary';

export default function AppLayout() {
  return (
    <AudioProvider>
      <UploadQueueProvider>
        <ErrorBoundary inline>
          <Stack
            screenOptions={{
              headerShown: false,
              animation: 'simple_push',
              animationDuration: 80,
            }}
          />
        </ErrorBoundary>
      </UploadQueueProvider>
    </AudioProvider>
  );
}
