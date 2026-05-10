import React from 'react';
import { ActivityIndicator, Pressable, Text, type ViewStyle } from 'react-native';
import { createStyleSheet, useStyles } from 'react-native-unistyles';

type ButtonVariant = 'default' | 'secondary' | 'destructive' | 'outline' | 'ghost' | 'accent';
type ButtonSize = 'sm' | 'default' | 'lg';

export interface ButtonProps {
  children: React.ReactNode;
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  disabled?: boolean;
  onPress?: () => void;
  style?: ViewStyle;
}

export function Button({
  children,
  variant = 'default',
  size = 'default',
  loading = false,
  disabled = false,
  onPress,
  style,
}: ButtonProps) {
  const { styles, theme } = useStyles(stylesheet);

  const textColorMap: Record<ButtonVariant, string> = {
    default: theme.colors.primaryForeground,
    secondary: theme.colors.secondaryForeground,
    destructive: theme.colors.destructiveForeground,
    outline: theme.colors.primary,
    ghost: theme.colors.primary,
    accent: theme.colors.accentForeground,
  };

  const indicatorColor = textColorMap[variant];

  return (
    <Pressable
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
        <ActivityIndicator color={indicatorColor} size="small" />
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

const stylesheet = createStyleSheet((theme) => ({
  base: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: theme.radii.lg,
  },
  pressed: { opacity: 0.7 },
  disabled: { opacity: 0.5 },

  // Variants
  variant_default: { backgroundColor: theme.colors.primary },
  variant_secondary: { backgroundColor: theme.colors.secondary },
  variant_destructive: { backgroundColor: theme.colors.destructive },
  variant_outline: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  variant_ghost: { backgroundColor: 'transparent' },
  variant_accent: { backgroundColor: theme.colors.accent },

  // Sizes
  size_sm: { minHeight: 44, paddingHorizontal: theme.spacing.md, paddingVertical: theme.spacing.xs },
  size_default: { minHeight: 44, paddingHorizontal: theme.spacing.lg, paddingVertical: theme.spacing.sm },
  size_lg: { minHeight: 52, paddingHorizontal: theme.spacing.xl, paddingVertical: theme.spacing.md },

  // Text
  text: { fontWeight: '600' },
  text_sm: { fontSize: 14 },
  text_default: { fontSize: 16 },
  text_lg: { fontSize: 18 },
}));
