import React, { useState } from 'react';
import { Text, TextInput, View, type TextInputProps, type ViewStyle } from 'react-native';
import { createStyleSheet, useStyles } from 'react-native-unistyles';

export interface InputProps extends TextInputProps {
  label?: string;
  hint?: string;
  error?: string;
  containerStyle?: ViewStyle;
}

export function Input({ label, hint, error, containerStyle, style, ...rest }: InputProps) {
  const { styles, theme } = useStyles(stylesheet);
  const [focused, setFocused] = useState(false);

  return (
    <View style={[styles.container, containerStyle]}>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      <TextInput
        {...rest}
        placeholderTextColor={theme.colors.mutedForeground}
        onFocus={(e) => {
          setFocused(true);
          rest.onFocus?.(e);
        }}
        onBlur={(e) => {
          setFocused(false);
          rest.onBlur?.(e);
        }}
        style={[
          styles.input,
          focused && styles.inputFocused,
          error ? styles.inputError : undefined,
          style,
        ]}
      />
      {error ? (
        <Text style={styles.error}>{error}</Text>
      ) : hint ? (
        <Text style={styles.hint}>{hint}</Text>
      ) : null}
    </View>
  );
}

const stylesheet = createStyleSheet((theme) => ({
  container: { gap: theme.spacing.xs },
  label: {
    ...theme.typography.label,
    color: theme.colors.foreground,
  },
  input: {
    minHeight: 44,
    borderWidth: 1,
    borderColor: theme.colors.input,
    borderRadius: theme.radii.md,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    color: theme.colors.foreground,
    backgroundColor: theme.colors.card,
    ...theme.typography.body,
  },
  inputFocused: {
    borderColor: theme.colors.ring,
    borderWidth: 2,
  },
  inputError: {
    borderColor: theme.colors.destructive,
    borderWidth: 2,
  },
  hint: {
    ...theme.typography.caption,
    color: theme.colors.mutedForeground,
  },
  error: {
    ...theme.typography.caption,
    color: theme.colors.destructive,
  },
}));
