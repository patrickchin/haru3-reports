import React, { type ReactNode } from 'react';
import { Text, View } from 'react-native';
import { createStyleSheet, useStyles } from 'react-native-unistyles';
import { Card } from './Card';

export interface EmptyStateProps {
  icon?: ReactNode;
  title: string;
  description: string;
  action?: ReactNode;
  testID?: string;
}

export function EmptyState({ icon, title, description, action, testID }: EmptyStateProps) {
  const { styles } = useStyles(stylesheet);

  return (
    <Card testID={testID} variant="muted" style={styles.card}>
      {icon ? (
        <View style={styles.iconBox}>{icon}</View>
      ) : null}
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.description}>{description}</Text>
      {action ? <View style={styles.action}>{action}</View> : null}
    </Card>
  );
}

const stylesheet = createStyleSheet((theme) => ({
  card: {
    alignItems: 'center',
    paddingVertical: theme.spacing.xl,
  },
  iconBox: {
    width: 64,
    height: 64,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: theme.radii.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.card,
    marginBottom: theme.spacing.md,
  },
  title: {
    ...theme.typography.titleSm,
    color: theme.colors.foreground,
  },
  description: {
    ...theme.typography.body,
    color: theme.colors.mutedForeground,
    textAlign: 'center',
    marginTop: theme.spacing.sm,
  },
  action: {
    marginTop: 20,
  },
}));
