import { Redirect } from 'expo-router';
import { View, ActivityIndicator } from 'react-native';
import { use$ } from '@legendapp/state/react';
import { auth$ } from '@/lib/state/observables';

export default function Index() {
  const isLoading = use$(auth$.isLoading);
  const session = use$(auth$.session);
  const profile = use$(auth$.profile);

  if (isLoading) {
    return (
      <View testID="screen-splash" style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  if (!session) {
    return <Redirect href="/(auth)/login" />;
  }

  if (!profile?.fullName) {
    return <Redirect href="/(auth)/onboarding" />;
  }

  return <Redirect href="/(app)/projects" />;
}
