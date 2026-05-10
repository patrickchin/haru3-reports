import React from 'react';
import { ActivityIndicator, Pressable, Text, View, type ViewStyle } from 'react-native';
import { createStyleSheet, useStyles } from 'react-native-unistyles';
import { getSurfaceDepthStyle } from '@/lib/styles/tokens';

type ButtonVariant =
  | 'default'
  | 'secondary'
  | 'destructive'
  | 'outline'
  | 'ghost'
  | 'accent'
  | 'hero'
  | 'quiet'
  | 'icon';
type ButtonSize = 'sm' | 'default' | 'lg' | 'xl';

export interface ButtonProps {
  children: React.ReactNode;
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  disabled?: boolean;
  onPress?: () => void;
  style?: ViewStyle;
  testID?: string;
}

export function Button({
  children,
  variant = 'default',
  size = 'default',
  loading = false,
  disabled = false,
  onPress,
  style,
  testID,
}: ButtonProps) {
  const { styles, theme } = useStyles(stylesheet);

  const textColorMap: Record<ButtonVariant, string> = {
    default: theme.colors.primaryForeground,
    secondary: theme.colors.secondaryForeground,
    destructive: theme.colors.destructiveSoftText,
    outline: theme.colors.primary,
    ghost: theme.colors.primary,
    accent: theme.colors.accentForeground,
    hero: theme.colors.accentForeground,
    quiet: theme.colors.mutedForeground,
    icon: theme.colors.foreground,
  };

  const indicatorColor = textColorMap[variant];

  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      disabled={disabled || loading}
      accessibilityRole="button"
      style={({ pressed }) => [
        styles.base,
        styles[`variant_${variant}`],
        styles[`size_${size}`],
        pressed && styles.pressed,
        (disabled || loading) && styles.disabled,
        style,
      ]}
    >
      {loading ? (
        <View style={styles.loadingRow}>
          <ActivityIndicator color={indicatorColor} size="small" />
          {typeof children === 'string' ? (
            <Text style={[styles.text, styles[`text_${size}`], { color: indicatorColor, marginLeft: 8 }]}>
              {children}
            </Text>
          ) : null}
        </View>
      ) : typeof children === 'string' ? (
        <Text style={[styles.text, styles[`text_${size}`], { color: textColorMap[variant] }]}>
          {children}
        </Text>
      ) : (
        children
      )}
    </Pressable>
  );
}

const raised = getSurfaceDepthStyle('raised');

const stylesheet = createStyleSheet((theme) => ({
  base: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: theme.radii.md,
    ...raised,
  },
  pressed: { opacity: 0.7 },
  disabled: { opacity: 0.5 },
  loadingRow: { flexDirection: 'row', alignItems: 'center' },

  // Variants
  variant_default: {
    backgroundColor: theme.colors.primary,
    borderWidth: 1,
    borderColor: theme.colors.primary,
  },
  variant_secondary: {
    backgroundColor: theme.colors.secondary,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  variant_destructive: {
    backgroundColor: theme.colors.destructiveSoft,
    borderWidth: 1,
    borderColor: theme.colors.dangerBorder,
  },
  variant_outline: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  variant_ghost: {
    backgroundColor: 'transparent',
    shadowOpacity: 0,
    elevation: 0,
  },
  variant_accent: { backgroundColor: theme.colors.accent },
  variant_hero: {
    backgroundColor: theme.colors.accent,
    ...getSurfaceDepthStyle('floating'),
  },
  variant_quiet: {
    backgroundColor: 'transparent',
    shadowOpacity: 0,
    elevation: 0,
  },
  variant_icon: {
    backgroundColor: 'transparent',
    shadowOpacity: 0,
    elevation: 0,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },

  // Sizes
  size_sm: { minHeight: 36, paddingHorizontal: theme.spacing.md, paddingVertical: theme.spacing.xs },
  size_default: { minHeight: 44, paddingHorizontal: theme.spacing.lg, paddingVertical: theme.spacing.sm },
  size_lg: { minHeight: 52, paddingHorizontal: theme.spacing.xl, paddingVertical: theme.spacing.md },
  size_xl: { minHeight: 60, paddingHorizontal: theme.spacing.xl, paddingVertical: theme.spacing.md },

  // Text
  text: { fontWeight: '600' },
  text_sm: { fontSize: 14 },
  text_default: { fontSize: 16 },
  text_lg: { fontSize: 18 },
  text_xl: { fontSize: 20 },
}));
