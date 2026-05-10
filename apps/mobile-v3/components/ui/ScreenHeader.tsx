import React from 'react';
import { Text, View } from 'react-native';
import { ArrowLeft } from 'lucide-react-native';
import { createStyleSheet, useStyles } from 'react-native-unistyles';
import { Button } from './Button';

export interface ScreenHeaderProps {
  title: string;
  subtitle?: string;
  eyebrow?: string;
  titleAccessory?: React.ReactNode;
  onBack?: () => void;
  trailing?: React.ReactNode;
}

export function ScreenHeader({ title, subtitle, eyebrow, titleAccessory, onBack, trailing }: ScreenHeaderProps) {
  const { styles, theme } = useStyles(stylesheet);

  return (
    <View style={styles.container}>
      <View style={styles.row}>
        {onBack ? (
          <Button
            testID="btn-back"
            variant="outline"
            size="default"
            onPress={onBack}
            style={styles.backButton}
          >
            <ArrowLeft size={16} color={theme.colors.foreground} />
          </Button>
        ) : null}

        <View style={[styles.titles, !onBack && styles.titlesNoBack]}>
          {eyebrow ? <Text style={styles.eyebrow}>{eyebrow}</Text> : null}
          <View style={styles.titleRow}>
            <Text testID="screen-header-title" style={styles.title} numberOfLines={1}>{title}</Text>
            {titleAccessory ?? null}
          </View>
          {subtitle ? <Text style={styles.subtitle} numberOfLines={1}>{subtitle}</Text> : null}
        </View>

        <View style={styles.trailing}>{trailing ?? null}</View>
      </View>
    </View>
  );
}

const stylesheet = createStyleSheet((theme) => ({
  container: {
    backgroundColor: theme.colors.background,
    paddingTop: theme.spacing.xs,
    paddingHorizontal: theme.spacing.screen,
    paddingBottom: theme.spacing.sm,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 44,
    gap: theme.spacing.sm,
  },
  backButton: {
    paddingHorizontal: theme.spacing.md,
    borderRadius: theme.radii.md,
  },
  titles: {
    flex: 1,
    alignItems: 'flex-start',
  },
  titlesNoBack: {
    paddingLeft: 0,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
  },
  eyebrow: {
    ...theme.typography.label,
    color: theme.colors.mutedForeground,
  },
  title: {
    ...theme.typography.titleSm,
    color: theme.colors.foreground,
  },
  subtitle: {
    ...theme.typography.body,
    color: theme.colors.mutedForeground,
  },
  trailing: {
    alignItems: 'flex-end',
  },
}));
