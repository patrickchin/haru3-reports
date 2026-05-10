import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ChevronLeft } from 'lucide-react-native';
import { createStyleSheet, useStyles } from 'react-native-unistyles';

export interface ScreenHeaderProps {
  title: string;
  subtitle?: string;
  onBack?: () => void;
  trailing?: React.ReactNode;
}

export function ScreenHeader({ title, subtitle, onBack, trailing }: ScreenHeaderProps) {
  const { styles, theme } = useStyles(stylesheet);
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.container, { paddingTop: insets.top + 8 }]}>
      <View style={styles.row}>
        {onBack ? (
          <Pressable
            testID="btn-back"
            onPress={onBack}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Go back"
            style={({ pressed }) => [styles.back, pressed && styles.backPressed]}
          >
            <ChevronLeft size={24} color={theme.colors.foreground} />
          </Pressable>
        ) : (
          <View style={styles.backSpacer} />
        )}

        <View style={styles.titles}>
          <Text testID="screen-header-title" style={styles.title} numberOfLines={1}>{title}</Text>
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
    paddingHorizontal: theme.spacing.md,
    paddingBottom: theme.spacing.sm,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 44,
  },
  back: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: theme.radii.full,
  },
  backPressed: { opacity: 0.6 },
  backSpacer: { width: 44 },
  titles: {
    flex: 1,
    alignItems: 'center',
  },
  title: {
    ...theme.typography.h3,
    color: theme.colors.foreground,
  },
  subtitle: {
    ...theme.typography.caption,
    color: theme.colors.mutedForeground,
  },
  trailing: {
    width: 44,
    alignItems: 'flex-end',
  },
}));
