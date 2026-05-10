import React from 'react';
import { View, type ViewStyle } from 'react-native';
import { createStyleSheet, useStyles } from 'react-native-unistyles';

type CardVariant = 'default' | 'muted' | 'emphasis';
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

const stylesheet = createStyleSheet((theme) => ({
  base: {
    borderRadius: theme.radii.xl,
    overflow: 'hidden',
  },

  variant_default: {
    backgroundColor: theme.colors.card,
    borderWidth: 1,
    borderColor: theme.colors.border,
    shadowColor: theme.colors.surfaceShadow,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 3,
    elevation: 1,
  },
  variant_muted: {
    backgroundColor: theme.colors.surfaceMuted,
  },
  variant_emphasis: {
    backgroundColor: theme.colors.surfaceEmphasis,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },

  padding_sm: { padding: theme.spacing.sm },
  padding_md: { padding: theme.spacing.md },
  padding_lg: { padding: theme.spacing.lg },
}));
