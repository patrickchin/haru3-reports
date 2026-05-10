import React from 'react';
import { Text, View, type ViewStyle } from 'react-native';
import type { LucideIcon } from 'lucide-react-native';
import { createStyleSheet, useStyles } from 'react-native-unistyles';

export interface SectionHeaderProps {
  label: string;
  icon?: LucideIcon;
  trailing?: React.ReactNode;
  style?: ViewStyle;
}

export function SectionHeader({ label, icon: Icon, trailing, style }: SectionHeaderProps) {
  const { styles, theme } = useStyles(stylesheet);

  return (
    <View style={[styles.container, style]}>
      <View style={styles.left}>
        {Icon ? <Icon size={16} color={theme.colors.mutedForeground} /> : null}
        <Text style={styles.label}>{label}</Text>
      </View>
      {trailing ?? null}
    </View>
  );
}

const stylesheet = createStyleSheet((theme) => ({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: theme.spacing.sm,
  },
  left: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
  },
  label: {
    ...theme.typography.label,
    color: theme.colors.mutedForeground,
    textTransform: 'uppercase',
  },
}));
