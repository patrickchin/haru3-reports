import React from 'react';
import { Text, View, type ViewStyle } from 'react-native';
import { Info, AlertTriangle, AlertCircle, CheckCircle } from 'lucide-react-native';
import { createStyleSheet, useStyles } from 'react-native-unistyles';

export type NoticeTone = 'info' | 'warning' | 'danger' | 'success';

export interface InlineNoticeProps {
  tone?: NoticeTone;
  title?: string;
  message: string;
  style?: ViewStyle;
}

const toneIcons = {
  info: Info,
  warning: AlertTriangle,
  danger: AlertCircle,
  success: CheckCircle,
} as const;

export function InlineNotice({ tone = 'info', title, message, style }: InlineNoticeProps) {
  const { styles } = useStyles(stylesheet);
  const Icon = toneIcons[tone];

  return (
    <View style={[styles.base, styles[`tone_${tone}`], style]}>
      <View style={styles.iconWrap}>
        <Icon size={18} color={styles[`icon_${tone}`].color as string} />
      </View>
      <View style={styles.content}>
        {title ? <Text style={[styles.title, styles[`text_${tone}`]]}>{title}</Text> : null}
        <Text style={[styles.message, styles[`text_${tone}`]]}>{message}</Text>
      </View>
    </View>
  );
}

const stylesheet = createStyleSheet((theme) => ({
  base: {
    flexDirection: 'row',
    padding: theme.spacing.md,
    borderRadius: theme.radii.md,
    borderWidth: 1,
    gap: theme.spacing.sm,
  },
  iconWrap: { paddingTop: 2 },
  content: { flex: 1, gap: 2 },
  title: { fontWeight: '600', fontSize: 14, lineHeight: 20 },
  message: { fontSize: 14, lineHeight: 20 },

  tone_info: { backgroundColor: theme.colors.infoSoft, borderColor: theme.colors.infoBorder },
  tone_warning: { backgroundColor: theme.colors.warningSoft, borderColor: theme.colors.warningBorder },
  tone_danger: { backgroundColor: theme.colors.dangerSoft, borderColor: theme.colors.dangerBorder },
  tone_success: { backgroundColor: theme.colors.successSoft, borderColor: theme.colors.successBorder },

  text_info: { color: theme.colors.infoText },
  text_warning: { color: theme.colors.warningText },
  text_danger: { color: theme.colors.dangerText },
  text_success: { color: theme.colors.successText },

  icon_info: { color: theme.colors.info },
  icon_warning: { color: theme.colors.warning },
  icon_danger: { color: theme.colors.danger },
  icon_success: { color: theme.colors.success },
}));
