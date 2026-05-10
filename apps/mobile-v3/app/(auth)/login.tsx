import { View, Text } from 'react-native';
import { createStyleSheet, useStyles } from 'react-native-unistyles';

export default function LoginScreen() {
  const { styles } = useStyles(stylesheet);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Login</Text>
      <Text style={styles.subtitle}>Phone OTP login - TODO</Text>
    </View>
  );
}

const stylesheet = createStyleSheet((theme) => ({
  container: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: theme.colors.background },
  title: { ...theme.typography.h1, color: theme.colors.foreground },
  subtitle: { ...theme.typography.body, color: theme.colors.mutedForeground, marginTop: theme.spacing.sm },
}));
