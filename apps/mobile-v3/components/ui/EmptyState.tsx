import React from 'react';
import { Text, View } from 'react-native';
import { createStyleSheet, useStyles } from 'react-native-unistyles';

import { Button } from './Button';

export interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: {
    label: string;
    onPress: () => void;
  };
  testID?: string;
}

export function EmptyState({ icon, title, description, action, testID }: EmptyStateProps) {
  const { styles } = useStyles(stylesheet);

  return (
    <View testID={testID} style={styles.container}>
      {icon ? <View style={styles.iconWrap}>{icon}</View> : null}
      <Text style={styles.title}>{title}</Text>
      {description ? <Text style={styles.description}>{description}</Text> : null}
      {action ? (
        <Button variant="outline" size="sm" onPress={action.onPress} style={styles.action}>
          {action.label}
        </Button>
      ) : null}
    </View>
  );
}

const stylesheet = createStyleSheet((theme) => ({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: theme.spacing.xl,
    gap: theme.spacing.sm,
  },
  iconWrap: {
    marginBottom: theme.spacing.sm,
  },
  title: {
    ...theme.typography.h3,
    color: theme.colors.foreground,
    textAlign: 'center',
  },
  description: {
    ...theme.typography.body,
    color: theme.colors.mutedForeground,
    textAlign: 'center',
  },
  action: {
    marginTop: theme.spacing.md,
  },
}));
