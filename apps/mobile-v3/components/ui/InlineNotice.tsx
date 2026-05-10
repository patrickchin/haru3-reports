import React, { type ReactNode } from 'react';
import { Text, View, type ViewStyle } from 'react-native';
import { createStyleSheet, useStyles } from 'react-native-unistyles';
import { getSurfaceDepthStyle } from '@/lib/styles/tokens';

export type NoticeTone = 'info' | 'warning' | 'danger' | 'success';

export interface InlineNoticeProps {
  tone?: NoticeTone;
  title?: string;
  children: ReactNode;
  style?: ViewStyle;
}

export function InlineNotice({ tone = 'info', title, children, style }: InlineNoticeProps) {
  const { styles } = useStyles(stylesheet);

  return (
    <View style={[styles.base, styles[`tone_${tone}`], style]}>
      {title ? <Text style={[styles.title, styles[`text_${tone}`]]} selectable>{title}</Text> : null}
      {typeof children === 'string' ? (
        <Text style={[styles.message, styles[`text_${tone}`]]} selectable>{children}</Text>
      ) : (
        children
      )}
    </View>
  );
}

const raised = getSurfaceDepthStyle('raised');

const stylesheet = createStyleSheet((theme) => ({
  base: {
    paddingHorizontal: theme.spacing.md,
    paddingVertical: 12,
    borderRadius: theme.radii.md,
    borderWidth: 1,
    ...raised,
  },
  title: { fontWeight: '600', fontSize: 14, lineHeight: 20, marginBottom: 4 },
  message: { fontSize: 14, lineHeight: 20 },

  tone_info: { backgroundColor: theme.colors.infoSoft, borderColor: theme.colors.infoBorder },
  tone_warning: { backgroundColor: theme.colors.warningSoft, borderColor: theme.colors.warningBorder },
  tone_danger: { backgroundColor: theme.colors.dangerSoft, borderColor: theme.colors.dangerBorder },
  tone_success: { backgroundColor: theme.colors.successSoft, borderColor: theme.colors.successBorder },

  text_info: { color: theme.colors.infoText },
  text_warning: { color: theme.colors.warningText },
  text_danger: { color: theme.colors.dangerText },
  text_success: { color: theme.colors.successText },
}));
