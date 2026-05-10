import { View, Text } from 'react-native';
import { createStyleSheet, useStyles } from 'react-native-unistyles';

export default function ReportDetailScreen() {
  const { styles } = useStyles(stylesheet);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Report Detail</Text>
      <Text style={styles.subtitle}>TODO: Implement</Text>
    </View>
  );
}

const stylesheet = createStyleSheet((theme) => ({
  container: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: theme.colors.background },
  title: { ...theme.typography.h2, color: theme.colors.foreground },
  subtitle: { ...theme.typography.bodySmall, color: theme.colors.mutedForeground, marginTop: theme.spacing.sm },
}));
