import React from 'react';
import { Text, View, type ViewStyle } from 'react-native';
import { createStyleSheet, useStyles } from 'react-native-unistyles';
import { getSurfaceDepthStyle } from '@/lib/styles/tokens';

export type StatTone = 'default' | 'success' | 'warning' | 'danger' | 'info';

export interface StatTileProps {
  label: string;
  value: string | number;
  tone?: StatTone;
  compact?: boolean;
  style?: ViewStyle;
}

const raised = getSurfaceDepthStyle('raised');

export function StatTile({ label, value, tone = 'default', compact = false, style }: StatTileProps) {
  const { styles } = useStyles(stylesheet);

  return (
    <View style={[styles.base, compact && styles.compact, styles[`tone_${tone}`], raised, style]}>
      <Text style={styles.value}>{value}</Text>
      <Text style={styles.label}>{label}</Text>
    </View>
  );
}

const stylesheet = createStyleSheet((theme) => ({
  base: {
    flex: 1,
    minHeight: 92,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: theme.radii.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.card,
  },
  compact: {
    minHeight: 82,
  },
  value: {
    ...theme.typography.metric,
    color: theme.colors.foreground,
  },
  label: {
    ...theme.typography.label,
    color: theme.colors.mutedForeground,
    marginTop: 4,
  },

  tone_default: {},
  tone_success: { backgroundColor: theme.colors.successSoft, borderColor: theme.colors.successBorder },
  tone_warning: { backgroundColor: theme.colors.warningSoft, borderColor: theme.colors.warningBorder },
  tone_danger: { backgroundColor: theme.colors.dangerSoft, borderColor: theme.colors.dangerBorder },
  tone_info: { backgroundColor: theme.colors.infoSoft, borderColor: theme.colors.infoBorder },
}));
