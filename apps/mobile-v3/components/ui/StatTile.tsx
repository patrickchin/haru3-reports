import React from 'react';
import { Text, View, type ViewStyle } from 'react-native';
import { createStyleSheet, useStyles } from 'react-native-unistyles';

export type StatTone = 'default' | 'success' | 'warning' | 'danger' | 'info';

export interface StatTileProps {
  label: string;
  value: string | number;
  tone?: StatTone;
  style?: ViewStyle;
}

export function StatTile({ label, value, tone = 'default', style }: StatTileProps) {
  const { styles } = useStyles(stylesheet);

  return (
    <View style={[styles.base, styles[`tone_${tone}`], style]}>
      <Text style={[styles.value, styles[`valueColor_${tone}`]]}>{value}</Text>
      <Text style={styles.label}>{label}</Text>
    </View>
  );
}

const stylesheet = createStyleSheet((theme) => ({
  base: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: theme.spacing.md,
    paddingHorizontal: theme.spacing.sm,
    borderRadius: theme.radii.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.card,
  },
  value: {
    ...theme.typography.titleSm,
    marginBottom: 2,
  },
  label: {
    ...theme.typography.caption,
    color: theme.colors.mutedForeground,
  },

  tone_default: {},
  tone_success: { backgroundColor: theme.colors.successSoft, borderColor: theme.colors.successBorder },
  tone_warning: { backgroundColor: theme.colors.warningSoft, borderColor: theme.colors.warningBorder },
  tone_danger: { backgroundColor: theme.colors.dangerSoft, borderColor: theme.colors.dangerBorder },
  tone_info: { backgroundColor: theme.colors.infoSoft, borderColor: theme.colors.infoBorder },

  valueColor_default: { color: theme.colors.foreground },
  valueColor_success: { color: theme.colors.successText },
  valueColor_warning: { color: theme.colors.warningText },
  valueColor_danger: { color: theme.colors.dangerText },
  valueColor_info: { color: theme.colors.infoText },
}));
