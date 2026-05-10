import React from 'react';
import { View, type ViewStyle } from 'react-native';
import { createStyleSheet, useStyles } from 'react-native-unistyles';
import { getSurfaceDepthStyle } from '@/lib/styles/tokens';

type CardVariant = 'default' | 'muted' | 'emphasis' | 'danger';
type CardPadding = 'sm' | 'md' | 'lg';

export interface CardProps {
  children: React.ReactNode;
  variant?: CardVariant;
  padding?: CardPadding;
  style?: ViewStyle;
}

export function Card({
  children,
  variant = 'default',
  padding = 'md',
  style,
}: CardProps) {
  const { styles } = useStyles(stylesheet);

  return (
    <View style={[styles.base, styles[`variant_${variant}`], styles[`padding_${padding}`], style]}>
      {children}
    </View>
  );
}

const raised = getSurfaceDepthStyle('raised');

const stylesheet = createStyleSheet((theme) => ({
  base: {
    borderRadius: theme.radii.md,
    overflow: 'hidden',
  },

  variant_default: {
    backgroundColor: theme.colors.card,
    borderWidth: 1,
    borderColor: theme.colors.border,
    ...raised,
  },
  variant_muted: {
    backgroundColor: theme.colors.surfaceMuted,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  variant_emphasis: {
    backgroundColor: theme.colors.surfaceEmphasis,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  variant_danger: {
    backgroundColor: theme.colors.dangerSoft,
    borderWidth: 1,
    borderColor: theme.colors.dangerBorder,
  },

  padding_sm: { padding: theme.spacing.sm },
  padding_md: { padding: theme.spacing.md },
  padding_lg: { padding: theme.spacing.lg },
}));
