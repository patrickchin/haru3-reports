import React, { useState } from 'react';
import { Text, TextInput, View, type TextInputProps, type ViewStyle } from 'react-native';
import { createStyleSheet, useStyles } from 'react-native-unistyles';
import { getSurfaceDepthStyle } from '@/lib/styles/tokens';

export interface InputProps extends TextInputProps {
  label?: string;
  hint?: string;
  error?: string;
  readOnly?: boolean;
  containerStyle?: ViewStyle;
}

export function Input({ label, hint, error, readOnly, containerStyle, style, ...rest }: InputProps) {
  const { styles, theme } = useStyles(stylesheet);
  const [focused, setFocused] = useState(false);

  return (
    <View style={[styles.container, containerStyle]}>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      <TextInput
        {...rest}
        editable={readOnly ? false : rest.editable}
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
          readOnly && styles.inputReadOnly,
          focused && !readOnly && styles.inputFocused,
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

const raised = getSurfaceDepthStyle('raised');

const stylesheet = createStyleSheet((theme) => ({
  container: { gap: theme.spacing.sm },
  label: {
    ...theme.typography.label,
    color: theme.colors.mutedForeground,
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
    ...raised,
  },
  inputReadOnly: {
    backgroundColor: theme.colors.surfaceMuted,
    ...getSurfaceDepthStyle('flat'),
  },
  inputFocused: {
    borderColor: theme.colors.ring,
  },
  inputError: {
    borderColor: theme.colors.dangerBorder,
  },
  hint: {
    ...theme.typography.bodySmall,
    color: theme.colors.mutedForeground,
  },
  error: {
    ...theme.typography.bodySmall,
    color: theme.colors.dangerText,
  },
}));
