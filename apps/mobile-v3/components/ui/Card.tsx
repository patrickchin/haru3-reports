import React from 'react';
import { View, type ViewStyle } from 'react-native';
import { createStyleSheet, useStyles } from 'react-native-unistyles';
import { getSurfaceDepthStyle, type SurfaceDepth } from '@/lib/styles/tokens';

type CardVariant = 'default' | 'muted' | 'emphasis' | 'danger';
type CardPadding = 'sm' | 'md' | 'lg';

export interface CardProps {
  children: React.ReactNode;
  variant?: CardVariant;
  padding?: CardPadding;
  depth?: SurfaceDepth;
  style?: ViewStyle;
  testID?: string;
}

const defaultDepths: Record<CardVariant, SurfaceDepth> = {
  default: 'raised',
  muted: 'raised',
  emphasis: 'floating',
  danger: 'raised',
};

export function Card({
  children,
  variant = 'default',
  padding = 'md',
  depth,
  style,
  testID,
}: CardProps) {
  const { styles } = useStyles(stylesheet);
  const resolvedDepth = depth ?? defaultDepths[variant];

  return (
    <View testID={testID} style={[styles.base, styles[`variant_${variant}`], styles[`padding_${padding}`], getSurfaceDepthStyle(resolvedDepth), style]}>
      {children}
    </View>
  );
}

const stylesheet = createStyleSheet((theme) => ({
  base: {
    borderRadius: theme.radii.lg,
  },

  variant_default: {
    backgroundColor: theme.colors.card,
    borderWidth: 1,
    borderColor: theme.colors.border,
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

  padding_sm: { padding: 12 },
  padding_md: { padding: theme.spacing.md },
  padding_lg: { padding: 20 },
}));
