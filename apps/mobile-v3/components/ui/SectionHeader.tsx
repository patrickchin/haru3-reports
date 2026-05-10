import React, { type ReactNode } from 'react';
import { Text, View, type ViewStyle } from 'react-native';
import { createStyleSheet, useStyles } from 'react-native-unistyles';

export interface SectionHeaderProps {
  title: string;
  subtitle?: string;
  icon?: ReactNode;
  trailing?: ReactNode;
  style?: ViewStyle;
}

export function SectionHeader({ title, subtitle, icon, trailing, style }: SectionHeaderProps) {
  const { styles } = useStyles(stylesheet);

  return (
    <View style={[styles.container, style]}>
      <View style={styles.left}>
        {icon ? (
          <View style={styles.iconBox}>{icon}</View>
        ) : null}
        <View style={styles.textCol}>
          <Text style={styles.title}>{title}</Text>
          {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
        </View>
      </View>
      {trailing ?? null}
    </View>
  );
}

const stylesheet = createStyleSheet((theme) => ({
  container: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
  },
  left: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  iconBox: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: theme.radii.sm,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.card,
    marginTop: 2,
  },
  textCol: {
    flex: 1,
    gap: 4,
  },
  title: {
    ...theme.typography.label,
    color: theme.colors.foreground,
  },
  subtitle: {
    ...theme.typography.bodySmall,
    color: theme.colors.mutedForeground,
  },
}));
