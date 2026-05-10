import { View, Text } from 'react-native';
import { Link, Stack } from 'expo-router';

export default function NotFoundScreen() {
  return (
    <>
      <Stack.Screen options={{ title: 'Oops!' }} />
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <Text>This screen doesn't exist.</Text>
        <Link href="/" style={{ marginTop: 16, color: '#3B82F6' }}>Go to home screen</Link>
      </View>
    </>
  );
}
