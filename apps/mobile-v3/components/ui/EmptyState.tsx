import React from 'react';
import { Text, View } from 'react-native';
import { createStyleSheet, useStyles } from 'react-native-unistyles';
import { getSurfaceDepthStyle } from '@/lib/styles/tokens';

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
      <View style={styles.card}>
        {icon ? <View style={styles.iconBox}>{icon}</View> : null}
        <Text style={styles.title}>{title}</Text>
        {description ? <Text style={styles.description}>{description}</Text> : null}
        {action ? (
          <Button variant="outline" size="sm" onPress={action.onPress} style={styles.action}>
            {action.label}
          </Button>
        ) : null}
      </View>
    </View>
  );
}

const stylesheet = createStyleSheet((theme) => ({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: theme.spacing.screen,
  },
  card: {
    width: '100%',
    alignItems: 'center',
    backgroundColor: theme.colors.surfaceMuted,
    borderRadius: theme.radii.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    paddingVertical: theme.spacing.xl,
    paddingHorizontal: theme.spacing.lg,
    gap: theme.spacing.sm,
  },
  iconBox: {
    width: 64,
    height: 64,
    borderRadius: theme.radii.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: theme.spacing.sm,
    backgroundColor: theme.colors.card,
  },
  title: {
    ...theme.typography.titleSm,
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
