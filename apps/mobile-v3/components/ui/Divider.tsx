import React from 'react';
import { View, type ViewStyle } from 'react-native';
import { createStyleSheet, useStyles } from 'react-native-unistyles';

export interface DividerProps {
  style?: ViewStyle;
}

export function Divider({ style }: DividerProps) {
  const { styles } = useStyles(stylesheet);
  return <View style={[styles.line, style]} />;
}

const stylesheet = createStyleSheet((theme) => ({
  line: {
    height: 1,
    backgroundColor: theme.colors.border,
  },
}));
